export type AvatarTone = "green" | "yellow" | "red" | "clay" | "river";

export type ChatKind = "direct" | "group";

export type MessageKind = "text" | "system";

export interface Contact {
  id: string;
  name: string;
  phone: string;
  presence: string;
  tone: AvatarTone;
}

export interface Chat {
  id: string;
  kind: ChatKind;
  name: string;
  members: Contact[];
  memberIds: string[];
  createdAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  authorId: string;
  body: string;
  sentAt: string;
  kind: MessageKind;
}

export interface ChatSummary {
  chat: Chat;
  title: string;
  preview: string;
  lastAt: string;
  unread: number;
  memberCount: number;
  tone: AvatarTone;
  isOnline: boolean;
}
