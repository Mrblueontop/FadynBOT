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
  "\n\n> 💡 **Note:** Animations are created using AI-generated scripts that are " +
  "fully integrated with your UI. Adding animation may come at an **extra cost**, " +
  "which will be confirmed before work begins.";

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
      "✨ **Animation**\n" +
      "We detected the following UI elements:\n\n" +
      `• **Buttons:** ${btnList}\n` +
      `• **Frames:** ${frmList}\n\n` +
      "Would you like any of these to be animated?" +
      ANIM_NOTE
    );
  }

  if (hasBtns) {
    const btnList = buttons.map((b) => `\`${b}\``).join(", ");
    return (
      "✨ **Animation**\n" +
      `We detected these buttons: ${btnList}\n\n` +
      "Do you want your buttons to be animated?" +
      ANIM_NOTE
    );
  }

  const frmList = frames.map((f) => `\`${f}\``).join(", ");
  return (
    "✨ **Animation**\n" +
    `We detected these frames: ${frmList}\n\n` +
    "Do you want your frames to be animated?" +
    ANIM_NOTE
  );
}

/**
 * Builds the animation answer options dynamically.
 * Buttons-only or frames-only → simple Yes/No.
 * Both → 4-option choice.
 */
export function buildAnimationOptions(
  answers: Record<string, string>
): { label: string; value: string; emoji?: string }[] {
  const hasBtns = hasButtons(answers);
  const hasFrms = hasFrames(answers);

  if (hasBtns && hasFrms) {
    return [
      { label: "Animate buttons only", value: "Buttons only", emoji: "🔘" },
      { label: "Animate frames only",  value: "Frames only",  emoji: "🖼️" },
      { label: "Animate both",         value: "Both",         emoji: "✨" },
      { label: "No animation",         value: "None",         emoji: "🚫" },
    ];
  }

  if (hasBtns) {
    return [
      { label: "Yes, animate my buttons", value: "Buttons only", emoji: "✨" },
      { label: "No animation",            value: "None",          emoji: "🚫" },
    ];
  }

  return [
    { label: "Yes, animate my frames", value: "Frames only", emoji: "✨" },
    { label: "No animation",           value: "None",         emoji: "🚫" },
  ];
}

// ─── Questions ────────────────────────────────────────────────────────────────

export const commissionQuestions: Question[] = [

  // ── Step 1: Project Title ─────────────────────────────────────────────────
  {
    id: "projectTitle",
    prompt:
      "📝 **Step 1: Project Title**\n" +
      "What is the title of your project or commission?\n\n" +
      "This can be your Roblox game name, or just a name for this commission — " +
      "sharing your actual project name is completely optional.",
    answerType: { kind: "text", maxLength: 100 },
  },

  // ── Step 2: Project Description (optional) ────────────────────────────────
  {
    id: "projectDescription",
    prompt:
      "📝 **Step 2: Project Description** *(Optional)*\n" +
      "You can briefly describe your project here — what it is, what it does, or " +
      "anything that helps us understand the context for your UI.\n\n" +
      "This is mainly to improve UI clarity and organisation. Type **N/A** to skip.",
    answerType: { kind: "text", optional: true, maxLength: 1000 },
  },

  // ── Step 3: UI Elements Needed ────────────────────────────────────────────
  {
    id: "uiRequirementType",
    prompt:
      "📝 **Step 3: UI Elements Needed**\n" +
      "Click **Fill In** below to tell us what UI elements you need.\n\n" +
      "• **Buttons Needed** — list your buttons (e.g. `Play, Shop, Inventory, Back`)\n" +
      "• **Frames Needed** — list your screens/frames (e.g. `Main Menu, HUD, Leaderboard`)\n\n" +
      "Leave a field blank if you don't need that type. " +
      "The bot will automatically identify each element from your input.",
    answerType: {
      kind: "choice",
      options: [{ label: "Fill In", value: "open_modal", emoji: "📋" }],
    },
  },

  // ── Step 4: Button Style — only if buttons detected ───────────────────────
  {
    id: "buttonStyle",
    prompt: "📝 **Step 4: Button Style**\nSelect your preferred button style:",
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
    prompt: "📝 **Step 5: Overall Style**\nSelect your preferred overall UI style for your frames/screens:",
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
  // The actual prompt + options are built at render time in askQuestion().
  {
    id: "animation",
    prompt: "✨ **Animation**\nWould you like any of your UI elements to be animated?",
    answerType: {
      kind: "choice",
      options: [
        { label: "Yes", value: "Yes",  emoji: "✨" },
        { label: "No",  value: "None", emoji: "🚫" },
      ],
    },
    showIf: (a) => hasButtons(a) || hasFrames(a),
  },

  // ── Step 7: Specific Colors ───────────────────────────────────────────────
  {
    id: "colorScheme",
    prompt:
      "📝 **Step 7: Specific Colors**\n" +
      "Do you have any specific colors in mind? (hex codes, color names, themes, etc.)\n\n" +
      "Type **N/A** to skip.",
    answerType: { kind: "text", optional: true, maxLength: 500 },
  },

  // ── Step 8: Reference — required, image/video uploads only ───────────────
  {
    id: "reference",
    prompt:
      "📝 **Step 8: Reference**\n" +
      "Upload images or videos that show the style you want — this is **required**.\n\n" +
      "• Only image or video file uploads are accepted (no YouTube links, etc.)\n" +
      "• You can upload up to **5 files**\n" +
      "• Type **done** when you're finished",
    answerType: { kind: "text", isReference: true, maxLength: 800 } as any,
  },

  // ── Step 9: Assets ────────────────────────────────────────────────────────
  {
    id: "hasAssets",
    prompt:
      "📝 **Step 9: Assets**\n" +
      "Do you have any existing assets (images, icons, logos, UI elements) " +
      "you'd like to include in the commission?",
    answerType: {
      kind: "choice",
      options: [
        { label: "Yes, I have assets", value: "Yes", emoji: "✅" },
        { label: "No, start fresh",    value: "No",  emoji: "❌" },
      ],
    },
  },

  // ── Step 9b: Asset Upload — only if user said Yes ─────────────────────────
  {
    id: "assetFiles",
    prompt:
      "📝 **Step 9b: Upload Your Assets**\n" +
      "Upload your assets (images, icons, logos, etc.) as file attachments.\n\n" +
      "• Only image or video files are accepted\n" +
      "• You can upload up to **5 files**\n" +
      "• Type **done** when you're finished, or **skip** to continue without uploading",
    answerType: { kind: "text", isAssets: true, optional: true, maxLength: 2000 } as any,
    showIf: (a) => a["hasAssets"] === "Yes",
  },

  // ── Step 10: Payment Method ───────────────────────────────────────────────
  {
    id: "paymentMethod",
    prompt:
      "📝 **Step 10: Payment Method**\n" +
      "How would you like to pay? Select your preferred method below.\n\n" +
      "*(Final price will be confirmed by the designer after reviewing your request.)*",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "PayPal (USD)", value: "PayPal",    description: "Pay via PayPal in USD" },
        { label: "Robux",        value: "Robux",     description: "Pay in Roblox Robux" },
        { label: "Gift Card",    value: "Gift Card", description: "Roblox or Amazon gift card" },
      ],
    },
  },

  // ── Step 11: Extra Info ───────────────────────────────────────────────────
  {
    id: "extraInfo",
    prompt:
      "📝 **Step 11: Extra Info**\n" +
      "Any additional notes, deadlines, or special requests?\n\n" +
      "Type **N/A** to skip.",
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
