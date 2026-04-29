/**
 * questions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * All commission intake questions for FadynBot.
 *
 * Question structure:
 *   Step 1  — Project Title (required)
 *   Step 2  — Project Description (optional)
 *   Step 3  — UI Elements Needed (modal: Buttons + Frames, AI-parsed)
 *   Step 4  — Button Style (shown only if buttons detected)
 *   Step 5  — Overall Style (shown only if frames detected)
 *   Step 6  — Animation (dynamic based on detected elements)
 *   Step 7  — Specific Colors (optional)
 *   Step 8  — Reference (required, image/video upload)
 *   Step 9  — Assets (Yes/No)
 *   Step 9b — Asset Upload (shown only if Yes)
 *   Step 10 — Payment Method
 *   Step 11 — Extra Info (optional)
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AnswerType =
  | { kind: "text"; minLength?: number; maxLength?: number; optional?: boolean; acceptMedia?: boolean; isReference?: boolean; isAssets?: boolean }
  | { kind: "image" }
  | { kind: "media" }
  | { kind: "link" }
  | { kind: "choice"; options: { label: string; value: string; emoji?: string }[] }
  | {
      kind: "dropdown";
      options: { label: string; value: string; description?: string }[];
      minValues?: number;
      maxValues?: number;
    };

export interface Question {
  id: string;
  prompt: string;
  answerType: AnswerType;
  roles?: string[];
  showIf?: (answers: Record<string, string>) => boolean;
}

export const roleLabels: Record<string, string> = {};
export const allRoleKeys: string[] = [];

export function getRoleDisplayName(key: string): string {
  return key;
}

// ─── UI element detection helpers ─────────────────────────────────────────────

/** Returns true if the user's UI elements answer contains any buttons. */
export function hasButtons(answers: Record<string, string>): boolean {
  const raw = answers["uiRequirementType"] ?? "";
  const match = raw.match(/Buttons Needed:\s*(.+)/i);
  return !!(match && match[1]?.trim());
}

/** Returns true if the user's UI elements answer contains any frames. */
export function hasFrames(answers: Record<string, string>): boolean {
  const raw = answers["uiRequirementType"] ?? "";
  const match = raw.match(/Frames Needed:\s*(.+)/i);
  return !!(match && match[1]?.trim());
}

/**
 * Extracts detected button names from the stored uiRequirementType answer.
 */
export function getDetectedButtons(answers: Record<string, string>): string[] {
  const raw = answers["uiRequirementType"] ?? "";
  const match = raw.match(/Buttons Needed:\s*(.+)/i);
  if (!match || !match[1]) return [];
  return match[1].split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Extracts detected frame names from the stored uiRequirementType answer.
 */
export function getDetectedFrames(answers: Record<string, string>): string[] {
  const raw = answers["uiRequirementType"] ?? "";
  const match = raw.match(/Frames Needed:\s*(.+)/i);
  if (!match || !match[1]) return [];
  return match[1].split(/[,\n]+/).map((s) => s.trim()).filter(Boolean);
}

const ANIM_NOTE =
  "\n\n> 💡 **Note:** Animations use AI-generated scripts fully integrated into your UI. Extra cost may apply.";

/**
 * Builds the animation question prompt dynamically from detected UI elements.
 */
export function buildAnimationPrompt(answers: Record<string, string>): string {
  const buttons = getDetectedButtons(answers);
  const frames  = getDetectedFrames(answers);
  const hasBtns = buttons.length > 0;
  const hasFrms = frames.length > 0;

  if (hasBtns && hasFrms) {
    const btnList = buttons.map((b) => `\`${b}\``).join(", ");
    const frmList = frames.map((f) => `\`${f}\``).join(", ");
    return (
      "**Do you want your UI to be animated?**\n\n" +
      "We detected these elements:\n" +
      `• **Buttons:** ${btnList}\n` +
      `• **Frames:** ${frmList}` +
      ANIM_NOTE
    );
  }

  if (hasBtns) {
    const btnList = buttons.map((b) => `\`${b}\``).join(", ");
    return (
      "**Do you want your buttons to be animated?**\n\n" +
      `We detected these buttons: ${btnList}` +
      ANIM_NOTE
    );
  }

  const frmList = frames.map((f) => `\`${f}\``).join(", ");
  return (
    "**Do you want your frames to be animated?**\n\n" +
    `We detected these frames: ${frmList}` +
    ANIM_NOTE
  );
}

/**
 * Builds the animation answer options dynamically.
 * Buttons-only or frames-only → simple Yes/No.
 * Both → 4-option choice.
 */
export function buildAnimationOptions(
  _answers: Record<string, string>
): { label: string; value: string; emoji?: string }[] {
  return [
    { label: "Yes", value: "Yes", emoji: "✨" },
    { label: "No",  value: "No",  emoji: "🚫" },
  ];
}

// ─── Questions ────────────────────────────────────────────────────────────────

export const commissionQuestions: Question[] = [

  // ── Step 1: Project Title ─────────────────────────────────────────────────
  {
    id: "projectTitle",
    prompt:
      "📌 **What is your project called?**\n\n" +
      "Provide the name of your Roblox game or project. A working title is fine.",
    answerType: { kind: "text", maxLength: 100 },
  },

  // ── Step 2: Project Description (optional) ────────────────────────────────
  {
    id: "projectDescription",
    prompt:
      "🧠 **Tell us about your project** *(optional)*\n\n" +
      "Briefly explain what you're building and what it does.\n\n" +
      "Type `N/A` to skip.",
    answerType: { kind: "text", optional: true, maxLength: 1000 },
  },

  // ── Step 3: UI Elements Needed ────────────────────────────────────────────
  {
    id: "uiRequirementType",
    prompt:
      "🎨 **What do you need designed?**\n\n" +
      "Click **Fill In** and list your UI requirements:\n\n" +
      "• 🟦 **Buttons** (e.g. `Play, Shop, Settings`)\n" +
      "• 🟩 **Frames** (e.g. `Main Menu, HUD, Inventory`)\n\n" +
      "Leave blank anything you don't need.",
    answerType: {
      kind: "choice",
      options: [{ label: "Fill In", value: "open_modal", emoji: "📋" }],
    },
  },

  // ── Step 4: Button Style — only if buttons detected ───────────────────────
  {
    id: "buttonStyle",
    prompt:
      "🔘 **Choose your button style**\n\n" +
      "Select how you want your buttons to look.",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "Rounded", value: "Rounded", description: "Soft, rounded corners" },
        { label: "Square",  value: "Square",  description: "Sharp, angular edges" },
        { label: "Minimal", value: "Minimal", description: "Clean, no-frills look" },
        { label: "Custom",  value: "Custom",  description: "Describe it in extra info" },
      ],
    },
    showIf: (a) => hasButtons(a),
  },

  // ── Step 5: Overall Style — only if frames detected ───────────────────────
  {
    id: "overallStyle",
    prompt:
      "🖼️ **Choose your UI theme**\n\n" +
      "Select the main visual style for your interface.",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "Cartoon", value: "Cartoon", description: "Playful, colorful, illustrated" },
        { label: "Minimal", value: "Minimal", description: "Clean, flat, understated" },
        { label: "Sci-Fi",  value: "Sci-Fi",  description: "Futuristic, glowing, techy" },
        { label: "Fantasy", value: "Fantasy", description: "Ornate, magical, detailed" },
        { label: "Custom",  value: "Custom",  description: "Describe it below" },
      ],
    },
    showIf: (a) => hasFrames(a),
  },

  // ── Step 6: Animation — dynamic, shown if any UI elements were detected ───
  {
    id: "animation",
    prompt: "**Do you want your UI to be animated?**", // overridden dynamically at runtime
    answerType: {
      kind: "choice",
      options: [
        { label: "Yes", value: "Yes", emoji: "✨" },
        { label: "No",  value: "No",  emoji: "🚫" },
      ],
    },
    showIf: (a) => hasButtons(a) || hasFrames(a),
  },

  // ── Step 7: Colors (REQUIRED) ─────────────────────────────────────────────
  {
    id: "colorScheme",
    prompt:
      "🎨 **What colors do you want?** *(required)*\n\n" +
      "List your preferred colors, hex codes, or themes.\n\n" +
      "Examples: `blue and white`, `#9b59b6`, `dark mode with purple accents`",
    answerType: { kind: "text", maxLength: 500 },
  },

  // ── Step 8: Reference — required, image/video uploads only ───────────────
  {
    id: "reference",
    prompt:
      "📎 **Upload your style references** *(required)*\n\n" +
      "Upload images or videos that show the style you want.\n\n" +
      "• Up to **5 files**\n" +
      "• Images or videos only\n\n" +
      "Type **done** when finished.",
    answerType: { kind: "text", isReference: true, maxLength: 800 } as any,
  },

  // ── Step 9: Payment Method ────────────────────────────────────────────────
  {
    id: "paymentMethod",
    prompt:
      "💳 **How will you pay?**\n\n" +
      "Select one or more payment methods you're happy with.\n\n" +
      "*Final pricing will be confirmed after review.*",
    answerType: {
      kind: "dropdown",
      minValues: 1,
      maxValues: 3,
      options: [
        { label: "PayPal (USD)", value: "PayPal",    description: "Pay via PayPal in USD" },
        { label: "Robux",        value: "Robux",     description: "Pay in Roblox Robux" },
        { label: "Gift Card",    value: "Gift Card", description: "Roblox or Amazon gift card" },
      ],
    },
  },

  // ── Step 10: Deadline ─────────────────────────────────────────────────────
  {
    id: "deadline",
    prompt:
      "⏰ **When do you need this by?**\n\n" +
      "Tell us your deadline in plain language.\n\n" +
      "Examples: `ASAP`, `Before Christmas`, `End of next week`, `By December 25th`",
    answerType: { kind: "text", maxLength: 200 },
  },

  // ── Step 11: Extra Info ───────────────────────────────────────────────────
  {
    id: "extraInfo",
    prompt:
      "📝 **Anything else we should know?** *(optional)*\n\n" +
      "Add any special requests, extra instructions, or additional context.\n\n" +
      "Type `N/A` if nothing to add.",
    answerType: { kind: "text", optional: true, maxLength: 1000 },
  },
];

export const commonQuestions = commissionQuestions;
export const roleQuestions: Partial<Record<string, Question[]>> = {};

/** Resolves a raw stored value to its human-readable label for display. */
export function resolveAnswerLabel(q: Question, rawValue: string): string {
  if (!rawValue) return rawValue;
  if (q.answerType.kind === "dropdown" || q.answerType.kind === "choice") {
    const opt = q.answerType.options.find((o) => o.value === rawValue);
    if (opt) return opt.label;
  }
  return rawValue;
}

/** Returns the filtered list of questions for the current answers state. */
export function getQuestionsForRoles(
  _roles: string[],
  answers: Record<string, string> = {}
): Question[] {
  return commissionQuestions.filter((q) => !q.showIf || q.showIf(answers));
}
