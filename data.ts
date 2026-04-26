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
  workerPut(`/session/${session.userId}`, session);
}

export function clearSession(userId: string): void {
  sessions.delete(userId);
  workerDelete(`/session/${userId}`);
}

export function getAllApplications(): SavedApplication[] {
  return Array.from(sessions.values());
}

// ─── Worker client ────────────────────────────────────────────────────────────

const WORKER_URL  = (process.env.WORKER_URL  ?? "").replace(/\/$/, "");
const WORKER_SECRET = process.env.WORKER_SECRET ?? "";

function workerHeaders(): Record<string, string> {
  return {
    "Authorization": `Bearer ${WORKER_SECRET}`,
    "Content-Type":  "application/json",
  };
}

/** Fire-and-forget PUT — writes a session to KV. */
function workerPut(path: string, body: unknown): void {
  if (!WORKER_URL || !WORKER_SECRET) return;
  fetch(`${WORKER_URL}${path}`, {
    method:  "PUT",
    headers: workerHeaders(),
    body:    JSON.stringify(body),
  }).catch((err) => console.error("[worker] PUT error:", err));
}

/** Fire-and-forget DELETE — removes a session from KV. */
function workerDelete(path: string): void {
  if (!WORKER_URL || !WORKER_SECRET) return;
  fetch(`${WORKER_URL}${path}`, {
    method:  "DELETE",
    headers: workerHeaders(),
  }).catch((err) => console.error("[worker] DELETE error:", err));
}

/**
 * Fire-and-forget POST — archives a completed submission to KV.
 * Called once from flows.ts after submitApplication().
 */
export function storeSubmission(session: SavedApplication): void {
  if (!WORKER_URL || !WORKER_SECRET) return;
  fetch(`${WORKER_URL}/submissions`, {
    method:  "POST",
    headers: workerHeaders(),
    body:    JSON.stringify(session),
  }).catch((err) => console.error("[worker] submission store error:", err));
}

/**
 * Loads all sessions from the Worker KV into the in-memory Map.
 * Call this once at bot startup so in-progress sessions survive restarts.
 */
export async function loadSessionsFromWorker(): Promise<void> {
  if (!WORKER_URL || !WORKER_SECRET) {
    console.warn("[worker] WORKER_URL or WORKER_SECRET not set — skipping session restore.");
    return;
  }
  try {
    const res = await fetch(`${WORKER_URL}/sessions`, {
      headers: workerHeaders(),
    });
    if (!res.ok) {
      console.error(`[worker] /sessions returned ${res.status}`);
      return;
    }
    const data = (await res.json()) as SavedApplication[];
    for (const session of data) {
      sessions.set(session.userId, session);
    }
    console.log(`[worker] Restored ${data.length} session(s) from KV.`);
  } catch (err) {
    console.error("[worker] Failed to load sessions:", err);
  }
}
