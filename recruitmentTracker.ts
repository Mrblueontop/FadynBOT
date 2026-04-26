import type { Message } from "discord.js";

const trackedMessages = new Map<string, Message>();

export function trackRecruitmentMessage(msg: Message): void {
  trackedMessages.set(msg.id, msg);
}

export function getTrackedMessages(): Message[] {
  return Array.from(trackedMessages.values());
}

export function untrackRecruitmentMessage(msgId: string): void {
  trackedMessages.delete(msgId);
}
