import { useCallback, useEffect, useRef, useState } from "react";

import { toneFor } from "~/lib/identity";
import {
  ApiError,
  authApi,
  chatApi,
  connectInbox,
} from "./api";
import type {
  ApiConversation,
  ApiMessage,
  ApiUser,
  InboxEvent,
  LoginPayload,
  RegisterPayload,
  SocketStatus,
} from "./api";
import type { Chat, Contact, Message } from "./types";

export type SessionStatus = "loading" | "anonymous" | "authenticated";

interface NewGroupInput {
  name: string;
  memberIds: string[];
}

function toContact(user: ApiUser): Contact {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone ?? "",
    presence: user.presence,
    tone: toneFor(user.name),
  };
}

function toChat(conversation: ApiConversation): Chat {
  return {
    id: conversation.id,
    kind: conversation.kind,
    name: conversation.name,
    memberIds: conversation.memberIds,
    createdAt: conversation.createdAt,
  };
}

function toMessage(message: ApiMessage): Message {
  return {
    id: message.id,
    chatId: message.chatId,
    authorId: message.authorId,
    body: message.body,
    sentAt: message.sentAt,
    kind: message.kind,
  };
}

function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  if (incoming.length === 0) {
    return current;
  }

  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, message);
  }

  return Array.from(byId.values()).sort((first, second) =>
    first.sentAt.localeCompare(second.sentAt),
  );
}

function mergeChats(current: Chat[], incoming: Chat[]): Chat[] {
  if (incoming.length === 0) {
    return current;
  }

  const byId = new Map(current.map((chat) => [chat.id, chat]));
  for (const chat of incoming) {
    byId.set(chat.id, chat);
  }

  return Array.from(byId.values());
}

function lastMessages(conversations: ApiConversation[]): Message[] {
  return conversations
    .map((conversation) => conversation.lastMessage)
    .filter((message): message is ApiMessage => message !== null)
    .map(toMessage);
}

function unreadMap(conversations: ApiConversation[]): Record<string, number> {
  return Object.fromEntries(
    conversations.map((conversation) => [conversation.id, conversation.unread]),
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }

  return "Une erreur inattendue est survenue.";
}

export function useChatStore(activeChatId: string | null) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [currentUser, setCurrentUser] = useState<Contact | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadByChat, setUnreadByChat] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>("offline");

  const activeChatRef = useRef<string | null>(activeChatId);
  const chatsRef = useRef<Chat[]>([]);

  useEffect(() => {
    activeChatRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  const clearWorkspace = useCallback(() => {
    setCurrentUser(null);
    setContacts([]);
    setChats([]);
    setMessages([]);
    setUnreadByChat({});
    setSocketStatus("offline");
  }, []);

  const expireSession = useCallback(
    (message: string) => {
      clearWorkspace();
      setStatus("anonymous");
      setError(message);
    },
    [clearWorkspace],
  );

  const handleFailure = useCallback(
    (failure: unknown): string => {
      if (failure instanceof ApiError && failure.status === 401) {
        expireSession("Votre session a expiré. Reconnectez-vous.");

        return "Votre session a expiré. Reconnectez-vous.";
      }

      return errorMessage(failure);
    },
    [expireSession],
  );

  const loadWorkspace = useCallback(async (knownUser?: ApiUser) => {
    const me = knownUser ?? (await authApi.me());
    const [contactList, conversations] = await Promise.all([
      chatApi.contacts(),
      chatApi.conversations(),
    ]);

    setCurrentUser(toContact(me));
    setContacts(contactList.map(toContact));
    setChats(conversations.map(toChat));
    setMessages((current) => mergeMessages(current, lastMessages(conversations)));
    setUnreadByChat(unreadMap(conversations));
    setStatus("authenticated");
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        await loadWorkspace();
      } catch (failure) {
        if (cancelled) {
          return;
        }

        if (
          failure instanceof ApiError &&
          (failure.status === 401 || failure.status === 403)
        ) {
          setStatus("anonymous");
          return;
        }

        setError(errorMessage(failure));
        setStatus("anonymous");
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [loadWorkspace]);

  const refreshConversations = useCallback(async () => {
    try {
      const conversations = await chatApi.conversations();
      setChats((current) => mergeChats(current, conversations.map(toChat)));
      setMessages((current) =>
        mergeMessages(current, lastMessages(conversations)),
      );
      setUnreadByChat(unreadMap(conversations));
    } catch (failure) {
      handleFailure(failure);
    }
  }, [handleFailure]);

  useEffect(() => {
    if (status !== "authenticated" || currentUser === null) {
      return;
    }

    const disconnect = connectInbox(
      (event: InboxEvent) => {
        if (event.type === "message.created") {
          const message = toMessage(event.message);
          const isActive = activeChatRef.current === message.chatId;

          setMessages((current) => mergeMessages(current, [message]));
          setUnreadByChat((current) => ({
            ...current,
            [message.chatId]: isActive ? 0 : event.unread,
          }));

          if (!chatsRef.current.some((chat) => chat.id === message.chatId)) {
            void refreshConversations();
          } else if (isActive) {
            void chatApi.markRead(message.chatId).catch(() => undefined);
          }
          return;
        }

        if (event.type === "conversation.created") {
          void refreshConversations();
        }
      },
      setSocketStatus,
      () => expireSession("Votre session a expiré. Reconnectez-vous."),
    );

    return disconnect;
  }, [currentUser, expireSession, refreshConversations, status]);

  const login = useCallback(
    async (payload: LoginPayload): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const response = await authApi.login(payload);
        setCurrentUser(toContact(response.user));
        await loadWorkspace(response.user);

        return true;
      } catch (failure) {
        setError(handleFailure(failure));

        return false;
      } finally {
        setBusy(false);
      }
    },
    [handleFailure, loadWorkspace],
  );

  const register = useCallback(
    async (payload: RegisterPayload): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const response = await authApi.register(payload);
        setCurrentUser(toContact(response.user));
        await loadWorkspace(response.user);

        return true;
      } catch (failure) {
        setError(handleFailure(failure));

        return false;
      } finally {
        setBusy(false);
      }
    },
    [handleFailure, loadWorkspace],
  );

  const logout = useCallback(async () => {
    setBusy(true);
    try {
      await authApi.logout();
    } catch {
      // La session locale est effacée même si le serveur ne répond plus.
    } finally {
      clearWorkspace();
      setStatus("anonymous");
      setError(null);
      setBusy(false);
    }
  }, [clearWorkspace]);

  const loadMessages = useCallback(
    async (chatId: string) => {
      try {
        const page = await chatApi.messages(chatId);
        setMessages((current) =>
          mergeMessages(current, page.messages.map(toMessage)),
        );
      } catch (failure) {
        setError(handleFailure(failure));
      }
    },
    [handleFailure],
  );

  const sendMessage = useCallback(
    async (chatId: string, body: string): Promise<boolean> => {
      const cleanBody = body.trim();
      if (!cleanBody) {
        return false;
      }

      setError(null);
      try {
        const message = toMessage(await chatApi.sendMessage(chatId, cleanBody));
        setMessages((current) => mergeMessages(current, [message]));
        setUnreadByChat((current) => ({ ...current, [chatId]: 0 }));

        return true;
      } catch (failure) {
        setError(handleFailure(failure));

        return false;
      }
    },
    [handleFailure],
  );

  const createDirect = useCallback(
    async (contactId: string): Promise<string | null> => {
      if (!contactId) {
        setError("Sélectionnez une personne pour démarrer la discussion.");

        return null;
      }

      setError(null);
      try {
        const conversation = await chatApi.createDirect(contactId);
        const chat = toChat(conversation);
        setChats((current) => mergeChats(current, [chat]));
        if (conversation.lastMessage) {
          setMessages((current) =>
            mergeMessages(current, [toMessage(conversation.lastMessage!)]),
          );
        }
        setUnreadByChat((current) => ({ ...current, [chat.id]: 0 }));

        return chat.id;
      } catch (failure) {
        setError(handleFailure(failure));

        return null;
      }
    },
    [handleFailure],
  );

  const createGroup = useCallback(
    async (input: NewGroupInput): Promise<string | null> => {
      const name = input.name.trim();
      if (name.length < 2 || input.memberIds.length < 2) {
        setError("Un groupe requiert un nom et au moins deux membres.");

        return null;
      }

      setError(null);
      try {
        const conversation = await chatApi.createGroup(name, input.memberIds);
        const chat = toChat(conversation);
        setChats((current) => mergeChats(current, [chat]));
        if (conversation.lastMessage) {
          setMessages((current) =>
            mergeMessages(current, [toMessage(conversation.lastMessage!)]),
          );
        }
        setUnreadByChat((current) => ({ ...current, [chat.id]: 0 }));

        return chat.id;
      } catch (failure) {
        setError(handleFailure(failure));

        return null;
      }
    },
    [handleFailure],
  );

  const markRead = useCallback(
    (chatId: string) => {
      setUnreadByChat((current) => {
        if (!current[chatId]) {
          return current;
        }

        return { ...current, [chatId]: 0 };
      });
      // Action de confort : une erreur ne doit pas interrompre la session.
      void chatApi.markRead(chatId).catch(() => undefined);
    },
    [],
  );

  const clearError = useCallback(() => setError(null), []);

  return {
    status,
    currentUser,
    contacts,
    chats,
    messages,
    unreadByChat,
    socketStatus,
    busy,
    error,
    login,
    register,
    logout,
    loadMessages,
    sendMessage,
    createDirect,
    createGroup,
    markRead,
    clearError,
  };
}
