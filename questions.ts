// ─── Commission application questions ────────────────────────────────────────
// Replaces the developer-application question set with Roblox UI commission questions.

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

// No role-based splitting for commissions — one flat question list.
export const roleLabels: Record<string, string> = {};
export const allRoleKeys: string[] = [];

export function getRoleDisplayName(key: string): string {
  return key;
}

export const commissionQuestions: Question[] = [
  // ── Contact & identity ────────────────────────────────────────────────────
  {
    id: "robloxUsername",
    prompt: "What is your **Roblox username**? (This is used to find your profile and portfolio.)",
    answerType: { kind: "text", maxLength: 60 },
  },
  {
    id: "contactMethod",
    prompt: "What is the best way to reach you for updates and follow-up questions?",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "Discord DMs (here)", value: "Discord DMs", description: "I'll reply in this DM thread" },
        { label: "Discord Username", value: "Discord Username", description: "Tag me by username" },
        { label: "Roblox Messages", value: "Roblox Messages", description: "Message me on Roblox" },
        { label: "Other", value: "other", description: "I'll explain below" },
      ],
    },
  },
  {
    id: "contactMethodOther",
    prompt: "How should we contact you? (Please include the platform and your handle.)",
    answerType: { kind: "text", maxLength: 200 },
    showIf: (a) => a["contactMethod"] === "other",
  },

  // ── Commission details ────────────────────────────────────────────────────
  {
    id: "commissionType",
    prompt: "What type of UI commission are you requesting?",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "Full Game UI (HUD, menus, inventory, etc.)", value: "Full Game UI" },
        { label: "Single Screen / Menu", value: "Single Screen" },
        { label: "HUD Only", value: "HUD Only" },
        { label: "Shop / Store UI", value: "Shop UI" },
        { label: "Settings / Options Menu", value: "Settings Menu" },
        { label: "Leaderboard / Scoreboard", value: "Leaderboard" },
        { label: "Cutscene / Cinematic UI", value: "Cutscene UI" },
        { label: "Custom / Other", value: "custom", description: "I'll describe it below" },
      ],
    },
  },
  {
    id: "commissionTypeCustom",
    prompt: "Describe the type of UI you need:",
    answerType: { kind: "text", minLength: 20, maxLength: 500 },
    showIf: (a) => a["commissionType"] === "custom",
  },
  {
    id: "gameDescription",
    prompt: "Describe your game — genre, theme, and the overall vibe you're going for. The more detail, the better the UI will match.",
    answerType: { kind: "text", minLength: 30, maxLength: 1000 },
  },
  {
    id: "screenList",
    prompt: "List every individual screen or UI element you need. For example: main menu, settings, inventory, HUD, shop, loading screen, etc.",
    answerType: { kind: "text", minLength: 20, maxLength: 1200 },
  },

  // ── Style & assets ────────────────────────────────────────────────────────
  {
    id: "stylePreference",
    prompt: "What visual style should the UI follow?",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "Minimalist / Clean", value: "Minimalist" },
        { label: "Cartoony / Playful", value: "Cartoony" },
        { label: "Sci-Fi / Futuristic", value: "Sci-Fi" },
        { label: "Fantasy / Medieval", value: "Fantasy" },
        { label: "Dark / Gritty", value: "Dark" },
        { label: "Neon / Cyberpunk", value: "Neon" },
        { label: "Custom — I'll provide references", value: "custom" },
      ],
    },
  },
  {
    id: "styleReferences",
    prompt: "Do you have any visual references? Share images, links to games, or UI mockups that capture the look you want.\n\n💡 *Attach images or paste links — both work. Type N/A to skip.*",
    answerType: { kind: "text", optional: true, acceptMedia: true, maxLength: 800 },
  },
  {
    id: "colorPalette",
    prompt: "Do you have a specific color palette or brand colors to follow? (e.g. hex codes, a general vibe like \"dark blues and purples\", or N/A)",
    answerType: { kind: "text", optional: true, maxLength: 300 },
  },
  {
    id: "hasAssets",
    prompt: "Do you have any existing assets to provide? (fonts, icons, logos, textures, etc.)",
    answerType: {
      kind: "choice",
      options: [
        { label: "Yes, I'll provide assets", value: "yes", emoji: "✅" },
        { label: "Partially — some assets", value: "partial", emoji: "🔀" },
        { label: "No — design from scratch", value: "no", emoji: "❌" },
      ],
    },
  },
  {
    id: "assetDetails",
    prompt: "Describe the assets you can provide and how you'll share them (Google Drive, DevForum post, direct upload, etc.):",
    answerType: { kind: "text", maxLength: 500 },
    showIf: (a) => a["hasAssets"] === "yes" || a["hasAssets"] === "partial",
  },

  // ── Technical requirements ────────────────────────────────────────────────
  {
    id: "resolution",
    prompt: "What screen resolution / aspect ratio should the UI target?",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "16:9 (standard — 1920×1080)", value: "16:9" },
        { label: "16:10 (1920×1200)", value: "16:10" },
        { label: "Mobile-first (portrait)", value: "Mobile Portrait" },
        { label: "Responsive — all devices", value: "Responsive" },
        { label: "Other / Not sure", value: "other" },
      ],
    },
  },
  {
    id: "scriptingNeeded",
    prompt: "Do you need the UI scripted (connected to game logic), or just the visual design delivered as a .rbxm / image exports?",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "Full scripted UI (with LocalScripts)", value: "Scripted" },
        { label: "Visual design only — I'll script it", value: "Design Only" },
        { label: "Not sure — let's discuss", value: "Discuss" },
      ],
    },
  },
  {
    id: "animationsNeeded",
    prompt: "Do you need UI animations (tweens, transitions, button effects)?",
    answerType: {
      kind: "choice",
      options: [
        { label: "Yes, please", value: "yes", emoji: "✅" },
        { label: "Simple only", value: "simple", emoji: "🔀" },
        { label: "No animations", value: "no", emoji: "❌" },
      ],
    },
  },

  // ── Timeline & budget ─────────────────────────────────────────────────────
  {
    id: "deadline",
    prompt: "Do you have a deadline or a target completion date?",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "ASAP (within 1 week)", value: "ASAP" },
        { label: "1–2 weeks", value: "1-2 weeks" },
        { label: "2–4 weeks", value: "2-4 weeks" },
        { label: "1–2 months", value: "1-2 months" },
        { label: "Flexible / No rush", value: "Flexible" },
        { label: "Specific date — I'll explain", value: "custom" },
      ],
    },
  },
  {
    id: "deadlineCustom",
    prompt: "What is your specific deadline or target date?",
    answerType: { kind: "text", minLength: 5, maxLength: 200 },
    showIf: (a) => a["deadline"] === "custom",
  },
  {
    id: "budget",
    prompt: "What is your budget for this commission?",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "Under 500 Robux", value: "< 500 R$" },
        { label: "500 – 1,000 Robux", value: "500-1k R$" },
        { label: "1,000 – 2,500 Robux", value: "1k-2.5k R$" },
        { label: "2,500 – 5,000 Robux", value: "2.5k-5k R$" },
        { label: "5,000 – 10,000 Robux", value: "5k-10k R$" },
        { label: "10,000+ Robux", value: "10k+ R$" },
        { label: "USD (I'll specify below)", value: "USD" },
        { label: "Open to negotiation", value: "Negotiable" },
      ],
    },
  },
  {
    id: "budgetUSD",
    prompt: "What is your USD budget? (Please include the amount and preferred payment method, e.g. PayPal, Venmo.)",
    answerType: { kind: "text", maxLength: 200 },
    showIf: (a) => a["budget"] === "USD",
  },
  {
    id: "revisionPolicy",
    prompt: "How many rounds of revisions are you expecting?",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "1 round", value: "1 revision" },
        { label: "2 rounds", value: "2 revisions" },
        { label: "3 rounds", value: "3 revisions" },
        { label: "Unlimited — within reason", value: "Unlimited" },
        { label: "Open to discussing", value: "Open" },
      ],
    },
  },

  // ── Additional info ───────────────────────────────────────────────────────
  {
    id: "additionalNotes",
    prompt: "Is there anything else you'd like us to know about the commission? (Special requirements, inspiration, concerns, etc.) Type N/A to skip.",
    answerType: { kind: "text", optional: true, maxLength: 1000 },
  },
];

// Alias used by the rest of the codebase expecting `commonQuestions`
export const commonQuestions = commissionQuestions;

export const roleQuestions: Partial<Record<string, Question[]>> = {};

export function resolveAnswerLabel(q: Question, rawValue: string): string {
  if (!rawValue) return rawValue;
  if (q.answerType.kind === "dropdown" || q.answerType.kind === "choice") {
    const opt = q.answerType.options.find((o) => o.value === rawValue);
    if (opt) return opt.label;
  }
  return rawValue;
}

/**
 * Returns the full question list, filtering out conditional questions whose
 * `showIf` predicate returns false for the current answers.
 *
 * The `roles` parameter is kept for API compatibility but is unused in the
 * commission flow (all applicants answer the same questions).
 */
export function getQuestionsForRoles(
  _roles: string[],
  answers: Record<string, string> = {}
): Question[] {
  return commissionQuestions.filter((q) => !q.showIf || q.showIf(answers));
}
