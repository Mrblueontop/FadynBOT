/**
 * moderation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * AI-powered answer moderation for FadynBot.
 *
 * Call `moderateAnswers(answers)` inside sendReviewEmbed (before building the
 * embed) to catch gibberish, troll, or low-effort submissions.
 *
 * Call `moderateUiElements(buttons, frames)` right after Step 4 is submitted
 * to validate that the user entered real UI element names.
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
  reason: string;
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
  { id: "projectTitle",       label: "Project Title" },
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

// ─── UI Elements system prompt ────────────────────────────────────────────────

const UI_ELEMENTS_SYSTEM_PROMPT = `
You are a moderation assistant for a Roblox UI commission bot.
Your job is to check if the "Buttons Needed" and "Frames Needed" fields
from a commission form contain real, sensible Roblox UI element names.

A valid answer contains real UI names such as:
- Buttons: Play, Shop, Inventory, Settings, Back, Close, Confirm, etc.
- Frames: Main Menu, HUD, Leaderboard, Shop Screen, Loading Screen, Cutscene, etc.

Flag a field if it:
- Is random keyboard mashing (e.g. "oo", "pp", "asd", "xyz", "qwerty")
- Is a single letter or number (e.g. "a", "1", "x")
- Contains words that are completely unrelated to UI elements
- Is gibberish or a placeholder that doesn't describe actual UI components

Do NOT flag:
- Abbreviated but recognisable names (e.g. "inv" for inventory, "lb" for leaderboard)
- Single valid UI names (e.g. buttons = "Play")
- Creative game-specific UI names that still make sense in context
- Fields that were left blank (blank = not provided, skip validation for that field)

For EACH field provided, decide: pass or fail.
Respond ONLY with valid JSON, no markdown fences, no extra text:
{
  "results": [
    { "id": "<field_id>", "passed": true },
    { "id": "<field_id>", "passed": false, "reason": "<short reason, max 80 chars>" }
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
      return { passed: true, flags: [] };
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    const text = data.choices[0]?.message?.content ?? "";
    return parseModerationResponse(text, FIELDS_TO_CHECK);
  } catch (err) {
    console.error("[moderation] fetch error:", err);
    return { passed: true, flags: [] };
  }
}

/**
 * Validates Step 4 (UI Frames Needed) using AI.
 * Checks that "buttons_needed" and "frames_needed" contain real UI element names.
 *
 * Pass the raw string values from the modal fields.
 * Either can be an empty string (blank = skipped, not validated).
 *
 * Returns immediately with passed=true if Groq is unavailable (fail-open).
 */
export async function moderateUiElements(
  buttonsVal: string,
  framesVal: string
): Promise<ModerationResult> {
  const toCheck: { id: string; label: string; value: string }[] = [];
  if (buttonsVal) toCheck.push({ id: "buttons_needed", label: "Buttons Needed", value: buttonsVal });
  if (framesVal)  toCheck.push({ id: "frames_needed",  label: "Frames Needed",  value: framesVal });

  // Both fields blank — treat as no input, fail the whole thing
  if (toCheck.length === 0) {
    return {
      passed: false,
      flags: [
        {
          questionId: "uiRequirementType",
          label: "UI Frames Needed",
          reason: "Please fill in at least one field — Buttons Needed or Frames Needed.",
        },
      ],
    };
  }

  const userPrompt = [
    "Please validate these UI element fields from a Roblox commission form:",
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
        max_tokens: 256,
        temperature: 0,
        messages: [
          { role: "system", content: UI_ELEMENTS_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`[moderation] Groq UI check error ${response.status}`);
      return { passed: true, flags: [] }; // fail-open
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    const text = data.choices[0]?.message?.content ?? "";

    const uiFields: { id: string; label: string }[] = [
      { id: "buttons_needed", label: "Buttons Needed" },
      { id: "frames_needed",  label: "Frames Needed" },
    ];

    return parseModerationResponse(text, uiFields);
  } catch (err) {
    console.error("[moderation] UI elements fetch error:", err);
    return { passed: true, flags: [] }; // fail-open
  }
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parseModerationResponse(
  text: string,
  fieldDefs: { id: string; label: string }[]
): ModerationResult {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as {
      results: { id: string; passed: boolean; reason?: string }[];
    };

    const flags: ModerationFlag[] = [];

    for (const result of parsed.results) {
      if (!result.passed) {
        const field = fieldDefs.find((f) => f.id === result.id);
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
    return { passed: true, flags: [] };
  }
}

// ─── Warning embed builders ───────────────────────────────────────────────────

/**
 * Builds the warning message sent to the user when general moderation fails.
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
        "Some of your answers don't look correct. Click **Fix Now** to update the flagged fields — they'll be pre-filled so you can quickly edit them.",
        "",
        ...flagLines,
        "",
        "Your other answers are saved. Only the flagged fields need to be updated.",
        "",
        "Your progress is saved — just fix the flagged fields.",
      ].join("\n")
    )
    .setColor(0xe67e22)
    .setFooter({ text: "Your progress is saved — only fix the flagged fields." });

  const fixBtn = new ButtonBuilder()
    .setCustomId("moderation:fix")
    .setLabel("Fix Now")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("✏️");

  const cancelBtn = new ButtonBuilder()
    .setCustomId("review:cancel")
    .setLabel("Cancel Request")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("✖️");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(fixBtn, cancelBtn);

  return { embeds: [embed], components: [row] };
}

/**
 * Builds the warning message shown to the user when Step 4 (UI elements) fails validation.
 * Has an "Edit" button to reopen the modal and a "Cancel" button.
 */
export function buildUiElementsModerationWarning(
  result: ModerationResult,
  strikesLeft?: number
): MessageCreateOptions {
  const flagLines = result.flags.map(
    (f) => `> **${f.label}** — ${f.reason}`
  );

  const strikeWarning =
    strikesLeft === 1
      ? "\n⚠️ **Last chance** — one more invalid attempt will cancel your application."
      : strikesLeft !== undefined
      ? `\n⚠️ **${strikesLeft} attempt${strikesLeft === 1 ? "" : "s"} remaining** before your application is cancelled.`
      : "";

  const embed = new EmbedBuilder()
    .setTitle("⚠️ Step 4: Invalid UI Elements")
    .setDescription(
      [
        "The UI elements you entered don\'t look like real names. Please go back and enter actual button or frame names.",
        "",
        ...flagLines,
        "",
        "**Examples of valid answers:**",
        "> Buttons: `Play, Shop, Inventory, Settings, Back`",
        "> Frames: `Main Menu, HUD, Shop Screen, Leaderboard`",
        "",
        "Hit **Edit** to fix your answer." + strikeWarning,
      ].join("\n")
    )
    .setColor(strikesLeft === 1 ? 0xe74c3c : 0xe67e22)
    .setFooter({ text: "Step 4 of 11 • Please enter real UI element names" });

  const editBtn = new ButtonBuilder()
    .setCustomId("ui_elements:edit")
    .setLabel("Edit UI Elements")
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
