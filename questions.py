from dataclasses import dataclass, field
from typing import Optional, Callable, List


@dataclass
class DropdownOption:
    label: str
    value: str
    description: Optional[str] = None


@dataclass
class ChoiceOption:
    label: str
    value: str
    emoji: Optional[str] = None


@dataclass
class Question:
    id: str
    prompt: str
    kind: str  # "text" | "choice" | "dropdown"
    options: List = field(default_factory=list)
    optional: bool = False
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    accept_media: bool = False
    min_values: int = 1
    max_values: int = 1
    show_if: Optional[Callable[[dict], bool]] = None


def _is_buttons(a: dict) -> bool:
    return a.get("ui_type") in ("Buttons UI", "Both")

def _is_frames(a: dict) -> bool:
    return a.get("ui_type") in ("Frames UI", "Both")


COMMISSION_QUESTIONS: List[Question] = [

    # ── Shared: opening ───────────────────────────────────────────────────────
    Question(
        id="name",
        prompt=(
            "What's your name?\n\n"
            "This is just so I know what to call you throughout the process. "
            "A first name or nickname is totally fine!"
        ),
        kind="text",
    ),
    Question(
        id="project_name",
        prompt=(
            "What is your Roblox game or project called?\n\n"
            "If it doesn't have an official name yet, just use a working title — "
            "it helps me keep track of your order."
        ),
        kind="text",
    ),
    Question(
        id="project_description",
        prompt=(
            "Give me a short description of your project.\n\n"
            "What kind of game is it? What's the genre, setting, or vibe? "
            "The more context you give me, the better I can tailor the UI to match your game's identity."
        ),
        kind="text",
        min_length=20,
        max_length=800,
    ),
    Question(
        id="ui_type",
        prompt=(
            "What type of UI are you looking to commission?\n\n"
            "• **Buttons UI** — clickable buttons, action bars, nav elements\n"
            "• **Frames UI** — panels, menus, windows, overlays\n"
            "• **Both** — a full UI package covering buttons and frames\n\n"
            "Your choice will determine which follow-up questions appear."
        ),
        kind="choice",
        options=[
            ChoiceOption("🔘 Buttons UI", "Buttons UI"),
            ChoiceOption("🖼️ Frames UI",  "Frames UI"),
            ChoiceOption("⚡ Both",        "Both"),
        ],
    ),

    # ── Buttons track ─────────────────────────────────────────────────────────
    Question(
        id="button_style",
        prompt=(
            "What shape/style would you like your buttons to have?\n\n"
            "• **Rounded** — smooth, pill-like corners, modern feel\n"
            "• **Square** — sharp corners, clean and minimal\n"
            "• **Custom** — describe your own style: shape, edges, borders, shadow, "
            "thickness, or any specific effects you want\n\n"
            "Pick one of the presets, or select **Custom** and type your description below."
        ),
        kind="choice",
        options=[
            ChoiceOption("Rounded",    "Rounded"),
            ChoiceOption("Square",     "Square"),
            ChoiceOption("Custom 🖊️", "Custom"),
        ],
    ),
    Question(
        id="button_hover",
        prompt=(
            "Should the buttons react when hovered over or clicked?\n\n"
            "Animations add a polished, professional feel to your UI. "
            "If you pick **Custom**, you can describe exactly what you want."
        ),
        kind="choice",
        options=[
            ChoiceOption("✅ Yes — animated",   "Yes"),
            ChoiceOption("🚫 No — static only", "No"),
            ChoiceOption("Custom 🖊️",            "Custom"),
        ],
        show_if=_is_buttons,
    ),
    Question(
        id="button_hover_custom",
        prompt=(
            "Describe the hover/click animation or effect you want.\n\n"
            "Examples: glow on hover, scale up on click, color shift, ripple effect, bounce, etc. "
            "Be as specific as you like!"
        ),
        kind="text",
        show_if=lambda a: _is_buttons(a) and a.get("button_hover") == "Custom",
    ),
    Question(
        id="button_icons",
        prompt=(
            "Should the buttons include icons alongside the text?\n\n"
            "Icons add visual clarity and make buttons easier to read at a glance. "
            "If you pick **Custom**, describe what you have in mind."
        ),
        kind="choice",
        options=[
            ChoiceOption("✅ Yes — include icons", "Yes"),
            ChoiceOption("🔤 No — text only",      "No"),
            ChoiceOption("Custom 🖊️",               "Custom"),
        ],
        show_if=_is_buttons,
    ),
    Question(
        id="button_icons_custom",
        prompt=(
            "Describe the icons or labels you have in mind.\n\n"
            "For example: style (flat, outlined, filled), source (Roblox built-in assets, custom art), "
            "placement (left of text, right, icon-only), or anything else relevant."
        ),
        kind="text",
        show_if=lambda a: _is_buttons(a) and a.get("button_icons") == "Custom",
    ),

    # ── Frames track ──────────────────────────────────────────────────────────
    Question(
        id="frame_style",
        prompt=(
            "What visual style would you like your frames and panels to have?\n\n"
            "• **Sharp** — hard edges, bold and structured\n"
            "• **Rounded** — soft corners, friendly and modern\n"
            "• **Glass / Transparent** — frosted or see-through look\n"
            "• **Custom** — you'll describe exactly what you want"
        ),
        kind="choice",
        options=[
            ChoiceOption("Sharp",               "Sharp"),
            ChoiceOption("Rounded",             "Rounded"),
            ChoiceOption("Glass / Transparent", "Glass / Transparent"),
            ChoiceOption("Custom 🖊️",           "Custom"),
        ],
        show_if=_is_frames,
    ),
    Question(
        id="frame_style_custom",
        prompt=(
            "Describe your ideal frame style.\n\n"
            "Think about borders, corners, drop shadows, textures, stroke thickness, "
            "or any specific effects. The more detail, the closer the result will be to your vision!"
        ),
        kind="text",
        show_if=lambda a: _is_frames(a) and a.get("frame_style") == "Custom",
    ),
    # ── Shared: elements + design ─────────────────────────────────────────────
    Question(
        id="elements",
        prompt=(
            "What type of UI frame do you need?\n\n"
            "Select all that apply — I'll make sure each one is covered in the final delivery."
        ),
        kind="dropdown",
        min_values=1,
        max_values=7,
        show_if=lambda a: a.get("ui_type") != "Buttons UI",
        options=[
            DropdownOption("Main Menu",                 "Main Menu",      "Title screen / main hub"),
            DropdownOption("HUD (health, ammo, etc.)", "HUD",            "In-game heads-up display"),
            DropdownOption("Inventory",                 "Inventory",      "Item storage & management"),
            DropdownOption("Shop",                      "Shop",           "In-game purchase screen"),
            DropdownOption("Settings Menu",             "Settings Menu",  "Options / preferences screen"),
            DropdownOption("Leaderboard",               "Leaderboard",    "Ranking / stats display"),
            DropdownOption("Other",                     "Other",          "Something not listed here"),
        ],
    ),
    Question(
        id="design_style",
        prompt=(
            "What's the overall visual theme or aesthetic you're going for?\n\n"
            "• **🕹️ Retro** — pixel art, arcade, old-school gaming feel\n"
            "• **🎨 Cartoon** — bold outlines, flat colors, playful look\n"
            "• **Custom** — describe your own unique style"
        ),
        kind="choice",
        options=[
            ChoiceOption("🕹️ Retro",   "Retro"),
            ChoiceOption("🎨 Cartoon", "Cartoon"),
            ChoiceOption("Custom 🖊️",  "Custom"),
        ],
    ),
    Question(
        id="design_style_custom",
        prompt=(
            "Describe the design style or aesthetic you have in mind.\n\n"
            "Think about mood, theme, inspirations, games with a similar look, "
            "or any specific visual direction you want to go in."
        ),
        kind="text",
        show_if=lambda a: a.get("design_style") == "Custom",
    ),
    Question(
        id="color_scheme",
        prompt=(
            "List 2–4 colors for your UI using HEX codes or clear color names.\n\n"
            "**Format:** primary color, accent color, background color (+ any to avoid)\n"
            "**Example:** `#1A1A2E` (dark navy), `#E94560` (red accent), avoid green\n\n"
            "Also mention any fonts or existing branding if relevant.\n"
            "*(No preference? Reply **skip** to leave this open.)*"
        ),
        kind="text",
        min_length=7,
        optional=True,
    ),
    Question(
        id="reference",
        prompt=(
            "Please share a visual reference for your UI.\n\n"
            "**Accepted formats:**\n"
            "• 🎥 YouTube link\n"
            "• 🐦 X (Twitter) link\n"
            "• 🖼️ Image attachment (upload directly here)\n\n"
            "*(Plain text descriptions alone are not accepted — attach an image or paste a link.)*"
        ),
        kind="text",
        accept_media=True,
    ),

    # ── Shared: payment ───────────────────────────────────────────────────────
    Question(
        id="payment_method",
        prompt=(
            "How would you prefer to pay once the work is complete?\n\n"
            "You can select multiple options if you're flexible — "
            "we'll agree on the final method before I start."
        ),
        kind="dropdown",
        min_values=1,
        max_values=4,
        options=[
            DropdownOption("💳 PayPal",   "PayPal",   "USD via PayPal"),
            DropdownOption("💵 Cash App", "Cash App", "USD via Cash App"),
            DropdownOption("🎮 Robux",    "Robux",    "Roblox currency"),
            DropdownOption("❓ Other",    "Other",    "Something else"),
        ],
    ),
    Question(
        id="extra_info",
        prompt=(
            "Is there anything else you'd like me to know before I get started?\n\n"
            "Feel free to mention deadlines, things to avoid, specific inspiration, "
            "platform requirements, or any other details that didn't come up earlier. "
            "*(You can also just reply **none** if everything's covered.)*"
        ),
        kind="text",
        optional=True,
    ),
]


def get_next_question(answers: dict) -> Optional[Question]:
    for q in COMMISSION_QUESTIONS:
        if q.show_if and not q.show_if(answers):
            continue
        if q.id not in answers:
            return q
    return None


def resolve_label(q: Question, value: str) -> str:
    if q.kind in ("dropdown", "choice"):
        for opt in q.options:
            if opt.value == value:
                return opt.label
    return value
