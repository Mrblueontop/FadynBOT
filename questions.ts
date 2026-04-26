export type AnswerType =
  | { kind: "text" }
  | { kind: "image" }
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
}

// Commission bot: no roles system — all applicants answer the same questions
export const roleLabels: Record<string, string> = {};
export const allRoleKeys: string[] = [];

export const commonQuestions: Question[] = [
  {
    id: "commission_type",
    prompt: "What type of commission are you requesting? (e.g. UI design, scripting, building, modeling, VFX, animation, or something else)",
    answerType: { kind: "text" },
  },
  {
    id: "description",
    prompt: "Describe exactly what you need. Be as detailed as possible — the more you explain, the better we can help you.",
    answerType: { kind: "text" },
  },
  {
    id: "reference",
    prompt: "Do you have any reference images, videos, or links that show what you're looking for? Share them here, or say 'None' if not.",
    answerType: { kind: "text" },
  },
  {
    id: "game_link",
    prompt: "What is the Roblox game this commission is for? Share the game link or name. If it's a new game, say 'New project'.",
    answerType: { kind: "text" },
  },
  {
    id: "budget",
    prompt: "What is your budget for this commission? (Please specify the currency — Robux, USD, etc.)",
    answerType: { kind: "text" },
  },
  {
    id: "payment_method",
    prompt: "How do you plan to pay? (e.g. Robux via group funds, GamePass, USD via PayPal, etc.)",
    answerType: {
      kind: "choice",
      options: [
        { label: "Robux (Group Funds)", value: "group_funds", emoji: "💰" },
        { label: "Robux (GamePass)", value: "gamepass", emoji: "🎮" },
        { label: "USD / Real Money", value: "usd", emoji: "💵" },
        { label: "Other", value: "other", emoji: "❓" },
      ],
    },
  },
  {
    id: "deadline",
    prompt: "Do you have a deadline for this commission? If so, when do you need it by?",
    answerType: {
      kind: "choice",
      options: [
        { label: "Yes, I have a deadline", value: "yes", emoji: "📅" },
        { label: "Flexible / No rush", value: "flexible", emoji: "🟢" },
      ],
    },
  },
  {
    id: "deadline_date",
    prompt: "If you have a deadline, please specify the date (e.g. June 30th). If you said 'Flexible', just type 'N/A'.",
    answerType: { kind: "text" },
  },
  {
    id: "revisions",
    prompt: "How many revision rounds do you expect? Are you open to working collaboratively with feedback during the process?",
    answerType: { kind: "text" },
  },
  {
    id: "contact_preference",
    prompt: "What's your preferred way to communicate during the commission? (e.g. Discord DMs, this server, etc.)",
    answerType: { kind: "text" },
  },
  {
    id: "additional_info",
    prompt: "Is there anything else we should know about your commission? Any extra context, requirements, or special requests?",
    answerType: { kind: "text" },
  },
];

// No role-specific questions for a commissions bot
export const roleQuestions: Partial<Record<string, Question[]>> = {};

export function getQuestionsForRoles(_roles: string[]): Question[] {
  return commonQuestions;
}
