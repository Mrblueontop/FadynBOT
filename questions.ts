/**
 * questions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * All commission intake questions for FadynBot.
 *
 * Changes:
 *   - Step 4: "UI Frames Needed" — replaced multi-page modal with 2-field modal
 *     (Buttons Needed + Frames Needed). Conditional logic skips button/frame
 *     questions based on which fields are filled.
 *   - Step 5: buttonStyle — only shown if buttons field is filled
 *   - Step 6: overallStyle — only shown if frames field is filled (not buttons-only)
 *   - Step 7: "Visual Style & Colors" (renamed from Color Scheme)
 *   - Step 8: Reference — required (no skip)
 *   - NEW Step 9: Assets — "Do you have any assets to include?"
 *   - Step 10: Payment Method — supports multiple methods, no budget question
 *   - Step 11: Extra Info
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type AnswerType =
  | { kind: "text"; minLength?: number; maxLength?: number; optional?: boolean; acceptMedia?: boolean }
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

// ─── Helpers for UI element conditional logic ─────────────────────────────────

/** Returns true if the user filled in the Buttons Needed field. */
export function hasButtons(answers: Record<string, string>): boolean {
  const raw = answers["uiRequirementType"] ?? "";
  const match = raw.match(/Buttons Needed:\s*(.+)/i);
  return !!(match && match[1]?.trim());
}

/** Returns true if the user filled in the Frames Needed field. */
export function hasFrames(answers: Record<string, string>): boolean {
  const raw = answers["uiRequirementType"] ?? "";
  const match = raw.match(/Frames Needed:\s*(.+)/i);
  return !!(match && match[1]?.trim());
}

// ─── Questions ────────────────────────────────────────────────────────────────

export const commissionQuestions: Question[] = [
  // ── Step 1: Name ──────────────────────────────────────────────────────────
  {
    id: "name",
    prompt: "📝 **Step 1: Name**\nWhat is your name?",
    answerType: { kind: "text", maxLength: 100 },
  },

  // ── Step 2: Project Name ──────────────────────────────────────────────────
  {
    id: "projectName",
    prompt: "📝 **Step 2: Project Name**\nWhat is your Roblox project name?",
    answerType: { kind: "text", maxLength: 100 },
  },

  // ── Step 3: Project Description ───────────────────────────────────────────
  {
    id: "projectDescription",
    prompt:
      "📝 **Step 3: Project Description**\nDescribe your project — what it does, the gameplay, purpose, target audience, etc.",
    answerType: { kind: "text", minLength: 20, maxLength: 1000 },
  },

  // ── Step 4: UI Frames Needed ──────────────────────────────────────────────
  // Opens a 2-field modal: "Buttons Needed" and "Frames Needed".
  // Downstream questions check hasButtons() / hasFrames() to decide what to show.
  {
    id: "uiRequirementType",
    prompt:
      "📝 **Step 4: UI Frames Needed**\nClick **Fill In** below to specify what UI elements you need.\n\n" +
      "• **Buttons Needed** — list any buttons (e.g. Play, Shop, Inventory)\n" +
      "• **Frames Needed** — list any frames/screens (e.g. Main Menu, HUD, Leaderboard)\n\n" +
      "Leave a field blank if you don't need that type.",
    answerType: {
      kind: "choice",
      options: [{ label: "Fill In", value: "open_modal", emoji: "📋" }],
    },
  },

  // ── Step 5: Button Style — only if buttons were specified ─────────────────
  {
    id: "buttonStyle",
    prompt: "📝 **Step 5: Button Style**\nSelect your preferred button style:",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "Rounded", value: "Rounded", description: "Soft, rounded corners" },
        { label: "Square", value: "Square", description: "Sharp, angular edges" },
        { label: "Minimal", value: "Minimal", description: "Clean, no-frills look" },
        { label: "Custom", value: "Custom", description: "Describe it in extra info" },
      ],
    },
    showIf: (a) => hasButtons(a),
  },

  // ── Step 6: Overall Style — only if frames were specified ─────────────────
  // If user only has buttons (no frames), this question is skipped entirely.
  {
    id: "overallStyle",
    prompt: "📝 **Step 6: Overall Style**\nSelect your preferred overall UI style for your frames/screens:",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "Cartoon", value: "Cartoon", description: "Playful, colorful, illustrated" },
        { label: "Minimal", value: "Minimal", description: "Clean, flat, understated" },
        { label: "Sci-Fi", value: "Sci-Fi", description: "Futuristic, glowing, techy" },
        { label: "Fantasy", value: "Fantasy", description: "Ornate, magical, detailed" },
        { label: "Custom", value: "Custom", description: "Describe it below" },
      ],
    },
    showIf: (a) => hasFrames(a),
  },

  // ── Step 7: Specific Colors ──────────────────────────────────────────────
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
      "• Only image or video files are accepted (no YouTube links, etc.)\n" +
      "• You can upload up to **5 files**\n" +
      "• Type **done** when you're finished",
    answerType: { kind: "text", isReference: true, maxLength: 800 } as any,
  },

  // ── Step 9: Assets ────────────────────────────────────────────────────────
  {
    id: "hasAssets",
    prompt:
      "📝 **Step 9: Assets**\n" +
      "Do you have any existing assets (images, icons, logos, UI elements) you'd like to include in the commission?",
    answerType: {
      kind: "choice",
      options: [
        { label: "Yes, I have assets", value: "Yes", emoji: "✅" },
        { label: "No, start fresh", value: "No", emoji: "❌" },
      ],
    },
  },

  // ── Step 9b: Asset Upload — only if user said Yes ─────────────────────────
  {
    id: "assetFiles",
    prompt:
      "📝 **Step 9b: Upload Your Assets**\n" +
      "Upload your assets (images, icons, logos, etc.) as attachments, or paste direct URLs.\n\n" +
      "You can send multiple messages. Click **Done** when finished.",
    answerType: { kind: "text", acceptMedia: true, maxLength: 2000 },
    showIf: (a) => a["hasAssets"] === "Yes",
  },

  // ── Step 10: Payment Method ───────────────────────────────────────────────
  {
    id: "paymentMethod",
    prompt:
      "📝 **Step 10: Payment Method**\n" +
      "How would you like to pay? You can select your preferred method below.\n\n" +
      "*(Final price will be confirmed by the designer after reviewing your request.)*",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "PayPal (USD)", value: "PayPal", description: "Pay via PayPal in USD" },
        { label: "Robux", value: "Robux", description: "Pay in Roblox Robux" },
        { label: "Gift Card", value: "Gift Card", description: "Roblox or Amazon gift card" },
      ],
    },
  },

  // ── Step 11: Extra Info ───────────────────────────────────────────────────
  {
    id: "extraInfo",
    prompt:
      "📝 **Step 11: Extra Info**\nAny additional notes, deadlines, or special requests?\n\nType **N/A** to skip.",
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
