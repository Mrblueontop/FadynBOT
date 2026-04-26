/**
 * questions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * All commission intake questions for FadynBot.
 *
 * Changes from original:
 *   - Payment method: removed "Other"/Crypto, added "Gift Card"
 *   - New conditional question: budgetGiftCard (Step 10c)
 *   - budgetOther removed
 *   - Step 6 overallStyle has two extra options (Sci-Fi, Fantasy)
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

  // ── Step 4: UI Elements ───────────────────────────────────────────────────
  {
    id: "uiRequirementType",
    prompt:
      "📝 **Step 4: UI Elements Needed**\nClick the button below to fill in what UI screens and elements you need (buttons, frames, HUD, shop, etc.).",
    answerType: {
      kind: "choice",
      options: [{ label: "Fill in UI Elements", value: "open_modal", emoji: "📋" }],
    },
  },

  // ── Step 5: Button Style ──────────────────────────────────────────────────
  {
    id: "buttonStyle",
    prompt: "📝 **Step 5: Button Style**\nSelect your preferred button style:",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "Rounded", value: "Rounded", description: "Soft, rounded corners" },
        { label: "Square", value: "Square", description: "Sharp, angular edges" },
        { label: "Minimal", value: "Minimal", description: "Clean, no-frills look" },
        { label: "Custom", value: "Custom", description: "I'll describe it in extra info" },
      ],
    },
  },

  // ── Step 6: Overall Style ─────────────────────────────────────────────────
  {
    id: "overallStyle",
    prompt: "📝 **Step 6: Overall Style**\nSelect your preferred overall UI style:",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "Cartoon", value: "Cartoon", description: "Playful, colorful, illustrated" },
        { label: "Minimal", value: "Minimal", description: "Clean, flat, understated" },
        { label: "Sci-Fi", value: "Sci-Fi", description: "Futuristic, glowing, techy" },
        { label: "Fantasy", value: "Fantasy", description: "Ornate, magical, detailed" },
        { label: "Custom", value: "Custom", description: "I'll describe it below" },
      ],
    },
  },

  // ── Step 7: Color Scheme ──────────────────────────────────────────────────
  {
    id: "colorScheme",
    prompt:
      "📝 **Step 7: Color Scheme**\nDescribe your preferred colors, fonts, or brand palette. Include hex codes if you have them.",
    answerType: { kind: "text", maxLength: 500 },
  },

  // ── Step 8: Reference ─────────────────────────────────────────────────────
  {
    id: "reference",
    prompt:
      "📝 **Step 8: Reference**\nProvide a reference — upload an image attachment **or** paste a direct image URL.\nThis helps the designer understand your vision.",
    answerType: { kind: "text", acceptMedia: true, maxLength: 800 },
  },

  // ── Step 9: Payment Method ────────────────────────────────────────────────
  {
    id: "paymentMethod",
    prompt: "📝 **Step 9: Payment Method**\nHow would you like to pay?",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "PayPal (USD)", value: "PayPal", description: "Pay via PayPal in USD" },
        { label: "Robux", value: "Robux", description: "Pay in Roblox Robux" },
        { label: "Gift Card", value: "Gift Card", description: "Roblox or Amazon gift card" },
      ],
    },
  },

  // ── Step 10a: Budget — PayPal ─────────────────────────────────────────────
  {
    id: "budgetPaypal",
    prompt: "📝 **Step 10: Budget (PayPal)**\nWhat is your rough budget?",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "Under $5", value: "Under $5" },
        { label: "$5 – $10", value: "$5-$10" },
        { label: "$10 – $20", value: "$10-$20" },
        { label: "$20 – $40", value: "$20-$40" },
        { label: "$40+", value: "$40+" },
      ],
    },
    showIf: (a) => a["paymentMethod"] === "PayPal",
  },

  // ── Step 10b: Budget — Robux ──────────────────────────────────────────────
  {
    id: "budgetRobux",
    prompt: "📝 **Step 10: Budget (Robux)**\nWhat is your rough budget?",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "Under 250 R$", value: "Under 250 R$" },
        { label: "250 – 500 R$", value: "250-500 R$" },
        { label: "500 – 1,000 R$", value: "500-1k R$" },
        { label: "1,000 – 5,000 R$", value: "1k-5k R$" },
        { label: "5,000+ R$", value: "5k+ R$" },
      ],
    },
    showIf: (a) => a["paymentMethod"] === "Robux",
  },

  // ── Step 10c: Budget — Gift Card ──────────────────────────────────────────
  {
    id: "budgetGiftCard",
    prompt: "📝 **Step 10: Budget (Gift Card)**\nWhat is your rough budget in USD?",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "Under $5", value: "Under $5" },
        { label: "$5 – $10", value: "$5-$10" },
        { label: "$10 – $25", value: "$10-$25" },
        { label: "$25+", value: "$25+" },
      ],
    },
    showIf: (a) => a["paymentMethod"] === "Gift Card",
  },

  // ── Step 11: Extra Info ───────────────────────────────────────────────────
  {
    id: "extraInfo",
    prompt:
      "📝 **Step 11: Extra Info**\nAny notes, deadlines, or special requests? Type **N/A** to skip.",
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
