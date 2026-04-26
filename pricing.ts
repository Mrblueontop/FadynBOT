/**
 * pricing.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * AI-based price estimation for Fadyn Bot commission requests.
 *
 * Call `calculatePrice(answers)` just before rendering the final review embed.
 * It hits the Groq API (llama-3.3-70b-versatile) with a structured prompt and
 * returns a `PriceEstimate` containing USD and Robux values plus a reasoning blurb.
 *
 * Requires: GROQ_API_KEY in your .env / Railway environment variables.
 *
 * Integration points:
 *   1. Import and call `calculatePrice` inside `sendReviewEmbed` in flows.ts.
 *   2. Add the returned embed fields to the review EmbedBuilder.
 *   3. Update `paymentMethod` question options in questions.ts (remove Crypto,
 *      add Gift Card).
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
 * by `answers`.  Returns a `PriceEstimate` on success, or a safe fallback
 * object if the API call fails so the bot never crashes on this step.
 */
export async function calculatePrice(
  answers: Record<string, string>
): Promise<PriceEstimate> {
  const prompt = buildPricingPrompt(answers);

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
      return fallbackEstimate();
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    const text = data.choices[0]?.message?.content ?? "";
    return parsePricingResponse(text);
  } catch (err) {
    console.error("[pricing] fetch error:", err);
    return fallbackEstimate();
  }
}

// ─── Prompt construction ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are the pricing bot for Fadyn's Roblox UI commission service.
Your job is to estimate a fair price for a commission using the EXACT tier
system below. Do not invent prices outside these ranges.

=== OFFICIAL PRICE TIERS ===

🟢 Basic UI — $2–$5 USD / 200–500 R$
  Simple menus, small HUDs, basic layouts. 1–2 screens, no animations,
  minimal style, straightforward elements.

🟡 Standard UI — $5–$10 USD / 500–750 R$
  Main menus, shop UI, inventory screens, cleaner designs. 3–5 screens,
  polished look, may have simple tweens.

🔴 Advanced UI — $15–$25 USD / 750–2000 R$
  Full UI systems, polished and detailed layouts. 6+ screens OR rich
  animations, custom/complex style, heavy interactivity.

=== ADD-ONS (add to base price if applicable) ===
- Rush order: +30% of the base price
- Animations (AI-coded): +$1 USD / +50 R$ per animated screen
  (only add this if the client specifically mentions wanting animations/tweens)

=== RULES ===
- NEVER quote below $2 USD or above $25 USD.
- Roblox tax is already included — do not add extra for it.
- If the scope is unclear, default to the lower end of the matching tier.
- One free revision is included — do not adjust price for it.
- Output ONLY valid JSON, no markdown fences, no extra text:

{
  "usdMin": <number>,
  "usdMax": <number>,
  "robuxMin": <number>,
  "robuxMax": <number>,
  "reasoning": "<1–2 sentences: which tier and why, mention any add-ons>"
}
`.trim();

function buildPricingPrompt(answers: Record<string, string>): string {
  const lines: string[] = ["Commission intake answers:"];

  const labelMap: Record<string, string> = {
    name: "Client name",
    projectName: "Project name",
    projectDescription: "Project description",
    uiRequirementType: "UI elements needed",
    buttonStyle: "Button style",
    overallStyle: "Overall style",
    colorScheme: "Color scheme / fonts",
    reference: "Reference provided",
    paymentMethod: "Preferred payment",
    budgetPaypal: "Budget (PayPal)",
    budgetRobux: "Budget (Robux)",
    budgetGiftCard: "Budget (Gift Card)",
    extraInfo: "Extra info / deadline",
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
    };

    // Clamp USD to the actual price sheet limits: $2–$25
    const usdMin = Math.min(Math.max(2, Math.round(parsed.usdMin)), 25);
    const usdMax = Math.min(Math.max(usdMin, Math.round(parsed.usdMax)), 25);

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
    usd: "$5 – $10",
    robux: "500 – 750 R$",
    reasoning:
      "Estimated at Standard tier. Final price will be confirmed by the designer after reviewing your request.",
    raw: { usdMin: 5, usdMax: 10, robuxMin: 500, robuxMax: 750 },
  };
}

// ─── Embed field builder (call this inside sendReviewEmbed in flows.ts) ───────

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

  // Build the price display line based on preferred payment
  let priceDisplay: string;
  if (method === "Robux") {
    priceDisplay = `**${estimate.robux}**\n*(≈ ${estimate.usd} USD)*`;
  } else if (method === "Gift Card") {
    priceDisplay = `**${estimate.usd} (Gift Card)**\n*(≈ ${estimate.robux})*`;
  } else {
    // USD / PayPal / default
    priceDisplay = `**${estimate.usd} USD**\n*(≈ ${estimate.robux})*`;
  }

  return [
    {
      name: "💰 Estimated Price",
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
