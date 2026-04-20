import discord
from discord.ui import View, Button, Select
from datetime import datetime
from typing import Optional
from questions import (
    COMMISSION_QUESTIONS, get_next_question, resolve_label,
    Question, DropdownOption, ChoiceOption,
)

BRAND_COLOR   = 0x7B2FFF
ACCENT_COLOR  = 0x00F5FF
SUCCESS_COLOR = 0x00FF88
ERROR_COLOR   = 0xFF4466


def make_embed(title: str, description: str, color: int = BRAND_COLOR) -> discord.Embed:
    embed = discord.Embed(title=title, description=description, color=color)
    embed.set_footer(text="Fadyn Bot • Roblox UI Commissions")
    return embed


def answered_embed(q: Question, answer: str) -> discord.Embed:
    embed = discord.Embed(title=f"✅ {q.prompt[:100]}", color=BRAND_COLOR)
    embed.add_field(name="Your Answer", value=f"```{answer[:1000]}```", inline=False)
    embed.set_footer(text="Fadyn Bot • Click ✏️ Edit to change this answer")
    return embed


# ─── VIEWS ────────────────────────────────────────────────────────────────────

class MainEntryView(View):
    def __init__(self):
        super().__init__(timeout=None)
        self.add_item(Button(
            label="🛒 Create Order",
            style=discord.ButtonStyle.primary,
            custom_id="flow_start",
        ))


class ConfirmStartView(View):
    def __init__(self):
        super().__init__(timeout=120)
        self.add_item(Button(label="Yes, let's go! ✅", style=discord.ButtonStyle.success,   custom_id="flow_confirm_yes"))
        self.add_item(Button(label="Not right now ❌",  style=discord.ButtonStyle.secondary, custom_id="flow_confirm_no"))


class EditButtonView(View):
    def __init__(self, question_id: str):
        super().__init__(timeout=None)
        self.add_item(Button(label="✏️ Edit", style=discord.ButtonStyle.secondary, custom_id=f"flow_edit:{question_id}"))


class SkipButtonView(View):
    def __init__(self, question_id: str):
        super().__init__(timeout=None)
        self.add_item(Button(label="Skip ⏭️", style=discord.ButtonStyle.secondary, custom_id=f"flow_skip:{question_id}"))


class ChoiceView(View):
    def __init__(self, q: Question):
        super().__init__(timeout=600)
        for opt in q.options:
            label = f"{opt.emoji} {opt.label}" if opt.emoji else opt.label
            self.add_item(Button(
                label=label[:80],
                style=discord.ButtonStyle.primary,
                custom_id=f"flow_choice:{q.id}:{opt.value}",
            ))
        if q.optional:
            self.add_item(Button(label="Skip ⏭️", style=discord.ButtonStyle.secondary, custom_id=f"flow_skip:{q.id}"))


class DropdownView(View):
    def __init__(self, q: Question):
        super().__init__(timeout=600)
        self.add_item(Select(
            custom_id=f"flow_dropdown:{q.id}",
            placeholder="Select all that apply..." if q.max_values > 1 else "Select an option...",
            min_values=q.min_values,
            max_values=min(q.max_values, len(q.options)),
            options=[
                discord.SelectOption(
                    label=opt.label[:100],
                    value=opt.value[:100],
                    description=(opt.description[:100] if opt.description else None),
                )
                for opt in q.options
            ],
        ))
        if q.optional:
            self.add_item(Button(label="Skip ⏭️", style=discord.ButtonStyle.secondary, custom_id=f"flow_skip:{q.id}"))


class FinalConfirmView(View):
    def __init__(self):
        super().__init__(timeout=300)
        self.add_item(Button(label="✅ Submit Order!",  style=discord.ButtonStyle.success, custom_id="flow_submit_yes"))
        self.add_item(Button(label="❌ Cancel",          style=discord.ButtonStyle.danger,  custom_id="flow_submit_no"))


# ─── SESSION ──────────────────────────────────────────────────────────────────

def new_session() -> dict:
    return {
        "_answers": {},            # question_id -> answer string
        "_awaiting_text": None,    # question_id we're waiting a text reply for
        "_awaiting_msg_id": None,  # message id of the question prompt
        "_started_at": datetime.utcnow().isoformat(),
    }


# ─── MAIN FLOW CLASS ──────────────────────────────────────────────────────────

class CommissionFlow:
    def __init__(self, bot, log_channel_id: int, owner_id: int):
        self.bot            = bot
        self.log_channel_id = log_channel_id
        self.owner_id       = owner_id
        self.sessions: dict[int, dict] = {}
        self.pending:  set[int]        = set()
        self.order_counter = 0

    # ── POST MAIN EMBED ────────────────────────────────────────────────────────

    async def post_main_embed(self, channel: discord.TextChannel):
        embed = discord.Embed(
            title="🎮 Fadyn UI — Roblox UI Commissions",
            description=(
                "**Welcome!** I create high-quality, custom Roblox UI for your game.\n\n"
                "**What I offer:**\n"
                "• 🔘 Button UIs — Rounded, Square, Neon/Glow\n"
                "• 🖼️ Frame UIs — Glass, Sharp, Retro, Neon\n"
                "• 🎨 Styles — Retro, Cartoon, Neon/Glow\n"
                "• 📦 Full UI Packages or individual elements\n\n"
                "**Click below to start your order ↓**"
            ),
            color=BRAND_COLOR,
        )
        embed.set_footer(text="Fadyn Bot • Roblox UI Commissions")
        await channel.send(embed=embed, view=MainEntryView())

    # ── INTERACTION ROUTER ─────────────────────────────────────────────────────

    async def handle_interaction(self, interaction: discord.Interaction):
        cid = interaction.data.get("custom_id", "")

        if cid == "flow_start":
            await self._on_start(interaction)
        elif cid == "flow_confirm_yes":
            await self._on_confirmed(interaction)
        elif cid == "flow_confirm_no":
            await self._on_cancel_pending(interaction)
        elif cid.startswith("flow_choice:"):
            _, q_id, value = cid.split(":", 2)
            await self._on_choice(interaction, q_id, value)
        elif cid.startswith("flow_dropdown:"):
            q_id = cid.split(":", 1)[1]
            values = interaction.data.get("values", [])
            await self._on_dropdown(interaction, q_id, values)
        elif cid.startswith("flow_skip:"):
            q_id = cid.split(":", 1)[1]
            await self._on_skip(interaction, q_id)
        elif cid.startswith("flow_edit:"):
            q_id = cid.split(":", 1)[1]
            await self._on_edit(interaction, q_id)
        elif cid == "flow_submit_yes":
            await self._on_submit(interaction)
        elif cid == "flow_submit_no":
            await self._on_submit_cancel(interaction)

    # ── DM REPLY HANDLER ──────────────────────────────────────────────────────

    async def handle_dm_reply(self, message: discord.Message):
        if message.author.bot:
            return
        user_id = message.author.id
        session = self.sessions.get(user_id)
        if not session:
            return

        if not message.reference or not message.reference.message_id:
            return
        if message.reference.message_id != session.get("_awaiting_msg_id"):
            return
        q_id = session.get("_awaiting_text")
        if not q_id:
            return

        q = self._find_question(q_id)
        if not q:
            return

        text = message.content.strip()
        attachments = message.attachments

        if not text and not attachments:
            return

        if q.min_length and len(text) < q.min_length and not q.optional:
            try:
                await message.reply(
                    f"⚠️ Your answer is too short (minimum {q.min_length} characters). Please try again.",
                    delete_after=8,
                )
            except Exception:
                pass
            return

        if q.accept_media and attachments:
            parts = [text] if text else []
            for att in attachments:
                parts.append(att.url)
            answer = "\n".join(parts)
        else:
            answer = text[:q.max_length] if q.max_length else text

        try:
            await message.delete()
        except Exception:
            pass

        old_msg_id = session["_awaiting_msg_id"]
        session["_answers"][q_id] = answer
        session["_awaiting_text"]   = None
        session["_awaiting_msg_id"] = None

        await self._mark_answered(message.author, q, answer, old_msg_id)
        await self._advance(message.author)

    # ── ADVANCE ───────────────────────────────────────────────────────────────

    async def _advance(self, user):
        session = self.sessions.get(user.id)
        if not session:
            return
        q = get_next_question(session["_answers"])
        if q is None:
            await self._send_summary(user)
        else:
            await self._ask(user, q, session)

    # ── ASK A QUESTION ────────────────────────────────────────────────────────

    async def _ask(self, user, q: Question, session: dict):
        if q.kind == "text":
            suffix = "\n\n> 💬 **Reply to this message** with your answer."
            if q.optional:
                suffix += "\n> *(Optional — you may skip)*"
            embed = make_embed(f"❓ {q.prompt[:100]}", q.prompt + suffix)
            view  = SkipButtonView(q.id) if q.optional else None
            dm    = await user.create_dm()
            msg   = await dm.send(embed=embed, view=view)
            session["_awaiting_text"]   = q.id
            session["_awaiting_msg_id"] = msg.id

        elif q.kind == "choice":
            embed = make_embed(f"❓ {q.prompt[:100]}", q.prompt)
            dm    = await user.create_dm()
            await dm.send(embed=embed, view=ChoiceView(q))

        elif q.kind == "dropdown":
            embed = make_embed(f"❓ {q.prompt[:100]}", q.prompt)
            dm    = await user.create_dm()
            await dm.send(embed=embed, view=DropdownView(q))

    # ── CHOICE / DROPDOWN ANSWERS ─────────────────────────────────────────────

    async def _on_choice(self, interaction: discord.Interaction, q_id: str, value: str):
        session = self.sessions.get(interaction.user.id)
        if not session:
            return
        q = self._find_question(q_id)
        if not q:
            return
        label = resolve_label(q, value)
        session["_answers"][q_id] = value
        await interaction.response.edit_message(embed=answered_embed(q, label), view=EditButtonView(q_id))
        await self._advance(interaction.user)

    async def _on_dropdown(self, interaction: discord.Interaction, q_id: str, values: list):
        session = self.sessions.get(interaction.user.id)
        if not session:
            return
        q = self._find_question(q_id)
        if not q:
            return
        value = ", ".join(values)
        label = ", ".join(resolve_label(q, v) for v in values)
        session["_answers"][q_id] = value
        await interaction.response.edit_message(embed=answered_embed(q, label), view=EditButtonView(q_id))
        await self._advance(interaction.user)

    # ── SKIP ──────────────────────────────────────────────────────────────────

    async def _on_skip(self, interaction: discord.Interaction, q_id: str):
        session = self.sessions.get(interaction.user.id)
        if not session:
            return
        session["_answers"][q_id] = ""
        session["_awaiting_text"]   = None
        session["_awaiting_msg_id"] = None
        embed = make_embed(f"⏭️ Skipped", "*This question was skipped.*", color=ACCENT_COLOR)
        await interaction.response.edit_message(embed=embed, view=None)
        await self._advance(interaction.user)

    # ── EDIT ──────────────────────────────────────────────────────────────────

    async def _on_edit(self, interaction: discord.Interaction, q_id: str):
        session = self.sessions.get(interaction.user.id)
        if not session:
            return
        session["_answers"].pop(q_id, None)
        await interaction.response.send_message("↩️ Re-asking that question...", ephemeral=True)
        await self._advance(interaction.user)

    # ── ENTRY / EXIT ──────────────────────────────────────────────────────────

    async def _on_start(self, interaction: discord.Interaction):
        user = interaction.user
        if isinstance(interaction.channel, discord.DMChannel):
            await interaction.response.send_message("Please click the button from the server channel.", ephemeral=True)
            return
        if user.id in self.sessions:
            await interaction.response.send_message(
                embed=make_embed("⚠️ Active Order In Progress", "You already have an open order! Check your DMs.", ERROR_COLOR),
                ephemeral=True,
            )
            return
        if user.id in self.pending:
            await interaction.response.send_message(
                embed=make_embed("⚠️ Already Sent a DM!", "Check your DMs — I already messaged you!", ERROR_COLOR),
                ephemeral=True,
            )
            return
        try:
            embed = make_embed(
                "🛒 Start Your Commission",
                "Are you sure you want to start a new UI commission order?\n\n"
                "This will open a DM flow with all the questions.",
            )
            await user.send(embed=embed, view=ConfirmStartView())
            self.pending.add(user.id)
            await interaction.response.send_message("📬 Check your DMs!", ephemeral=True)
        except discord.Forbidden:
            await interaction.response.send_message(
                "❌ I couldn't DM you. Enable DMs from server members in your privacy settings.",
                ephemeral=True,
            )

    async def _on_confirmed(self, interaction: discord.Interaction):
        user = interaction.user
        self.pending.discard(user.id)
        if user.id in self.sessions:
            await interaction.response.edit_message(
                embed=make_embed("⚠️ Already Active", "You already have a session running!", ERROR_COLOR),
                view=None,
            )
            return
        self.sessions[user.id] = new_session()
        embed = make_embed(
            "✅ Let's Go!",
            "Great! I'll walk you through everything step by step.\n\n"
            "**Reply to each question message** to answer it. "
            "For questions with buttons or dropdowns, just click your choice!",
            color=SUCCESS_COLOR,
        )
        await interaction.response.edit_message(embed=embed, view=None)
        await self._advance(user)

    async def _on_cancel_pending(self, interaction: discord.Interaction):
        self.pending.discard(interaction.user.id)
        await interaction.response.edit_message(
            embed=make_embed("👋 No Problem!", "No worries! Come back anytime when you're ready.\n\nJust hit **Create Order** again whenever you want!"),
            view=None,
        )

    async def _on_submit(self, interaction: discord.Interaction):
        user = interaction.user
        session = self.sessions.get(user.id)
        if not session:
            return
        self.order_counter += 1
        order_id = f"FDN-{self.order_counter:04d}"
        embed = make_embed(
            "🎉 Order Submitted!",
            f"Your order **`{order_id}`** has been received!\n\nFadyn will review it and reach out to you shortly. Thank you! 💜",
            color=SUCCESS_COLOR,
        )
        await interaction.response.edit_message(embed=embed, view=None)
        await self._log_order(user, session, order_id)
        self.sessions.pop(user.id, None)
        self.pending.discard(user.id)

    async def _on_submit_cancel(self, interaction: discord.Interaction):
        await interaction.response.edit_message(
            embed=make_embed("❌ Order Cancelled", "Your order has been cancelled.\n\nClick **Create Order** in the server to start again.", ERROR_COLOR),
            view=None,
        )
        self.sessions.pop(interaction.user.id, None)
        self.pending.discard(interaction.user.id)

    # ── SUMMARY ───────────────────────────────────────────────────────────────

    async def _send_summary(self, user):
        session = self.sessions.get(user.id)
        if not session:
            return
        answers = session["_answers"]

        embed = discord.Embed(
            title="✅ Order Summary — Please Confirm",
            description="Here's everything I've got. Does it all look right?",
            color=SUCCESS_COLOR,
        )

        labels = {
            "name":              "👤 Name",
            "project_name":      "🎮 Project",
            "ui_type":           "🧩 UI Type",
            "button_style":      "🔘 Button Style",
            "button_style_custom": "🔘 Custom Button Style",
            "frame_style":       "🖼️ Frame Style",
            "frame_style_custom": "🖼️ Custom Frame Style",
            "elements":          "🧠 UI Elements",
            "design_style":      "🎨 Design Style",
            "color_scheme":      "🖌️ Colors & Fonts",
            "reference":         "📎 Reference",
            "payment_method":    "💳 Payment",
            "budget":            "💰 Budget",
            "budget_custom":     "💰 Custom Budget",
            "extra_info":        "📝 Extra Info",
        }

        for q in COMMISSION_QUESTIONS:
            val = answers.get(q.id)
            if not val:
                continue
            label = resolve_label(q, val.split(", ")[0]) if ", " not in val else ", ".join(resolve_label(q, v) for v in val.split(", "))
            embed.add_field(name=labels.get(q.id, q.id), value=label[:1024], inline=False)

        embed.set_footer(text="Fadyn Bot • Roblox UI Commissions")
        dm = await user.create_dm()
        await dm.send(embed=embed, view=FinalConfirmView())

    # ── LOGGING ───────────────────────────────────────────────────────────────

    async def _log_order(self, user, session: dict, order_id: str):
        if not self.log_channel_id:
            return
        channel = self.bot.get_channel(self.log_channel_id)
        if not channel:
            return

        answers = session["_answers"]
        embed = discord.Embed(
            title=f"📋 New Commission Order — {order_id}",
            color=BRAND_COLOR,
            timestamp=datetime.utcnow(),
        )
        embed.set_author(name=str(user), icon_url=user.display_avatar.url)
        embed.add_field(name="User", value=f"{user.mention} (`{user.id}`)", inline=False)

        for q in COMMISSION_QUESTIONS:
            val = answers.get(q.id)
            if not val:
                continue
            label = resolve_label(q, val)
            embed.add_field(name=q.id, value=label[:1024], inline=False)

        embed.set_footer(text=f"Submitted at {session['_started_at']}")
        await channel.send(embed=embed)

        if self.owner_id:
            try:
                owner = await self.bot.fetch_user(self.owner_id)
                await owner.send(embed=embed)
            except Exception:
                pass

    # ── HELPERS ───────────────────────────────────────────────────────────────

    def _find_question(self, q_id: str) -> Optional[Question]:
        for q in COMMISSION_QUESTIONS:
            if q.id == q_id:
                return q
        return None

    async def _mark_answered(self, user, q: Question, answer: str, msg_id: int):
        try:
            dm  = await user.create_dm()
            msg = await dm.fetch_message(msg_id)
            await msg.edit(embed=answered_embed(q, answer[:1000]), view=EditButtonView(q.id))
        except Exception:
            pass
