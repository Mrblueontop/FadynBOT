import random
import httpx
from typing import Optional

# ── API Keys (rotated randomly for load balancing) ────────────────────────────
_GROQ_KEYS = [
    "GROQ_API_KEY1",
    "GROQ_API_KEY2",
    "GROQ_API_KEY3",
]

_GROQ_MODEL  = "llama-3.1-8b-instant"
_GROQ_URL    = "https://api.groq.com/openai/v1/chat/completions"

_PRICING_CONTEXT = """
You are a pricing estimator for a Roblox UI commission service.

PRICING TIERS:
- Basic UI:    $2–$5 USD  / 200–500 R$    → Simple menus, small HUDs, basic layouts
- Standard UI: $5–$10 USD / 500–2,000 R$  → Main menus, shop UI, inventory, cleaner designs
- Advanced UI: $10–$25 USD / 2,000–5,000 R$ → Full UI systems, polished layouts, detailed work

RULES:
- Read the user's current answers and estimate a price RANGE (e.g. "$5–$8 USD / 500–800 R$")
- Factors that push price UP: animations, custom styles, icons, multiple elements, complex layouts, custom design style
- Factors that keep price LOW: simple/preset styles, single element, no animations, no icons
- Always return ONLY a JSON object, no extra text, no markdown, in this exact format:
{"usd_low": 2, "usd_high": 5, "robux_low": 200, "robux_high": 500, "tier": "Basic"}
- tier must be one of: "Basic", "Standard", "Advanced"
- Never exceed the Advanced ceiling ($25 / 5000 R$)
""".strip()


def _pick_key() -> str:
    return random.choice(_GROQ_KEYS)


def estimate_price(answers: dict) -> Optional[dict]:
    """
    Takes the current answers dict and returns a price estimate dict:
    {
        "usd_low": int, "usd_high": int,
        "robux_low": int, "robux_high": int,
        "tier": str,          # "Basic" | "Standard" | "Advanced"
        "label": str,         # e.g. "$5–$8 USD | 500–800 R$"
    }
    Returns None on failure.
    """
    if not answers:
        return None

    answers_text = "\n".join(f"  {k}: {v}" for k, v in answers.items())
    user_message = f"Current commission answers:\n{answers_text}\n\nEstimate the price."

    payload = {
        "model": _GROQ_MODEL,
        "max_tokens": 120,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": _PRICING_CONTEXT},
            {"role": "user",   "content": user_message},
        ],
    }

    api_key = _pick_key()

    try:
        response = httpx.post(
            _GROQ_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10.0,
        )
        response.raise_for_status()
        raw = response.json()["choices"][0]["message"]["content"].strip()

        # Strip any accidental markdown fences
        raw = raw.replace("```json", "").replace("```", "").strip()

        import json
        data = json.loads(raw)

        data["label"] = (
            f"${data['usd_low']}–${data['usd_high']} USD  |  "
            f"{data['robux_low']:,}–{data['robux_high']:,} R$"
        )
        return data

    except Exception as e:
        # Silently fail — the footer just won't show an estimate
        return None


def format_price_footer(answers: dict) -> str:
    """
    Returns a ready-to-embed footer string for Discord embeds, e.g.:
    💰 Estimated price: $5–$8 USD | 500–800 R$  (Standard UI)
    Returns empty string if estimate fails.
    """
    result = estimate_price(answers)
    if not result:
        return ""

    tier_emoji = {"Basic": "🟢", "Standard": "🟡", "Advanced": "🔴"}.get(result["tier"], "💰")
    return f"💰 Estimated price: {result['label']}  {tier_emoji} {result['tier']} UI"
