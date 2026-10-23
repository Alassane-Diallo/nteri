import type { Chat, Contact, Message } from "../types";
import { ChatHeader } from "./ChatHeader";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";

interface ConversationProps {
  chat: Chat;
  contact?: Contact;
  contacts: Contact[];
  currentUserId: string;
  messages: Message[];
  onBack: () => void;
  onSend: (body: string) => Promise<boolean>;
}

export function Conversation({
  chat,
  contact,
  contacts,
  currentUserId,
  messages,
  onBack,
  onSend,
}: ConversationProps) {
  const firstName = contact?.name.split(" ")[0];
  const placeholder =
    chat.kind === "group"
      ? "Écrire dans le groupe…"
      : `Écrire à ${firstName ?? "ce contact"}…`;

  return (
    <section
      aria-label={`Conversation avec ${chat.name}`}
      className="flex h-full min-h-0 flex-1 flex-col bg-surface"
    >
      <ChatHeader
        chat={chat}
        contact={contact}
        contacts={contacts}
        currentUserId={currentUserId}
        onBack={onBack}
      />
      <MessageList
        chat={chat}
        messages={messages}
        contacts={contacts}
        currentUserId={currentUserId}
      />
      <Composer placeholder={placeholder} onSend={onSend} />
    </section>
  );
}
