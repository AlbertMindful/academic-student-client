export interface ChaoxingChatGroup {
  id: string;
  name: string;
  description?: string;
  memberCount?: number;
}

export type ChaoxingMessageKind = "text" | "file" | "image" | "video" | "voice" | "activity" | "other";

export interface ChaoxingChatAttachment {
  name: string;
  size?: number;
  kind: Exclude<ChaoxingMessageKind, "text" | "activity" | "other">;
  downloadToken: string;
}

export interface ChaoxingChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  sentAt: string;
  kind: ChaoxingMessageKind;
  text?: string;
  attachment?: ChaoxingChatAttachment;
}

export interface ChaoxingSharedFile {
  id: string;
  name: string;
  size?: number;
  uploadedAt?: string;
  ownerName?: string;
  downloadToken: string;
}

export interface ChaoxingChatsPayload {
  groups: ChaoxingChatGroup[];
}

export interface ChaoxingChatDetailPayload {
  group: ChaoxingChatGroup;
  messages: ChaoxingChatMessage[];
  files: ChaoxingSharedFile[];
}
