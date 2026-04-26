/**
 * moderation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AI-powered answer moderation for FadynBot.
 *
 * Call `moderateAnswers(answers)` inside sendReviewEmbed (before building the
 * embed) to catch gibberish, troll, or low-effort submissions.
 *
 * Returns a `ModerationResult`:
 *   - passed: true  → carry on as normal
 *   - passed: false → send a warning embed back to the user listing which
 *                     answers need fixing, block submit until edited
 *
 * Requires: GROQ_API_KEY in your .env / Railway environment variables.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type MessageCreateOptions,
} from "discord.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ModerationFlag {
  questionId: string;
  label: string;
  reason: string; // short human-readable reason
}

export interface ModerationResult {
  passed: boolean;
  flags: ModerationFlag[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

/** Fields the AI must evaluate — label shown in the warning embed. */
const FIELDS_TO_CHECK: { id: string; label: string }[] = [
  { id: "name",               label: "Name" },
  { id: "projectName",        label: "Project Name" },
  { id: "projectDescription", label: "Project Description" },
  { id: "colorScheme",        label: "Color Scheme" },
  { id: "extraInfo",          label: "Extra Info" },
];

const SYSTEM_PROMPT = `
You are a moderation assistant for a Roblox UI commission bot.
Your job is to check client intake answers for low quality, gibberish, or troll content.

Flag a field if it:
- Is random keyboard mashing (e.g. "asdfghjkl", "qwerty", "aaaaa", "ekldmtrtyrmt")
- Is a single meaningless character or letter (e.g. "l", "x", "ff")
- Is completely off-topic or nonsensical for a commission form
- Contains offensive or inappropriate content
- Is too vague to act on (e.g. name = "ok", project description = "game")

Do NOT flag:
- Short but valid answers (e.g. name = "Jake", project = "Tag Game")
- "N/A" or similar skip responses on optional fields
- Answers that are brief but clearly genuine
- Color codes like "#ff0000" or "blue and white"

For EACH field provided, decide: pass or fail.
Respond ONLY with valid JSON, no markdown fences, no extra text:
{
  "results": [
    { "id": "<field_id>", "passed": true },
    { "id": "<field_id>", "passed": false, "reason": "<short reason, max 60 chars>" }
  ]
}
`.trim();

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Runs AI moderation on the free-text answers.
 * Returns immediately with passed=true if Groq is unavailable (fail-open).
 */
export async function moderateAnswers(
  answers: Record<string, string>
): Promise<ModerationResult> {
  // Build a compact payload of only the fields we care about
  const toCheck = FIELDS_TO_CHECK
    .map((f) => ({ id: f.id, label: f.label, value: answers[f.id] ?? "" }))
    .filter((f) => f.value && f.value !== "N/A");

  if (toCheck.length === 0) return { passed: true, flags: [] };

  const userPrompt = [
    "Please moderate these commission form answers:",
    "",
    ...toCheck.map((f) => `[${f.id}] ${f.label}: "${f.value}"`),
  ].join("\n");

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY ?? ""}`,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        temperature: 0,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`[moderation] Groq error ${response.status}`);
      return { passed: true, flags: [] }; // fail-open
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    const text = data.choices[0]?.message?.content ?? "";
    return parseModerationResponse(text);
  } catch (err) {
    console.error("[moderation] fetch error:", err);
    return { passed: true, flags: [] }; // fail-open
  }
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseModerationResponse(text: string): ModerationResult {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as {
      results: { id: string; passed: boolean; reason?: string }[];
    };

    const flags: ModerationFlag[] = [];

    for (const result of parsed.results) {
      if (!result.passed) {
        const field = FIELDS_TO_CHECK.find((f) => f.id === result.id);
        if (field) {
          flags.push({
            questionId: result.id,
            label: field.label,
            reason: (result.reason ?? "Answer appears invalid or low-effort").slice(0, 80),
          });
        }
      }
    }

    return { passed: flags.length === 0, flags };
  } catch {
    console.error("[moderation] Failed to parse response:", text);
    return { passed: true, flags: [] }; // fail-open on parse error
  }
}

// ─── Warning embed builder ────────────────────────────────────────────────────

/**
 * Builds the warning message sent to the user when moderation fails.
 * Shows exactly which fields need fixing and why.
 */
export function buildModerationWarningPayload(
  result: ModerationResult
): MessageCreateOptions {
  const flagLines = result.flags.map(
    (f) => `> **${f.label}** — ${f.reason}`
  );

  const embed = new EmbedBuilder()
    .setTitle("⚠️ Please Fix Your Answers")
    .setDescription(
      [
        "Some of your answers don't look right. Please edit them before submitting.",
        "",
        ...flagLines,
        "",
        "Hit **Edit Answers** to go back and fix them.",
      ].join("\n")
    )
    .setColor(0xe67e22)
    .setFooter({ text: "Your progress is saved — just fix the flagged fields." });

  const editBtn = new ButtonBuilder()
    .setCustomId("review:edit")
    .setLabel("Edit Answers")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("✏️");

  const cancelBtn = new ButtonBuilder()
    .setCustomId("review:cancel")
    .setLabel("Cancel Request")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("✖️");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(editBtn, cancelBtn);

  return { embeds: [embed], components: [row] };
}
