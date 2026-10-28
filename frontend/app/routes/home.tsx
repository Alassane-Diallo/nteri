import { useCallback, useEffect, useMemo, useState } from "react";

import { BrandMark } from "~/components/BrandMark";
import { LoaderIcon, XIcon } from "~/components/icons";
import { AuthScreen } from "~/features/auth/AuthScreen";
import { ContactsDialog } from "~/features/messaging/components/ContactsDialog";
import { CreateGroupDialog } from "~/features/messaging/components/CreateGroupDialog";
import { Conversation } from "~/features/messaging/components/Conversation";
import { Sidebar } from "~/features/messaging/components/Sidebar";
import { WelcomePanel } from "~/features/messaging/components/WelcomePanel";
import {
  buildChatSummaries,
  messagesForChat,
} from "~/features/messaging/selectors";
import type { Chat } from "~/features/messaging/types";
import { useChatStore } from "~/features/messaging/useChatStore";
import { cn } from "~/lib/cn";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "N’Teri - Messagerie malienne" },
    {
      name: "description",
      content:
        "Envoyez des messages et créez des groupes avec N’Teri, une messagerie simple aux couleurs du Mali.",
    },
  ];
}

function directContactId(chat: Chat, currentUserId: string): string | undefined {
  return chat.memberIds.find((memberId) => memberId !== currentUserId);
}

function LoadingScreen() {
  return (
    <main className="page-pattern grid min-h-dvh place-items-center px-6 text-ink">
      <div className="fade-up flex flex-col items-center text-center">
        <BrandMark className="size-16" />
        <p className="mt-5 text-[9px] font-bold uppercase tracking-[0.24em] text-brand">
          N’Teri
        </p>
        <p className="mt-2 flex items-center gap-2 text-[12.5px] font-medium text-muted">
          <LoaderIcon className="size-4 animate-spin" />
          Chargement de vos conversations…
        </p>
      </div>
    </main>
  );
}

export default function Home() {
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [isContactsDialogOpen, setIsContactsDialogOpen] = useState(false);

  const {
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
  } = useChatStore(activeChatId);

  const currentUserId = currentUser?.id ?? "";
  const summaries = useMemo(
    () =>
      currentUser
        ? buildChatSummaries({
            chats,
            messages,
            contacts,
            unreadByChat,
            currentUserId,
          })
        : [],
    [chats, contacts, currentUser, currentUserId, messages, unreadByChat],
  );
  const activeChat =
    chats.find((chat) => chat.id === activeChatId) ?? null;
  const activeMessages = useMemo(
    () => messagesForChat(messages, activeChatId),
    [messages, activeChatId],
  );
  const activeContactId =
    activeChat?.kind === "direct"
      ? directContactId(activeChat, currentUserId)
      : undefined;
  const activeContact = activeContactId
    ? (contacts.find((contact) => contact.id === activeContactId) ??
      activeChat?.members.find((member) => member.id === activeContactId))
    : undefined;

  const openChat = useCallback(
    (chatId: string) => {
      setActiveChatId(chatId);
      markRead(chatId);
      void loadMessages(chatId);
    },
    [loadMessages, markRead],
  );

  useEffect(() => {
    if (!activeChatId) {
      return;
    }

    markRead(activeChatId);
  }, [activeChatId, activeMessages.length, markRead]);

  useEffect(() => {
    const openKnownChat = (chatId?: string) => {
      if (chatId && chats.some((chat) => chat.id === chatId)) {
        openChat(chatId);
      }
    };

    const handleOpenChat = (event: Event) => {
      const detail = (event as CustomEvent<{ chatId?: string }>).detail;
      openKnownChat(detail?.chatId);
    };

    const handleWorkerMessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      if (
        typeof data === "object" &&
        data !== null &&
        "type" in data &&
        (data as { type?: unknown }).type === "nteri:open-chat" &&
        "chatId" in data
      ) {
        openKnownChat((data as { chatId?: string }).chatId);
      }
    };

    window.addEventListener("nteri:open-chat", handleOpenChat);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleWorkerMessage);
    }

    return () => {
      window.removeEventListener("nteri:open-chat", handleOpenChat);
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener(
          "message",
          handleWorkerMessage,
        );
      }
    };
  }, [chats, openChat]);

  useEffect(() => {
    if (status !== "authenticated" || chats.length === 0) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const target = params.get("chat");
    if (!target) {
      return;
    }

    params.delete("chat");
    const query = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
    if (chats.some((chat) => chat.id === target)) {
      openChat(target);
    }
  }, [chats, openChat, status]);

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (status === "anonymous" || !currentUser) {
    return (
      <AuthScreen
        busy={busy}
        error={error}
        onRequestOtp={requestOtp}
        onVerifyOtp={verifyOtp}
      />
    );
  }

  const handleCreateGroup = async (
    name: string,
    memberIds: string[],
  ): Promise<boolean> => {
    const chatId = await createGroup({ name, memberIds });

    if (!chatId) {
      return false;
    }

    setIsGroupDialogOpen(false);
    openChat(chatId);

    return true;
  };

  const handleStartDirectChat = async (contactId: string): Promise<boolean> => {
    const chatId = await startDirectChat(contactId);
    if (!chatId) {
      return false;
    }

    setIsContactsDialogOpen(false);
    openChat(chatId);

    return true;
  };

  return (
    <div className="page-pattern h-dvh w-full overflow-hidden text-ink">
      {error && (
        <div
          role="alert"
          className="fixed left-1/2 top-4 z-50 flex w-[min(92vw,520px)] -translate-x-1/2 items-start gap-3 rounded-2xl border border-danger/25 bg-surface px-4 py-3 text-[11.5px] font-medium leading-relaxed text-danger shadow-pop"
        >
          <span className="min-w-0 flex-1">{error}</span>
          <button
            type="button"
            onClick={clearError}
            aria-label="Fermer le message d’erreur"
            className="-mr-1 grid size-7 shrink-0 place-items-center rounded-full text-danger transition-colors hover:bg-danger-soft"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      )}

      <div className="mx-auto flex h-full max-w-[1560px] flex-col md:p-3 lg:p-5 xl:p-6">
        <div className="shadow-frame flex min-h-0 flex-1 flex-col overflow-hidden border-line bg-surface md:rounded-[28px] md:border">
          <div className="mali-gradient h-1.5 shrink-0" aria-hidden="true" />

          <div className="flex min-h-0 flex-1">
            <Sidebar
              summaries={summaries}
              currentUser={currentUser}
              activeChatId={activeChatId}
              socketStatus={socketStatus}
              notifications={notifications}
              busy={busy}
              onSelectChat={openChat}
              onCreateGroup={() => setIsGroupDialogOpen(true)}
              onOpenContacts={() => setIsContactsDialogOpen(true)}
              onEnableNotifications={() => void enableNotifications()}
              onLogout={() => void logout()}
              className={activeChat ? "hidden md:flex" : "flex"}
            />

            <main
              className={cn(
                "min-h-0 min-w-0 flex-1 flex-col",
                activeChat ? "flex" : "hidden md:flex",
              )}
            >
              {activeChat ? (
                <Conversation
                  key={activeChat.id}
                  chat={activeChat}
                  contact={activeContact}
                  contacts={contacts}
                  currentUserId={currentUserId}
                  messages={activeMessages}
                  onBack={() => setActiveChatId(null)}
                  onSend={(body) => sendMessage(activeChat.id, body)}
                />
              ) : (
                <WelcomePanel
                  onCreateGroup={() => setIsGroupDialogOpen(true)}
                  onOpenContacts={() => setIsContactsDialogOpen(true)}
                />
              )}
            </main>
          </div>
        </div>
      </div>

      <CreateGroupDialog
        open={isGroupDialogOpen}
        contacts={contacts}
        currentUserId={currentUserId}
        onClose={() => setIsGroupDialogOpen(false)}
        onCreate={handleCreateGroup}
      />

      <ContactsDialog
        open={isContactsDialogOpen}
        contacts={contacts}
        onClose={() => setIsContactsDialogOpen(false)}
        onAdd={addContact}
        onRemove={removeContact}
        onStartChat={handleStartDirectChat}
      />
    </div>
  );
}
