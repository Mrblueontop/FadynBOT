/**
 * deadline.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AI-powered deadline parser for FadynBot.
 *
 * Call `resolveDeadline(text)` after the user replies to the deadline question.
 * It sends the raw string to Groq and asks for a concrete Unix timestamp.
 *
 * Returns:
 *   - { timestamp: number }  → AI resolved it confidently
 *   - { timestamp: null }    → AI couldn't parse it (user must re-enter)
 *
 * Requires: GROQ_API_KEY in your .env / Railway environment.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL        = "llama-3.3-70b-versatile";

export interface DeadlineResult {
  timestamp: number | null;
}

const SYSTEM_PROMPT = `
You are a deadline parser for a commission bot.
The user has described their deadline in plain English.
Today's date will be provided in the user message.

Your job: convert their description into a concrete Unix timestamp (seconds since epoch).

Rules:
- Return the END of that day (23:59:59) in UTC unless they say a specific time.
- "ASAP" or "as soon as possible" → 3 days from today.
- "No rush", "whenever", "no deadline" → return null.
- "N/A" or blank → return null.
- Vague answers like "soon", "sometime", "idk" → return null (user must clarify).
- "End of next week" → the Sunday of next week at 23:59:59 UTC.
- "Before Christmas" → December 24 of the current or next year, whichever is closer.
- If you cannot confidently resolve it to a date, return null.

Respond ONLY with valid JSON, no markdown, no extra text:
{ "timestamp": <unix_seconds_integer_or_null> }
`.trim();

export async function resolveDeadline(text: string): Promise<DeadlineResult> {
  const trimmed = text.trim();

  // Fast-path obvious skips
  if (!trimmed || /^(n\/a|none|no deadline|no rush|whenever|-)$/i.test(trimmed)) {
    return { timestamp: null };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  const todayUtc   = new Date().toISOString().split("T")[0]; // e.g. "2025-04-27"

  const userPrompt = `Today's date (UTC): ${todayUtc}\nCurrent Unix timestamp: ${nowSeconds}\n\nUser's deadline: "${trimmed}"`;

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY ?? ""}`,
      },
      body: JSON.stringify({
        model:       MODEL,
        max_tokens:  64,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user",   content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`[deadline] Groq error ${response.status}`);
      return { timestamp: null };
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    const raw  = data.choices[0]?.message?.content ?? "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as { timestamp: number | null };

    // Sanity check: must be in the future and within 2 years
    const ts = parsed.timestamp;
    if (typeof ts === "number" && ts > nowSeconds && ts < nowSeconds + 60 * 60 * 24 * 730) {
      return { timestamp: ts };
    }

    return { timestamp: null };
  } catch (err) {
    console.error("[deadline] parse error:", err);
    return { timestamp: null };
  }
}

/**
 * Builds a Discord dynamic timestamp string showing relative + absolute time.
 * e.g. "<t:1234567890:F> (<t:1234567890:R>)"
 */
export function formatDeadlineTimestamp(ts: number): string {
  return `<t:${ts}:F> (<t:${ts}:R>)`;
}
