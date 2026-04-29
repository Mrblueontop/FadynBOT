/**
 * pricing.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * AI-based per-item price estimation for Fadyn Bot.
 *
 * The AI prices EACH button and EACH frame individually based on its name and
 * context (style, animation, overall complexity), then sums them up.
 * This replaces the old flat-tier approach so a "Shop" frame that's clearly
 * complex gets priced higher than a "Confirm" button that's trivially simple.
 *
 * Also exports `validatePaymentSplit` — AI-powered payment split validator
 * that replaces the brittle regex-based percentage check in message.ts.
 *
 * Requires: GROQ_API_KEY in your .env / Railway environment variables.
 * ──────────────────────────────────────────────────────────────────────────────
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ItemPrice {
  name: string;
  type: "button" | "frame";
  usd: number;        // exact USD price for this item
  robux: number;      // exact Robux price for this item
  reason: string;     // one short sentence explaining the price
}

export interface PriceEstimate {
  usd: string;        // e.g. "$15 – $25"
  robux: string;      // e.g. "1,500 – 2,500 R$"
  reasoning: string;  // 1–2 sentence summary shown in embed
  items: ItemPrice[]; // per-item breakdown for the breakdown button
  raw: {
    usdMin: number;
    usdMax: number;
    robuxMin: number;
    robuxMax: number;
  };
}

export interface PaymentValidationResult {
  valid: boolean;
  normalized?: string;  // cleaned split string e.g. "PayPal: 60%, Robux: 40%"
  reason?: string;      // human-readable error shown to user if invalid
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GROQ_API_URL  = "https://api.groq.com/openai/v1/chat/completions";
const MODEL         = "llama-3.3-70b-versatile";
const ROBUX_PER_USD = 80; // conversion rate (includes Roblox tax)

// ─── System prompts ───────────────────────────────────────────────────────────

const PRICING_SYSTEM_PROMPT = `
You are the pricing engine for Fadyn's Roblox UI commission service.
You price EACH button and EACH frame individually based on how hard it is to create.

=== PRICING RANGES ===

BUTTONS — $0.50 to $3.00 USD each
  $0.50 : Dead-simple. Single word, no style needed. e.g. "OK", "Yes", "No"
  $1.00 : Standard button. e.g. "Play", "Back", "Close", "Settings"
  $1.50 : Styled button with icon or hover state. e.g. "Shop", "Inventory", "Profile"
  $2.00 : Complex — animated, gradient, or multi-state. e.g. "Start Game", "Buy Now"
  $2.50 : Very complex — custom shape, particle effect, or multi-layer design
  $3.00 : Exceptional only — full custom animated button with effects

FRAMES — $2.00 to $15.00 USD each
  $2–$3   : Minimal. Single-purpose, few elements. e.g. "Loading Bar", "Tooltip"
  $3–$5   : Simple screen. e.g. "Settings Menu", "Pause Screen", "Confirm Dialog"
  $5–$8   : Standard layout. e.g. "Main Menu", "HUD", "Leaderboard"
  $8–$12  : Complex screen. e.g. "Shop", "Inventory Grid", "Character Customizer"
  $12–$15 : Very complex — multi-tab, animated, data-heavy. e.g. "Full Shop with tabs"

=== MODIFIERS (apply to individual item prices, not the total) ===
  Animation: Yes  → multiply each item price by 1.3
  Style is Sci-Fi or Fantasy → multiply frame prices by 1.2
  Style is Minimal → multiply frame prices by 0.9

=== CONSTRAINTS ===
  Minimum per button: $0.50. Maximum per button: $3.00.
  Minimum per frame: $2.00. Maximum per frame: $15.00.
  Maximum total: $60 USD.
  Robux = USD × 80 (Roblox tax already included — do not add extra).
  Rush surcharge is applied in code after your response — do NOT add it here.

=== OUTPUT FORMAT ===
Respond ONLY with valid JSON, no markdown, no extra text:
{
  "items": [
    { "name": "Shop", "type": "frame", "usd": 8.00, "robux": 640, "reason": "Standard shop screen with grid layout" },
    { "name": "Play", "type": "button", "usd": 1.00, "robux": 80, "reason": "Standard single-word button" }
  ],
  "reasoning": "1–2 sentence summary of total and key pricing factors"
}
`.trim();

const PAYMENT_SYSTEM_PROMPT = `
You are a payment validator for a Roblox UI commission bot.
The client selected multiple payment methods and must say how to split the total between them.

Your job: parse their answer and validate it.

Rules:
- Accepted methods: "PayPal", "Robux", "Gift Card"
- Percentages must sum to exactly 100
- Each method mentioned must be one of the three accepted methods
- Minor typos and casual phrasing are fine (e.g. "paypal", "robux", "giftcard", "gift card")
- Formats like "50/50", "PayPal 60 Robux 40", "60% paypal the rest robux" are all valid

If valid, return a normalized split string.
If invalid, explain exactly what is wrong in one short sentence.

Respond ONLY with valid JSON, no markdown, no extra text:
{ "valid": true, "normalized": "PayPal: 60%, Robux: 40%" }
{ "valid": false, "reason": "Percentages add up to 90%, not 100%." }
`.trim();

// ─── Main exports ─────────────────────────────────────────────────────────────

/**
 * Prices every individual button and frame by name and context using AI,
 * then sums them up into a PriceEstimate.
 * Falls back to a safe estimate if Groq is unavailable.
 */
export async function calculatePrice(
  answers: Record<string, string>
): Promise<PriceEstimate> {
  const uiRaw    = answers["uiRequirementType"] ?? "";
  const btnMatch = uiRaw.match(/Buttons Needed:\s*(.+)/i);
  const frmMatch = uiRaw.match(/Frames Needed:\s*(.+)/i);
  const buttons  = btnMatch?.[1]?.split(/[,\n]+/).map(s => s.trim()).filter(Boolean) ?? [];
  const frames   = frmMatch?.[1]?.split(/[,\n]+/).map(s => s.trim()).filter(Boolean) ?? [];

  if (buttons.length === 0 && frames.length === 0) {
    return fallbackEstimate();
  }

  const isRush       = /asap|as soon as possible/i.test(answers["deadline"] ?? "");
  const animation    = answers["animation"]         ?? "No";
  const overallStyle = answers["overallStyle"]      ?? "";
  const buttonStyle  = answers["buttonStyle"]       ?? "";
  const description  = answers["projectDescription"] ?? "";

  const userPrompt = [
    "Please price each UI element for this Roblox commission:",
    "",
    buttons.length > 0 ? `Buttons: ${buttons.join(", ")}` : null,
    frames.length  > 0 ? `Frames: ${frames.join(", ")}`   : null,
    "",
    `Overall style: ${overallStyle || "not specified"}`,
    `Button style: ${buttonStyle   || "not specified"}`,
    `Animation: ${animation}`,
    `Project description: ${description || "not provided"}`,
  ].filter(Boolean).join("\n");

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY ?? ""}`,
      },
      body: JSON.stringify({
        model:       MODEL,
        max_tokens:  800,
        temperature: 0.1,
        messages: [
          { role: "system", content: PRICING_SYSTEM_PROMPT },
          { role: "user",   content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`[pricing] Groq error ${response.status}`);
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

/**
 * AI-powered payment split validator.
 * Pass the raw string the user typed and the methods they selected.
 * Returns { valid, normalized } on success or { valid: false, reason } on failure.
 */
export async function validatePaymentSplit(
  raw: string,
  selectedMethods: string[]
): Promise<PaymentValidationResult> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: false, reason: "Please enter how you'd like to split the payment." };
  }

  const userPrompt = [
    `Selected payment methods: ${selectedMethods.join(", ")}`,
    `Client's split answer: "${trimmed}"`,
  ].join("\n");

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY ?? ""}`,
      },
      body: JSON.stringify({
        model:       MODEL,
        max_tokens:  128,
        temperature: 0,
        messages: [
          { role: "system", content: PAYMENT_SYSTEM_PROMPT },
          { role: "user",   content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error(`[pricing] payment validation Groq error ${response.status}`);
      return { valid: true, normalized: trimmed }; // fail-open
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    const text   = data.choices[0]?.message?.content ?? "";
    const clean  = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as { valid: boolean; normalized?: string; reason?: string };

    return parsed.valid
      ? { valid: true,  normalized: parsed.normalized ?? trimmed }
      : { valid: false, reason: parsed.reason ?? "Invalid payment split." };
  } catch (err) {
    console.error("[pricing] payment validation error:", err);
    return { valid: true, normalized: trimmed }; // fail-open
  }
}

// ─── Rush markup ──────────────────────────────────────────────────────────────

function applyRush(estimate: PriceEstimate, isRush: boolean): PriceEstimate {
  if (!isRush) return estimate;

  const RUSH    = 1.2;
  const usdMin  = Math.min(+(estimate.raw.usdMin  * RUSH).toFixed(2), 60);
  const usdMax  = Math.min(+(estimate.raw.usdMax  * RUSH).toFixed(2), 60);
  const robuxMin = Math.round(estimate.raw.robuxMin * RUSH);
  const robuxMax = Math.round(estimate.raw.robuxMax * RUSH);

  const items = estimate.items.map(item => ({
    ...item,
    usd:   +(item.usd   * RUSH).toFixed(2),
    robux: Math.round(item.robux * RUSH),
  }));

  return {
    usd:       formatUsdRange(usdMin, usdMax),
    robux:     formatRobuxRange(robuxMin, robuxMax),
    reasoning: estimate.reasoning + " ⚡ Rush surcharge (+20%) applied.",
    items,
    raw: { usdMin, usdMax, robuxMin, robuxMax },
  };
}

// ─── Response parsing ─────────────────────────────────────────────────────────

function parsePricingResponse(text: string): PriceEstimate {
  try {
    const clean  = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as {
      items: { name: string; type: string; usd: number; robux: number; reason: string }[];
      reasoning: string;
    };

    const items: ItemPrice[] = parsed.items.map(item => {
      const type  = item.type === "frame" ? "frame" : "button" as const;
      const usd   = type === "button"
        ? Math.min(Math.max(0.5, +item.usd), 3)
        : Math.min(Math.max(2,   +item.usd), 15);
      const robux = Math.round(usd * ROBUX_PER_USD);
      return { name: item.name, type, usd, robux, reason: (item.reason ?? "").slice(0, 100) };
    });

    const totalUsd   = +items.reduce((s, i) => s + i.usd,   0).toFixed(2);
    const totalRobux = items.reduce((s, i) => s + i.robux, 0);

    // ±5% buffer for display range
    const usdMin   = Math.max(0.5, +(totalUsd   * 0.95).toFixed(2));
    const usdMax   = Math.min(60,  +(totalUsd   * 1.05).toFixed(2));
    const robuxMin = Math.round(totalRobux * 0.95);
    const robuxMax = Math.round(totalRobux * 1.05);

    return {
      usd:       formatUsdRange(usdMin, usdMax),
      robux:     formatRobuxRange(robuxMin, robuxMax),
      reasoning: (parsed.reasoning ?? "").slice(0, 250),
      items,
      raw: { usdMin, usdMax, robuxMin, robuxMax },
    };
  } catch {
    console.error("[pricing] Failed to parse AI response:", text);
    return fallbackEstimate();
  }
}

function fallbackEstimate(): PriceEstimate {
  return {
    usd:       "$5 – $10",
    robux:     "400 – 800 R$",
    reasoning: "Could not calculate price automatically. Final price will be confirmed by the designer.",
    items:     [],
    raw:       { usdMin: 5, usdMax: 10, robuxMin: 400, robuxMax: 800 },
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatUsdRange(min: number, max: number): string {
  const fmt = (n: number) => n % 1 === 0 ? `$${n}` : `$${n.toFixed(2)}`;
  return Math.abs(min - max) < 0.01 ? fmt(min) : `${fmt(min)} – ${fmt(max)}`;
}

function formatRobuxRange(min: number, max: number): string {
  return Math.abs(min - max) < 1
    ? `${min.toLocaleString()} R$`
    : `${min.toLocaleString()} – ${max.toLocaleString()} R$`;
}

// ─── Per-item breakdown store ─────────────────────────────────────────────────

const breakdownStore = new Map<string, string>();

export function storePriceBreakdown(messageId: string, text: string): void {
  breakdownStore.set(messageId, text);
}

export function getPriceBreakdown(messageId: string): string | null {
  return breakdownStore.get(messageId) ?? null;
}

/**
 * Builds the detailed per-item breakdown string shown when staff click
 * "Price Breakdown" on the log embed.
 */
export function buildPriceBreakdown(
  answers: Record<string, string>,
  estimate: PriceEstimate
): string {
  const isRush    = /asap|as soon as possible/i.test(answers["deadline"] ?? "");
  const animation = answers["animation"] === "Yes";
  const lines: string[] = [];

  const buttons = estimate.items.filter(i => i.type === "button");
  const frames  = estimate.items.filter(i => i.type === "frame");

  if (buttons.length > 0) {
    lines.push("**🔘 Buttons**");
    for (const item of buttons) {
      lines.push(`› \`${item.name}\` — $${item.usd.toFixed(2)} / ${item.robux.toLocaleString()} R$`);
      lines.push(`  *${item.reason}*`);
    }
    lines.push("");
  }

  if (frames.length > 0) {
    lines.push("**🖼️ Frames**");
    for (const item of frames) {
      lines.push(`› \`${item.name}\` — $${item.usd.toFixed(2)} / ${item.robux.toLocaleString()} R$`);
      lines.push(`  *${item.reason}*`);
    }
    lines.push("");
  }

  if (estimate.items.length === 0) {
    lines.push("*No individual item breakdown available.*");
    lines.push("");
  }

  if (animation) lines.push("**✨ Animation** — ×1.3 per item (already included above)");
  if (isRush)    lines.push("**⚡ Rush (ASAP)** — ×1.2 surcharge (already included above)");
  if (animation || isRush) lines.push("");

  lines.push(`**💰 Total: ${estimate.usd} USD** *(≈ ${estimate.robux})*`);
  lines.push(`\n*${estimate.reasoning}*`);

  return lines.join("\n");
}

/**
 * Builds the two embed fields shown on the review and log embeds.
 * Displays price formatted for the user's selected payment method(s).
 */
export function buildPriceEmbedFields(
  estimate: PriceEstimate,
  answers: Record<string, string>
): { name: string; value: string; inline?: boolean }[] {
  const method      = answers["paymentMethod"] ?? "";
  const splitAnswer = answers["paymentSplit"];

  let priceDisplay: string;

  if (splitAnswer && splitAnswer !== "N/A") {
    // Multi-method with AI-confirmed split
    priceDisplay =
      `**${estimate.usd} USD** *(≈ ${estimate.robux})*\n` +
      `Split: ${splitAnswer}`;
  } else if (method.includes("Robux") && !method.includes("PayPal") && !method.includes("Gift Card")) {
    priceDisplay = `**${estimate.robux}**\n*(≈ ${estimate.usd} USD)*`;
  } else if (method.includes("Gift Card") && !method.includes("PayPal") && !method.includes("Robux")) {
    priceDisplay = `**${estimate.usd} (Gift Card)**\n*(≈ ${estimate.robux})*`;
  } else {
    priceDisplay = `**${estimate.usd} USD**\n*(≈ ${estimate.robux})*`;
  }

  return [
    { name: "💰 Total Price",   value: priceDisplay,       inline: false },
    { name: "🤖 Pricing Notes", value: estimate.reasoning, inline: false },
  ];
}
