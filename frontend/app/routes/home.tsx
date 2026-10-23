import { useEffect, useMemo, useState } from "react";

import { BrandMark } from "~/components/BrandMark";
import { LoaderIcon, XIcon } from "~/components/icons";
import { AuthScreen } from "~/features/auth/AuthScreen";
import { CreateDiscussionDialog } from "~/features/messaging/components/CreateDiscussionDialog";
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
    { title: "N’Teri — Messagerie malienne" },
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
  const [isDiscussionDialogOpen, setIsDiscussionDialogOpen] = useState(false);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);

  const {
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
  const activeContact =
    activeChat?.kind === "direct"
      ? contacts.find(
          (contact) => contact.id === directContactId(activeChat, currentUserId),
        )
      : undefined;

  useEffect(() => {
    if (!activeChatId) {
      return;
    }

    markRead(activeChatId);
  }, [activeChatId, activeMessages.length, markRead]);

  if (status === "loading") {
    return <LoadingScreen />;
  }

  if (status === "anonymous" || !currentUser) {
    return (
      <AuthScreen
        busy={busy}
        error={error}
        onLogin={login}
        onRegister={register}
      />
    );
  }

  const openChat = (chatId: string) => {
    setActiveChatId(chatId);
    markRead(chatId);
    void loadMessages(chatId);
  };

  const handleCreateDiscussion = async (
    contactId: string,
  ): Promise<boolean> => {
    const chatId = await createDirect(contactId);

    if (!chatId) {
      return false;
    }

    setIsDiscussionDialogOpen(false);
    openChat(chatId);

    return true;
  };

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
              busy={busy}
              onSelectChat={openChat}
              onCreateDiscussion={() => setIsDiscussionDialogOpen(true)}
              onCreateGroup={() => setIsGroupDialogOpen(true)}
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
                  onCreateDiscussion={() => setIsDiscussionDialogOpen(true)}
                  onCreateGroup={() => setIsGroupDialogOpen(true)}
                />
              )}
            </main>
          </div>
        </div>
      </div>

      <CreateDiscussionDialog
        open={isDiscussionDialogOpen}
        contacts={contacts}
        currentUserId={currentUserId}
        onClose={() => setIsDiscussionDialogOpen(false)}
        onCreate={handleCreateDiscussion}
      />

      <CreateGroupDialog
        open={isGroupDialogOpen}
        contacts={contacts}
        currentUserId={currentUserId}
        onClose={() => setIsGroupDialogOpen(false)}
        onCreate={handleCreateGroup}
      />
    </div>
  );
}
