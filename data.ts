// ─── In-memory session store ──────────────────────────────────────────────────

export interface SavedApplication {
  userId: string;
  step: "pending_start" | "answering" | "review" | "editing_from_review" | "submitted";
  roles: string[];
  answers: Record<string, string>;
  currentQuestionIndex: number;
  startedAt: number;
  questionStartedAt?: number;
  editingQuestionId?: string;
  reviewMessageId?: string;
  logMessageId?: string;
  logChannelId?: string;
  finalEditUsed?: boolean;
  questionMessageIds?: Record<string, string>;
}

const sessions = new Map<string, SavedApplication>();

export function getSession(userId: string): SavedApplication | null {
  return sessions.get(userId) ?? null;
}

export function updateSession(session: SavedApplication): void {
  sessions.set(session.userId, session);
}

export function clearSession(userId: string): void {
  sessions.delete(userId);
}

export function getAllApplications(): SavedApplication[] {
  return Array.from(sessions.values());
}
