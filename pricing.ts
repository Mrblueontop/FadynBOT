/**
 * pricing.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * AI-based price estimation for Fadyn Bot commission requests.
 *
 * Pricing is per-item:
 *   Buttons : $1–$2 USD / 25–100 R$ each (simple → complex)
 *   Frames  : $3–$25 USD / 250–2000 R$ per frame (basic → advanced)
 *   Rush    : +30% of base total when deadline is ASAP / <3 days
 *
 * Call `calculatePrice(answers)` just before rendering the final review embed.
 * Returns a `PriceEstimate` with USD/Robux ranges and a reasoning blurb.
 *
 * Requires: GROQ_API_KEY in your .env / Railway environment variables.
 * ──────────────────────────────────────────────────────────────────────────────
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PriceEstimate {
  usd: string;         // e.g. "$15 – $25"
  robux: string;       // e.g. "1,500 – 2,500 R$"
  reasoning: string;   // 1–2 sentence plain-English blurb shown in the embed
  raw: {
    usdMin: number;
    usdMax: number;
    robuxMin: number;
    robuxMax: number;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Approximate Robux ↔ USD conversion used as a FALLBACK only.
 * The AI returns explicit robuxMin/robuxMax from the pricing sheet.
 * Basic: 100 R$/$1 | Standard: ~75 R$/$1 | Advanced: ~80 R$/$1
 */
const ROBUX_PER_USD = 100;

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Calls the Groq API to estimate a price for the commission described
 * by `answers`. Pricing is now per-item (per-frame + per-button).
 * Returns a `PriceEstimate` on success, or a safe fallback on failure.
 */
export async function calculatePrice(
  answers: Record<string, string>
): Promise<PriceEstimate> {
  const prompt = buildPricingPrompt(answers);
  const isRush = /asap|as soon as possible/i.test(answers["deadline"] ?? "");

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
        temperature: 0.3,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`[pricing] Groq API error ${response.status}:`, await response.text());
      return applyRush(fallbackEstimate(), isRush);
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    const text = data.choices[0]?.message?.content ?? "";
    return applyRush(parsePricingResponse(text), isRush);
  } catch (err) {
    console.error("[pricing] fetch error:", err);
    return applyRush(fallbackEstimate(), isRush);
  }
}

// ─── Prompt construction ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are the pricing bot for Fadyn's Roblox UI commission service.
Estimate the total price by counting the actual buttons and frames the client listed,
then applying the per-item rates below.

=== PER-ITEM PRICING ===

BUTTONS — $0.50–$1 USD / 15–50 R$ each
  $0.50 / 15 R$ : simple (plain style, no animation)
  $1    / 50 R$ : complex (stylised, animated, or detailed)

FRAMES — $2–$10 USD / 150–800 R$ per frame
  $2–$3  / 150–250 R$ : Basic    (1–2 elements, minimal style)
  $3–$6  / 250–500 R$ : Standard (menus, HUDs, polished look)
  $6–$10 / 500–800 R$ : Advanced (rich animations, complex layouts)

=== ADD-ONS ===
  Rush / ASAP deadline : +20% of the base total (set isRush: true)
  Animation add-on is already factored into the per-button/frame rate — do not double-count.

=== RULES ===
- Count each button and each frame individually from "UI elements needed".
- Total price = sum of all buttons + sum of all frames + any add-ons.
- Minimum total: $1 USD. Maximum total: $30 USD.
- ALWAYS default to the lower end of every range unless there is a clear reason to go higher.
- When in doubt, go cheaper — the designer can adjust up in the ticket if needed.
- Roblox tax is already included — do not add extra.
- One free revision is included — do not adjust price for it.
- Output ONLY valid JSON, no markdown fences, no extra text:

{
  "usdMin": <number>,
  "usdMax": <number>,
  "robuxMin": <number>,
  "robuxMax": <number>,
  "reasoning": "<1–2 sentences: item count, tier used, any add-ons applied>",
  "isRush": <boolean>
}
`.trim();

function buildPricingPrompt(answers: Record<string, string>): string {
  const lines: string[] = ["Commission intake answers:"];

  const labelMap: Record<string, string> = {
    projectTitle:       "Project title",
    projectDescription: "Project description",
    uiRequirementType:  "UI elements needed",
    buttonStyle:        "Button style",
    overallStyle:       "Overall style",
    animation:          "Animation",
    colorScheme:        "Color scheme / fonts",
    reference:          "Reference provided",
    paymentMethod:      "Preferred payment",
    budgetPaypal:       "Budget (PayPal)",
    budgetRobux:        "Budget (Robux)",
    budgetGiftCard:     "Budget (Gift Card)",
    extraInfo:          "Extra info / deadline",
  };

  for (const [key, label] of Object.entries(labelMap)) {
    const val = answers[key];
    if (val && val !== "N/A") {
      lines.push(`- ${label}: ${val}`);
    }
  }

  lines.push(
    "",
    "Based on the above, estimate a fair USD price range for this commission."
  );
  return lines.join("\n");
}

// ─── Rush markup ──────────────────────────────────────────────────────────────

/**
 * Applies a 20% rush surcharge to an estimate if the deadline is ASAP.
 * This runs in code after the AI response so it's always guaranteed.
 */
function applyRush(estimate: PriceEstimate, isRush: boolean): PriceEstimate {
  if (!isRush) return estimate;

  const RUSH_MULTIPLIER = 1.2;
  const usdMin   = Math.min(Math.round(estimate.raw.usdMin   * RUSH_MULTIPLIER), 30);
  const usdMax   = Math.min(Math.round(estimate.raw.usdMax   * RUSH_MULTIPLIER), 30);
  const robuxMin = Math.round(estimate.raw.robuxMin * RUSH_MULTIPLIER);
  const robuxMax = Math.round(estimate.raw.robuxMax * RUSH_MULTIPLIER);

  return {
    usd:      `$${usdMin} – $${usdMax}`,
    robux:    `${robuxMin.toLocaleString()} – ${robuxMax.toLocaleString()} R$`,
    reasoning: estimate.reasoning + " ⚡ Rush surcharge (+20%) applied for ASAP deadline.",
    raw:      { usdMin, usdMax, robuxMin, robuxMax },
  };
}

// ─── Response parsing ─────────────────────────────────────────────────────────

function parsePricingResponse(text: string): PriceEstimate {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as {
      usdMin: number;
      usdMax: number;
      robuxMin?: number;
      robuxMax?: number;
      reasoning: string;
      isRush?: boolean;
    };

    // Clamp USD to per-item sheet limits: $1–$30
    const usdMin = Math.min(Math.max(1, Math.round(parsed.usdMin)), 30);
    const usdMax = Math.min(Math.max(usdMin, Math.round(parsed.usdMax)), 30);

    // Use AI-supplied Robux if present, otherwise convert
    const robuxMin = parsed.robuxMin ? Math.round(parsed.robuxMin) : usdMin * ROBUX_PER_USD;
    const robuxMax = parsed.robuxMax ? Math.round(parsed.robuxMax) : usdMax * ROBUX_PER_USD;

    return {
      usd: `$${usdMin} – $${usdMax}`,
      robux: `${robuxMin.toLocaleString()} – ${robuxMax.toLocaleString()} R$`,
      reasoning: (parsed.reasoning ?? "").slice(0, 200),
      raw: { usdMin, usdMax, robuxMin, robuxMax },
    };
  } catch {
    console.error("[pricing] Failed to parse AI response:", text);
    return fallbackEstimate();
  }
}

function fallbackEstimate(): PriceEstimate {
  return {
    usd: "$4 – $8",
    robux: "300 – 600 R$",
    reasoning:
      "Estimated at Standard tier (per-item, lower end). Final price will be confirmed by the designer after reviewing your request.",
    raw: { usdMin: 4, usdMax: 8, robuxMin: 300, robuxMax: 600 },
  };
}

// ─── Per-item price breakdown ─────────────────────────────────────────────────

/**
 * In-memory store: logMessageId → formatted breakdown string.
 * Populated in submitApplication; read by the button handler.
 */
const breakdownStore = new Map<string, string>();

export function storePriceBreakdown(messageId: string, text: string): void {
  breakdownStore.set(messageId, text);
}

export function getPriceBreakdown(messageId: string): string | null {
  return breakdownStore.get(messageId) ?? null;
}

/**
 * Builds a human-readable per-item breakdown from the session answers
 * and the already-computed PriceEstimate.
 */
export function buildPriceBreakdown(
  answers: Record<string, string>,
  estimate: PriceEstimate
): string {
  // Parse buttons and frames from the stored uiRequirementType answer
  const uiRaw = answers["uiRequirementType"] ?? "";
  const btnMatch = uiRaw.match(/Buttons Needed:\s*(.+)/i);
  const frmMatch = uiRaw.match(/Frames Needed:\s*(.+)/i);

  const buttons = btnMatch?.[1]?.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean) ?? [];
  const frames  = frmMatch?.[1]?.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean) ?? [];

  const hasAnimation = answers["animation"] === "Yes";
  const isRush = /asap|as soon as possible/i.test(answers["deadline"] ?? "");
  const overallStyle = answers["overallStyle"] ?? "";
  const isAdvanced = /sci-fi|fantasy|custom/i.test(overallStyle);

  const lines: string[] = [];

  if (buttons.length > 0) {
    lines.push("**🔘 Buttons**");
    for (const btn of buttons) {
      const usd    = hasAnimation ? "$1.00" : "$0.50";
      const robux  = hasAnimation ? "50 R$" : "15 R$";
      lines.push(`› \`${btn}\` — ${usd} / ${robux}`);
    }
    lines.push("");
  }

  if (frames.length > 0) {
    lines.push("**🖼️ Frames**");
    for (const frm of frames) {
      const usd   = isAdvanced ? "$6–$10" : "$2–$6";
      const robux = isAdvanced ? "500–800 R$" : "150–500 R$";
      lines.push(`› \`${frm}\` — ${usd} / ${robux}`);
    }
    lines.push("");
  }

  if (isRush) {
    lines.push("**⚡ Rush (ASAP)** — +20% of base");
    lines.push("");
  }

  if (hasAnimation) {
    lines.push("**✨ Animation** — included in per-button rate");
    lines.push("");
  }

  lines.push(`**💰 Total: ${estimate.usd} USD** *(≈ ${estimate.robux})*`);
  lines.push(`\n*${estimate.reasoning}*`);

  return lines.join("\n");
}

/**
 * Returns two EmbedBuilder-compatible field objects to append to your review
 * embed.  Usage in flows.ts:
 *
 *   import { calculatePrice, buildPriceEmbedFields } from "./pricing.js";
 *   ...
 *   const estimate = await calculatePrice(session.answers);
 *   const priceFields = buildPriceEmbedFields(estimate, session.answers);
 *   embed.addFields(...priceFields);
 */
export function buildPriceEmbedFields(
  estimate: PriceEstimate,
  answers: Record<string, string>
): { name: string; value: string; inline?: boolean }[] {
  const method = answers["paymentMethod"] ?? "";

  // Build the price display line based on preferred payment(s)
  let priceDisplay: string;
  if (method.includes("Robux") && !method.includes("PayPal") && !method.includes("Gift Card")) {
    priceDisplay = `**${estimate.robux}**\n*(≈ ${estimate.usd} USD)*`;
  } else if (method.includes("Gift Card") && !method.includes("PayPal") && !method.includes("Robux")) {
    priceDisplay = `**${estimate.usd} (Gift Card)**\n*(≈ ${estimate.robux})*`;
  } else if (method.includes("Robux") && !method.includes("PayPal")) {
    // Gift Card + Robux
    priceDisplay = `**${estimate.usd} (Gift Card)** or **${estimate.robux}**`;
  } else {
    // PayPal present, or mixed — show USD as primary
    priceDisplay = `**${estimate.usd} USD**\n*(≈ ${estimate.robux})*`;
  }

  return [
    {
      name: "💰 Total Price",
      value: priceDisplay,
      inline: false,
    },
    {
      name: "🤖 Pricing Notes",
      value: estimate.reasoning,
      inline: false,
    },
  ];
}
