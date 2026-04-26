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
  {
    id: "name",
    prompt: "📝 **Step 1: Name**\nWhat is your name?",
    answerType: { kind: "text", maxLength: 100 },
  },
  {
    id: "projectName",
    prompt: "📝 **Step 2: Project Name**\nWhat is your project name?",
    answerType: { kind: "text", maxLength: 100 },
  },
  {
    id: "projectDescription",
    prompt: "📝 **Step 3: Project Description**\nDescribe your project (what it does, gameplay, purpose, etc.)",
    answerType: { kind: "text", minLength: 20, maxLength: 1000 },
  },
  {
    id: "uiRequirementType",
    prompt: "📝 **Step 4: UI Elements Needed**\nClick the button below to fill in what buttons and frames you need for your UI. You can describe each element in detail.",
    answerType: { kind: "choice", options: [{ label: "Fill in UI Elements", value: "open_modal", emoji: "📋" }] },
  },
  {
    id: "buttonStyle",
    prompt: "📝 **Step 5: Button Style**\nSelect your preferred button style:",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "Rounded", value: "Rounded" },
        { label: "Square", value: "Square" },
        { label: "Minimal", value: "Minimal" },
        { label: "Custom", value: "Custom" },
      ],
    },
  },
  {
    id: "overallStyle",
    prompt: "📝 **Step 6: Overall Style**\nSelect your preferred overall style:",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "Cartoon", value: "Cartoon" },
        { label: "Minimal", value: "Minimal" },
        { label: "Custom", value: "Custom" },
      ],
    },
  },
  {
    id: "colorScheme",
    prompt: "📝 **Step 7: Color Scheme**\nWhat is your preferred color scheme? (fonts/branding optional)",
    answerType: { kind: "text", maxLength: 500 },
  },
  {
    id: "reference",
    prompt: "📝 **Step 8: Reference**\nProvide a reference image attachment or a valid image link (URL).",
    answerType: { kind: "text", acceptMedia: true, maxLength: 800 },
  },
  {
    id: "paymentMethod",
    prompt: "📝 **Step 9: Payment Method**\nHow will you be paying?",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "PayPal (USD)", value: "PayPal" },
        { label: "Robux", value: "Robux" },
        { label: "Gift Card", value: "Gift Card" },
      ],
    },
  },
  {
    id: "budgetPaypal",
    prompt: "📝 **Step 10: Budget (PayPal)**\nWhat is your budget?",
    answerType: {
      kind: "dropdown",
      options: [
        { label: "Under $3", value: "Under $3" },
        { label: "$3 – $5", value: "$3-$5" },
        { label: "$5 – $10", value: "$5-$10" },
        { label: "$15+", value: "$15+" },
      ],
    },
    showIf: (a) => a["paymentMethod"] === "PayPal",
  },
  {
    id: "budgetRobux",
    prompt: "📝 **Step 10: Budget (Robux)**\nWhat is your budget?",
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
  {
    id: "budgetGiftCard",
    prompt: "📝 **Step 10: Budget (Gift Card)**\nWhat is your budget in USD?",
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
  {
    id: "extraInfo",
    prompt: "📝 **Step 11: Extra Info**\nAny notes, deadlines, or special requests. Type N/A to skip.",
    answerType: { kind: "text", optional: true, maxLength: 1000 },
  },
];

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

export function getQuestionsForRoles(
  _roles: string[],
  answers: Record<string, string> = {}
): Question[] {
  return commissionQuestions.filter((q) => !q.showIf || q.showIf(answers));
}
