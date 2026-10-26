import type {
  Chat,
  ChatSummary,
  Contact,
  Message,
} from "./types";
import { toneFor } from "~/lib/identity";

interface SummarySource {
  chats: Chat[];
  messages: Message[];
  contacts: Contact[];
  unreadByChat: Record<string, number>;
  currentUserId: string;
}

function previewFor(
  message: Message,
  chat: Chat,
  contactsById: Map<string, Contact>,
  currentUserId: string,
): string {
  if (message.kind === "system") {
    return message.body;
  }

  if (message.authorId === currentUserId) {
    return `Vous : ${message.body}`;
  }

  if (chat.kind === "group") {
    const author = contactsById.get(message.authorId);
    const firstName = author?.name.split(" ")[0] ?? "Membre";

    return `${firstName} : ${message.body}`;
  }

  return message.body;
}

export function buildChatSummaries({
  chats,
  messages,
  contacts,
  unreadByChat,
  currentUserId,
}: SummarySource): ChatSummary[] {
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const messagesByChat = new Map<string, Message[]>();

  for (const message of messages) {
    const conversation = messagesByChat.get(message.chatId);

    if (conversation) {
      conversation.push(message);
    } else {
      messagesByChat.set(message.chatId, [message]);
    }
  }

  for (const conversation of messagesByChat.values()) {
    conversation.sort((first, second) =>
      first.sentAt.localeCompare(second.sentAt),
    );
  }

  return chats
    .map((chat) => {
      const conversation = messagesByChat.get(chat.id) ?? [];
      const lastMessage = conversation.at(-1) ?? null;
      const otherMember = chat.memberIds.find(
        (memberId) => memberId !== currentUserId,
      );
      const chatMembersById = new Map(
        chat.members.map((member) => [member.id, member]),
      );
      const contact = otherMember
        ? (chatMembersById.get(otherMember) ??
          contactsById.get(otherMember))
        : undefined;
      const title =
        chat.kind === "direct" ? (contact?.name ?? chat.name) : chat.name;

      return {
        chat,
        title,
        preview: lastMessage
          ? previewFor(lastMessage, chat, chatMembersById, currentUserId)
          : "Démarrez la conversation",
        lastAt: lastMessage?.sentAt ?? chat.createdAt,
        unread: unreadByChat[chat.id] ?? 0,
        memberCount: chat.memberIds.length,
        tone:
          chat.kind === "direct"
            ? (contact?.tone ?? toneFor(title))
            : toneFor(title),
        isOnline:
          chat.kind === "direct" && contact?.presence === "En ligne",
      } satisfies ChatSummary;
    })
    .sort((first, second) => second.lastAt.localeCompare(first.lastAt));
}

export function messagesForChat(
  messages: Message[],
  chatId: string | null,
): Message[] {
  if (!chatId) {
    return [];
  }

  return messages
    .filter((message) => message.chatId === chatId)
    .sort((first, second) => first.sentAt.localeCompare(second.sentAt));
}
