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
    kind: str  # "text" | "choice" | "dropdown" | "media"
    options: List = field(default_factory=list)
    optional: bool = False
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    accept_media: bool = False
    min_values: int = 1
    max_values: int = 1
    show_if: Optional[Callable[[dict], bool]] = None


COMMISSION_QUESTIONS: List[Question] = [
    Question(
        id="name",
        prompt="What is your name?",
        kind="text",
    ),
    Question(
        id="project_name",
        prompt="What is your project name?",
        kind="text",
    ),
    Question(
        id="ui_type",
        prompt="What type of UI do you need?",
        kind="choice",
        options=[
            ChoiceOption("🔘 Buttons UI", "Buttons UI"),
            ChoiceOption("🖼️ Frames UI",  "Frames UI"),
            ChoiceOption("⚡ Both",        "Both"),
        ],
    ),
    Question(
        id="button_style",
        prompt="What style of buttons do you want?",
        kind="choice",
        options=[
            ChoiceOption("Rounded",          "Rounded"),
            ChoiceOption("Square",           "Square"),
            ChoiceOption("Neon/Glow ✨",     "Neon/Glow"),
            ChoiceOption("Custom 🖊️",        "Custom"),
        ],
        show_if=lambda a: a.get("ui_type") in ("Buttons UI", "Both"),
    ),
    Question(
        id="button_style_custom",
        prompt="Describe your custom button style:",
        kind="text",
        show_if=lambda a: a.get("button_style") == "Custom",
    ),
    Question(
        id="frame_style",
        prompt="What style of frames do you want?",
        kind="choice",
        options=[
            ChoiceOption("Sharp",               "Sharp"),
            ChoiceOption("Rounded",             "Rounded"),
            ChoiceOption("Glass / Transparent", "Glass / Transparent"),
            ChoiceOption("Neon/Glow ✨",        "Neon/Glow"),
            ChoiceOption("Custom 🖊️",           "Custom"),
        ],
        show_if=lambda a: a.get("ui_type") in ("Frames UI", "Both"),
    ),
    Question(
        id="frame_style_custom",
        prompt="Describe your custom frame style:",
        kind="text",
        show_if=lambda a: a.get("frame_style") == "Custom",
    ),
    Question(
        id="elements",
        prompt="Which UI elements do you need?",
        kind="dropdown",
        min_values=1,
        max_values=7,
        options=[
            DropdownOption("Main Menu",                 "Main Menu"),
            DropdownOption("HUD (health, ammo, etc.)", "HUD"),
            DropdownOption("Inventory",                 "Inventory"),
            DropdownOption("Shop",                      "Shop"),
            DropdownOption("Settings Menu",             "Settings Menu"),
            DropdownOption("Leaderboard",               "Leaderboard"),
            DropdownOption("Other",                     "Other"),
        ],
    ),
    Question(
        id="design_style",
        prompt="What overall style are you going for?",
        kind="choice",
        options=[
            ChoiceOption("🕹️ Retro",      "Retro"),
            ChoiceOption("🎨 Cartoon",    "Cartoon"),
            ChoiceOption("✨ Neon/Glow",  "Neon/Glow"),
        ],
    ),
    Question(
        id="color_scheme",
        prompt="What is your preferred color scheme? (Also mention fonts/branding or say none)",
        kind="text",
    ),
    Question(
        id="reference",
        prompt="Please provide a reference image link or description.",
        kind="text",
        accept_media=True,
    ),
    Question(
        id="payment_method",
        prompt="How would you like to pay?",
        kind="choice",
        options=[
            ChoiceOption("💳 PayPal",   "PayPal"),
            ChoiceOption("💵 Cash App", "Cash App"),
            ChoiceOption("🎮 Robux",    "Robux"),
            ChoiceOption("❓ Other",    "Other"),
        ],
    ),
    Question(
        id="budget",
        prompt="What is your budget range?",
        kind="choice",
        options=[
            ChoiceOption("Under $50",  "Under $50"),
            ChoiceOption("$50–$100",   "$50–$100"),
            ChoiceOption("$100–$300",  "$100–$300"),
            ChoiceOption("$300+",      "$300+"),
            ChoiceOption("Custom 🖊️", "Custom"),
        ],
    ),
    Question(
        id="budget_custom",
        prompt="Type your custom budget amount:",
        kind="text",
        show_if=lambda a: a.get("budget") == "Custom",
    ),
    Question(
        id="extra_info",
        prompt="Anything else I should know? (deadlines, special requests, etc. — or reply 'none')",
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
