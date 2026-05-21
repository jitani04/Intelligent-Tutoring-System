import type { Conversation } from "./types";

function timestampValue(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function conversationLastActivityTime(conversation: Conversation): number {
  return conversation.messages.reduce(
    (latest, message) => Math.max(latest, timestampValue(message.created_at)),
    timestampValue(conversation.created_at),
  );
}

export function sortConversationsByRecentActivity(a: Conversation, b: Conversation): number {
  return conversationLastActivityTime(b) - conversationLastActivityTime(a) || b.id - a.id;
}
