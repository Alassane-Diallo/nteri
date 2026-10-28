import { useCallback, useEffect, useRef, useState } from "react";

import {
  currentNotificationPermission,
  enableBrowserNotifications,
  showMessageNotification,
} from "~/features/notifications/browser";
import type { NotificationPermissionState } from "~/features/notifications/browser";
import {
  ensurePushSubscription,
  registerPushNotifications,
  unregisterPushNotifications,
} from "~/features/notifications/push";
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
  OtpRequestResponse,
  OtpVerifyPayload,
  SocketStatus,
} from "./api";
import type { Chat, Contact, Message } from "./types";

export type SessionStatus = "loading" | "anonymous" | "authenticated";
export type OtpVerifyResult = "authenticated" | "requires-name" | "error";

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
    members: conversation.members.map(toContact),
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

function chatTitle(chat: Chat | undefined, currentUserId: string): string {
  if (!chat) {
    return "N’Teri";
  }
  if (chat.kind === "group") {
    return chat.name;
  }

  return (
    chat.members.find((member) => member.id !== currentUserId)?.name ??
    chat.name
  );
}

function notificationBody(message: Message, chat: Chat | undefined): string {
  if (!chat || chat.kind === "direct") {
    return message.body;
  }

  const author = chat.members.find((member) => member.id === message.authorId);

  return author ? `${author.name.split(" ")[0]} : ${message.body}` : message.body;
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
  const [notifications, setNotifications] =
    useState<NotificationPermissionState>("unsupported");
  const [pushEnabled, setPushEnabled] = useState(false);

  const activeChatRef = useRef<string | null>(activeChatId);
  const chatsRef = useRef<Chat[]>([]);

  useEffect(() => {
    setNotifications(currentNotificationPermission());
  }, []);

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
    setPushEnabled(false);
  }, []);

  const expireSession = useCallback(
    (message: string) => {
      void unregisterPushNotifications();
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

  useEffect(() => {
    if (status !== "authenticated") {
      setPushEnabled(false);
      return;
    }

    let cancelled = false;
    void ensurePushSubscription().then((enabled) => {
      if (!cancelled) {
        setPushEnabled(enabled);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [status]);

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

          if (message.kind === "text" && document.hidden && !pushEnabled) {
            const chat = chatsRef.current.find(
              (candidate) => candidate.id === message.chatId,
            );
            showMessageNotification({
              title: chatTitle(chat, currentUser.id),
              body: notificationBody(message, chat),
              chatId: message.chatId,
            });
          }

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
  }, [
    currentUser,
    expireSession,
    pushEnabled,
    refreshConversations,
    status,
  ]);

  const requestOtp = useCallback(
    async (phone: string, email: string): Promise<OtpRequestResponse | null> => {
      setBusy(true);
      setError(null);
      try {
        return await authApi.requestOtp(phone, email);
      } catch (failure) {
        setError(handleFailure(failure));

        return null;
      } finally {
        setBusy(false);
      }
    },
    [handleFailure],
  );

  const verifyOtp = useCallback(
    async (payload: OtpVerifyPayload): Promise<OtpVerifyResult> => {
      setBusy(true);
      setError(null);
      try {
        const response = await authApi.verifyOtp(payload);
        setCurrentUser(toContact(response.user));
        await loadWorkspace(response.user);

        return "authenticated";
      } catch (failure) {
        if (
          failure instanceof ApiError &&
          failure.fields !== null &&
          failure.fields.requiresName === true
        ) {
          setError(failure.message);

          return "requires-name";
        }

        setError(handleFailure(failure));

        return "error";
      } finally {
        setBusy(false);
      }
    },
    [handleFailure, loadWorkspace],
  );

  const logout = useCallback(async () => {
    setBusy(true);
    try {
      await unregisterPushNotifications();
    } catch {
      // Le serveur supprime aussi les abonnements lors de la déconnexion.
    }
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

  const addContact = useCallback(
    async (phone: string, name?: string): Promise<Contact | null> => {
      setError(null);
      try {
        const contact = toContact(await chatApi.addContact(phone, name));
        setContacts((current) => {
          const byId = new Map(current.map((item) => [item.id, item]));
          byId.set(contact.id, contact);

          return Array.from(byId.values()).sort((first, second) =>
            first.name.localeCompare(second.name, "fr"),
          );
        });

        return contact;
      } catch (failure) {
        setError(handleFailure(failure));

        return null;
      }
    },
    [handleFailure],
  );

  const removeContact = useCallback(
    async (contactId: string): Promise<boolean> => {
      setError(null);
      try {
        await chatApi.removeContact(contactId);
        setContacts((current) =>
          current.filter((contact) => contact.id !== contactId),
        );

        return true;
      } catch (failure) {
        setError(handleFailure(failure));

        return false;
      }
    },
    [handleFailure],
  );

  const startDirectChat = useCallback(
    async (contactId: string): Promise<string | null> => {
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

  const enableNotifications = useCallback(async () => {
    const permission = await enableBrowserNotifications();
    setNotifications(permission);
    if (permission === "denied") {
      setError(
        "Les notifications sont bloquées. Autorisez-les dans les réglages du navigateur.",
      );
      setPushEnabled(false);
      return;
    }
    if (permission === "granted") {
      const push = await registerPushNotifications();
      setPushEnabled(push);
    }
  }, []);

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
    notifications,
    busy,
    error,
    requestOtp,
    verifyOtp,
    logout,
    loadMessages,
    sendMessage,
    createGroup,
    addContact,
    removeContact,
    startDirectChat,
    enableNotifications,
    markRead,
    clearError,
  };
}
