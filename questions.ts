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
      "## 1/11 — Project Title\n" +
      "### 📌 What is your project called?\n\n" +
      "Provide the title of your commission or project.\n" +
      "This can be your Roblox game name, working title, or any label you want us to use.\n\n" +
      "**Purpose:** Helps us correctly organize and identify your request.\n\n" +
      "💬 *Reply using the Discord reply system so your answer links to this step.*",
    answerType: { kind: "text", maxLength: 100 },
  },

  // ── Step 2: Project Description (optional) ────────────────────────────────
  {
    id: "projectDescription",
    prompt:
      "## 2/11 — Project Description *(Optional)*\n" +
      "### 🧠 Tell us about your project\n\n" +
      "Briefly explain what you're building, what it does, and your overall idea or vision.\n\n" +
      "**If not needed:** Type `N/A`\n\n" +
      "💬 *Reply to continue.*",
    answerType: { kind: "text", optional: true, maxLength: 1000 },
  },

  // ── Step 3: UI Elements Needed ────────────────────────────────────────────
  {
    id: "uiRequirementType",
    prompt:
      "## 3/11 — UI Elements Needed\n" +
      "### 🎨 What do you need designed?\n\n" +
      "Click **Fill In** and list your UI requirements:\n\n" +
      "• 🟦 **Buttons** (e.g. `Play, Shop, Settings`)\n" +
      "• 🟩 **Frames** (e.g. `Main Menu, HUD, Inventory`)\n\n" +
      "Leave blank anything you don't need.\n\n" +
      "💬 *Use the Fill In button to submit.*",
    answerType: {
      kind: "choice",
      options: [{ label: "Fill In", value: "open_modal", emoji: "📋" }],
    },
  },

  // ── Step 4: Button Style — only if buttons detected ───────────────────────
  {
    id: "buttonStyle",
    prompt:
      "## 4/11 — Button Style\n" +
      "### 🔘 Choose button design style\n\n" +
      "Select how you want your buttons to look (shape, feel, visual style).\n\n" +
      "💬 *Pick one option from the dropdown.*",
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
      "## 5/11 — Overall Style\n" +
      "### 🖼️ UI Theme & Direction\n\n" +
      "Choose the main visual style for your interface (mood, theme, layout direction).\n\n" +
      "💬 *Select one option to proceed.*",
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
    prompt:
      "## 6/11 — Animations\n" +
      "### ✨ UI Motion Effects\n\n" +
      "Would you like animations applied to your UI?\n\n" +
      "Includes:\n" +
      "• Button hover effects\n" +
      "• Frame transitions\n" +
      "• Interactive motion\n\n" +
      "⚠️ *Note: Complex animations may affect pricing.*\n\n" +
      "💬 *Select an option.*",
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
      "## 7/11 — Colors\n" +
      "### 🎨 Design Color Preferences\n\n" +
      "List any preferred colors, hex codes, or themes.\n\n" +
      "**If none:** Type `N/A`\n\n" +
      "💬 *Reply to continue.*",
    answerType: { kind: "text", optional: true, maxLength: 500 },
  },

  // ── Step 8: Reference — required, image/video uploads only ───────────────
  {
    id: "reference",
    prompt:
      "## 8/11 — References *(Required)*\n" +
      "### 📎 Inspiration & Style References\n\n" +
      "Upload images or videos that represent your desired UI style.\n\n" +
      "• Up to **5 files**\n" +
      "• Images or videos only\n" +
      "• Required for accurate design matching\n\n" +
      "When finished, type: **done**",
    answerType: { kind: "text", isReference: true, maxLength: 800 } as any,
  },

  // ── Step 9: Assets ────────────────────────────────────────────────────────
  {
    id: "hasAssets",
    prompt:
      "## 9/11 — Assets\n" +
      "### 🧩 Existing Resources\n\n" +
      "Do you already have assets we should use?\n\n" +
      "Examples:\n" +
      "• Logos\n" +
      "• Icons\n" +
      "• Custom UI graphics",
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
      "## 9b — Asset Upload\n" +
      "### 📤 Upload your files\n\n" +
      "• Max **5 files**\n" +
      "• Images or videos only\n\n" +
      "Type **done** when finished, or **skip** to continue without uploading.",
    answerType: { kind: "text", isAssets: true, optional: true, maxLength: 2000 } as any,
    showIf: (a) => a["hasAssets"] === "Yes",
  },

  // ── Step 10: Payment Method ───────────────────────────────────────────────
  {
    id: "paymentMethod",
    prompt:
      "## 10/11 — Payment Method\n" +
      "### 💳 How will you pay?\n\n" +
      "Select your preferred payment method.\n\n" +
      "*Final pricing will be confirmed after review.*",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "PayPal (USD)", value: "PayPal",    description: "Pay via PayPal in USD" },
        { label: "Robux",        value: "Robux",     description: "Pay in Roblox Robux" },
        { label: "Gift Card",    value: "Gift Card", description: "Roblox or Amazon gift card" },
      ],
    },
  },

  // ── Step 11: Deadline ─────────────────────────────────────────────────────
  {
    id: "deadline",
    prompt:
      "## 11/12 — Deadline\n" +
      "### ⏰ When do you need this by?\n\n" +
      "Tell us your deadline or timeframe in plain language.\n\n" +
      "**Examples:**\n" +
      "• `ASAP`\n" +
      "• `Before Christmas`\n" +
      "• `End of next week`\n" +
      "• `By December 25th`\n\n" +
      "💬 *Reply with your deadline to continue.*",
    answerType: { kind: "text", maxLength: 200 },
  },

  // ── Step 12: Extra Info ───────────────────────────────────────────────────
  {
    id: "extraInfo",
    prompt:
      "## 12/12 — Extra Info\n" +
      "### 📝 Additional Notes\n\n" +
      "Add anything else we should know:\n\n" +
      "• Special requests\n" +
      "• Extra instructions\n" +
      "• Any other context\n\n" +
      "**If nothing:** Type `N/A`",
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
