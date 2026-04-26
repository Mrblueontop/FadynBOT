/**
 * pricing.ts
 * ──────────────────────────────────────────────────────────────────────────────
 * AI-based price estimation for Fadyn Bot commission requests.
 *
 * Call `calculatePrice(answers)` just before rendering the final review embed.
 * It hits the Anthropic API with a structured prompt and returns a
 * `PriceEstimate` containing USD and Robux values plus a short reasoning blurb.
 *
 * Integration points (see INTEGRATION GUIDE at the bottom of this file):
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
 * Approximate Robux ↔ USD conversion rate used for display.
 * 1 USD ≈ 100 Robux (post-marketplace-fee estimate).
 */
const ROBUX_PER_USD = 100;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Calls the Anthropic API to estimate a price for the commission described
 * by `answers`.  Returns a `PriceEstimate` on success, or a safe fallback
 * object if the API call fails so the bot never crashes on this step.
 */
export async function calculatePrice(
  answers: Record<string, string>
): Promise<PriceEstimate> {
  const prompt = buildPricingPrompt(answers);

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // The Anthropic SDK middleware injects the key automatically when this
        // runs inside the Claude artifact/worker environment.  If you're running
        // the bot outside that environment set ANTHROPIC_API_KEY in your .env
        // and uncomment the next line:
        // "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error(`[pricing] API error ${response.status}`);
      return fallbackEstimate();
    }

    const data = (await response.json()) as {
      content: { type: string; text?: string }[];
    };

    const text = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");

    return parsePricingResponse(text);
  } catch (err) {
    console.error("[pricing] fetch error:", err);
    return fallbackEstimate();
  }
}

// ─── Prompt construction ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are a Roblox UI commission pricing expert for a freelance UI designer.
Your job is to estimate a fair price range for a UI commission based on the
client's answers to an intake form.

Pricing guidelines:
- Simple single-screen UI (e.g. one menu, no animations): $5–$10 USD
- Moderate scope (2–5 screens, basic tweens): $10–$20 USD
- Complex scope (6+ screens OR rich tween animations): $20–$40 USD
- Very large / full-game UI suite: $40–$80 USD

Complexity signals (raise price):
- Many distinct UI elements (HUD + shop + inventory + more)
- Tween / animation requirement mentioned
- Custom or unique style requested
- Tight deadline mentioned
- Lots of interactivity described

Simplicity signals (lower price):
- Minimal style
- Single screen or panel
- No animations
- Small project / prototype

Always respond ONLY with valid JSON — no markdown fences, no extra text:
{
  "usdMin": <number>,
  "usdMax": <number>,
  "reasoning": "<1–2 sentences explaining the estimate>"
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
    budgetOther: "Budget (other)",
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
    // Strip any accidental markdown fences just in case
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as {
      usdMin: number;
      usdMax: number;
      reasoning: string;
    };

    const usdMin = Math.max(1, Math.round(parsed.usdMin));
    const usdMax = Math.max(usdMin, Math.round(parsed.usdMax));
    const robuxMin = usdMin * ROBUX_PER_USD;
    const robuxMax = usdMax * ROBUX_PER_USD;

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
    usd: "$10 – $25",
    robux: "1,000 – 2,500 R$",
    reasoning:
      "Price estimated based on typical commission scope. Final price will be confirmed by the designer.",
    raw: { usdMin: 10, usdMax: 25, robuxMin: 1000, robuxMax: 2500 },
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
