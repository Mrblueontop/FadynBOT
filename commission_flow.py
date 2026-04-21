import asyncio
import os
import discord
from discord.ui import View, Button, Select
from datetime import datetime
from typing import Optional

from questions import COMMISSION_QUESTIONS, get_next_question, resolve_label, Question
from roblox import get_user_by_username, is_in_group, get_user_bio, get_user_headshot, generate_code
from storage import get_verified, set_verified
from ai import format_price_footer

BRAND_COLOR   = 0x7B2FFF
ACCENT_COLOR  = 0x00F5FF
SUCCESS_COLOR = 0x00FF88
ERROR_COLOR   = 0xFF4466

ROBLOX_GROUP_ID = int(os.getenv("ROBLOX_GROUP_ID", "0"))


# ─── EMBED HELPERS ────────────────────────────────────────────────────────────

def make_embed(title: str, description: str, color: int = BRAND_COLOR) -> discord.Embed:
    embed = discord.Embed(title=title, description=description, color=color)
    embed.set_footer(text="Fadyn Bot • Roblox UI Commissions")
    return embed


def answered_embed(q: Question, answer: str) -> discord.Embed:
    embed = discord.Embed(title=f"✅ {q.prompt.split(chr(10))[0][:100]}", color=BRAND_COLOR)
    embed.add_field(name="Your Answer", value=f"```{answer[:1000]}```", inline=False)
    embed.set_footer(text="Fadyn Bot • Click ✏️ Edit to change this answer")
    return embed


# ─── VIEWS ────────────────────────────────────────────────────────────────────

class MainEntryView(View):
    def __init__(self):
        super().__init__(timeout=None)
        self.add_item(Button(label="🛒 Create Order", style=discord.ButtonStyle.primary, custom_id="flow_start"))


class ConfirmStartView(View):
    def __init__(self):
        super().__init__(timeout=120)
        self.add_item(Button(label="Yes, let's go! ✅", style=discord.ButtonStyle.success,   custom_id="flow_confirm_yes"))
        self.add_item(Button(label="Not right now ❌",  style=discord.ButtonStyle.secondary, custom_id="flow_confirm_no"))


class UsernameConfirmView(View):
    def __init__(self):
        super().__init__(timeout=120)
        self.add_item(Button(label="✅ Yes, that's me",   style=discord.ButtonStyle.success,   custom_id="verify_username_yes"))
        self.add_item(Button(label="❌ No, wrong account", style=discord.ButtonStyle.secondary, custom_id="verify_username_no"))


class GroupJoinView(View):
    def __init__(self):
        super().__init__(timeout=600)
        self.add_item(Button(label="✅ I've joined the group", style=discord.ButtonStyle.success, custom_id="verify_group_check"))


class BioVerifyView(View):
    def __init__(self):
        super().__init__(timeout=600)
        self.add_item(Button(label="🔍 I've added the code", style=discord.ButtonStyle.success,   custom_id="verify_bio_check"))
        self.add_item(Button(label="🔄 Give me a new code",  style=discord.ButtonStyle.secondary, custom_id="verify_bio_newcode"))


class EditButtonView(View):
    def __init__(self, question_id: str):
        super().__init__(timeout=None)
        self.add_item(Button(label="✏️ Edit", style=discord.ButtonStyle.secondary, custom_id=f"flow_edit:{question_id}"))


class EditModal(discord.ui.Modal):
    def __init__(self, flow, q: Question, current_display: str, original_msg_id: int):
        super().__init__(title=q.prompt[:45])
        self.flow            = flow
        self.q               = q
        self.original_msg_id = original_msg_id

        if q.kind == "choice":
            placeholder = "Options: " + ", ".join(o.label for o in q.options)
            style = discord.TextStyle.short
        elif q.kind == "dropdown":
            placeholder = "Options: " + ", ".join(o.label for o in q.options)
            style = discord.TextStyle.short
        else:
            placeholder = "Type your answer here..."
            style = discord.TextStyle.paragraph

        self.answer_input = discord.ui.TextInput(
            label=q.prompt[:45],
            default=current_display[:4000] if current_display else None,
            placeholder=placeholder[:100],
            style=style,
            required=not q.optional,
            max_length=q.max_length or 4000,
        )
        self.add_item(self.answer_input)

    async def on_submit(self, interaction: discord.Interaction):
        session = self.flow.sessions.get(interaction.user.id)
        if not session:
            await interaction.response.send_message("Session expired.", ephemeral=True)
            return

        raw = self.answer_input.value.strip()
        if not raw and not self.q.optional:
            await interaction.response.send_message("Answer cannot be empty.", ephemeral=True)
            return

        # Match typed text back to an option value (case-insensitive)
        value = raw
        if self.q.kind in ("choice", "dropdown"):
            for opt in self.q.options:
                if raw.lower() in (opt.label.lower(), opt.value.lower()):
                    value = opt.value
                    break

        display = resolve_label(self.q, value)
        session["_answers"][self.q.id] = value

        await interaction.response.send_message("✅ Answer updated!", ephemeral=True)

        try:
            dm  = await interaction.user.create_dm()
            msg = await dm.fetch_message(self.original_msg_id)
            await msg.edit(embed=answered_embed(self.q, display), view=EditButtonView(self.q.id))
        except Exception:
            pass


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

_VALID_REFERENCE_DOMAINS = (
    "youtube.com", "youtu.be",
    "twitter.com", "x.com", "t.co",
)

IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp")

def _is_valid_reference(text: str, attachments) -> bool:
    if attachments:
        return True
    lower = text.lower()
    if any(d in lower for d in _VALID_REFERENCE_DOMAINS):
        return True
    if any(lower.endswith(ext) or f"{ext}?" in lower for ext in IMAGE_EXTENSIONS):
        return True
    return False


def new_session() -> dict:
    return {
        # Phase: "verify" or "commission"
        "_phase": "verify",
        # Verification sub-state
        "_verify_step": "username",   # username | confirm | group | bio
        "_roblox_id": None,
        "_roblox_username": None,
        "_roblox_display": None,
        "_verify_code": None,
        "_group_msg_id": None,
        "_bio_msg_id": None,
        "_poll_task": None,
        # Commission answers
        "_answers": {},
        "_awaiting_text": None,
        "_awaiting_msg_id": None,
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
                "• 🔘 Button UIs — Rounded, Square, Custom\n"
                "• 🖼️ Frame UIs — Sharp, Rounded, Glass / Transparent, Custom\n"
                "• 🎨 Styles — Retro, Cartoon, Custom\n"
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

        # ── Entry
        if   cid == "flow_start":           await self._on_start(interaction)
        elif cid == "flow_confirm_yes":      await self._on_confirmed(interaction)
        elif cid == "flow_confirm_no":       await self._on_cancel_pending(interaction)

        # ── Verification
        elif cid == "verify_username_yes":   await self._on_username_confirm(interaction, confirmed=True)
        elif cid == "verify_username_no":    await self._on_username_confirm(interaction, confirmed=False)
        elif cid == "verify_group_check":    await self._on_group_check(interaction)
        elif cid == "verify_bio_check":      await self._on_bio_check(interaction)
        elif cid == "verify_bio_newcode":    await self._on_bio_newcode(interaction)

        # ── Commission
        elif cid.startswith("flow_choice:"):
            _, q_id, value = cid.split(":", 2)
            await self._on_choice(interaction, q_id, value)
        elif cid.startswith("flow_dropdown:"):
            q_id = cid.split(":", 1)[1]
            await self._on_dropdown(interaction, q_id, interaction.data.get("values", []))
        elif cid.startswith("flow_skip:"):
            await self._on_skip(interaction, cid.split(":", 1)[1])
        elif cid.startswith("flow_edit:"):
            await self._on_edit(interaction, cid.split(":", 1)[1])
        elif cid == "flow_submit_yes":       await self._on_submit(interaction)
        elif cid == "flow_submit_no":        await self._on_submit_cancel(interaction)

    # ── DM REPLY HANDLER ──────────────────────────────────────────────────────

    async def handle_dm_reply(self, message: discord.Message):
        if message.author.bot:
            return
        user_id = message.author.id
        session = self.sessions.get(user_id)
        if not session:
            return

        if session["_phase"] == "verify" and session["_verify_step"] == "username":
            await self._handle_username_reply(message, session)
            return

        # Commission text replies
        if not message.reference or message.reference.message_id != session.get("_awaiting_msg_id"):
            return
        q_id = session.get("_awaiting_text")
        if not q_id:
            return

        q = self._find_question(q_id)
        if not q:
            return

        text = message.content.strip()
        if not text and not message.attachments:
            return

        if q.min_length and len(text) < q.min_length and not q.optional:
            try:
                await message.reply(
                    f"⚠️ Too short — minimum {q.min_length} characters. Please try again.",
                    delete_after=8,
                )
            except Exception:
                pass
            return

        if q_id == "reference" and not _is_valid_reference(text, message.attachments):
            try:
                await message.reply(
                    "⚠️ Please send a **YouTube link**, **X (Twitter) link**, or attach an **image**.\n"
                    "Plain text descriptions are not accepted for this field.",
                    delete_after=12,
                )
            except Exception:
                pass
            return

        if q.accept_media and message.attachments:
            parts = [text] if text else []
            for att in message.attachments:
                parts.append(att.url)
            answer = "\n".join(parts)
        else:
            answer = text[:q.max_length] if q.max_length else text

        old_msg_id = session["_awaiting_msg_id"]

        try:
            await message.delete()
        except Exception:
            pass

        session["_answers"][q_id] = answer
        session["_awaiting_text"]   = None
        session["_awaiting_msg_id"] = None

        await self._mark_answered(message.author, q, answer, old_msg_id)
        await self._advance_commission(message.author)

    # ═══════════════════════════════════════════════════════════════════════════
    #  VERIFICATION FLOW
    # ═══════════════════════════════════════════════════════════════════════════

    async def _start_verification(self, user: discord.User | discord.Member):
        session = self.sessions.get(user.id)
        if not session:
            return
        session["_verify_step"] = "username"
        dm = await user.create_dm()
        embed = make_embed(
            "🔐 Roblox Verification",
            "To place an order you first need to verify your Roblox account.\n\n"
            "**Type your Roblox username** in this DM to get started.",
        )
        msg = await dm.send(embed=embed)
        session["_awaiting_msg_id"] = msg.id

    async def _handle_username_reply(self, message: discord.Message, session: dict):
        username = message.content.strip()
        if not username:
            return

        try:
            await message.delete()
        except Exception:
            pass

        dm = await message.author.create_dm()
        looking = await dm.send(embed=make_embed("🔍 Looking up...", f"Searching for **{username}** on Roblox..."))

        user_data = await get_user_by_username(username)

        if not user_data:
            await looking.edit(embed=make_embed(
                "❌ Not Found",
                f"No Roblox account found for `{username}`.\n\nPlease type your username again.",
                ERROR_COLOR,
            ))
            return

        session["_roblox_id"]       = user_data["id"]
        session["_roblox_username"] = user_data["name"]
        session["_roblox_display"]  = user_data.get("displayName", user_data["name"])
        session["_verify_step"]     = "confirm"

        headshot = await get_user_headshot(user_data["id"])
        session["_roblox_headshot"] = headshot
        embed = discord.Embed(
            title="Is this you?",
            description=(
                f"**Username:** {user_data['name']}\n"
                f"**Display Name:** {user_data.get('displayName', user_data['name'])}\n"
                f"**Roblox ID:** `{user_data['id']}`"
            ),
            color=BRAND_COLOR,
        )
        if headshot:
            embed.set_thumbnail(url=headshot)
        embed.set_footer(text="Fadyn Bot • Roblox UI Commissions")

        await looking.edit(embed=embed, view=UsernameConfirmView())

    async def _on_username_confirm(self, interaction: discord.Interaction, confirmed: bool):
        session = self.sessions.get(interaction.user.id)
        if not session or session["_verify_step"] != "confirm":
            return

        if not confirmed:
            session["_verify_step"]     = "username"
            session["_roblox_id"]       = None
            session["_roblox_username"] = None
            session["_roblox_display"]  = None
            await interaction.response.edit_message(
                embed=make_embed("🔐 Try Again", "No problem! Please type your Roblox username again."),
                view=None,
            )
            return

        await interaction.response.edit_message(
            embed=make_embed("✅ Got it!", f"Great — verified as **{session['_roblox_username']}**!\n\nChecking group membership..."),
            view=None,
        )

        if ROBLOX_GROUP_ID:
            in_group = await is_in_group(session["_roblox_id"], ROBLOX_GROUP_ID)
            if not in_group:
                await self._send_group_join_prompt(interaction.user, session)
                return

        await self._send_bio_verify(interaction.user, session)

    async def _send_group_join_prompt(self, user, session: dict):
        session["_verify_step"] = "group"
        group_url = os.getenv("ROBLOX_GROUP_URL", "*(set ROBLOX_GROUP_URL in your env)*")
        embed = make_embed(
            "👥 Join the Roblox Group First",
            f"Before you can order, you need to join our Roblox group.\n\n"
            f"**Group link:** {group_url}\n\n"
            f"Once you've joined, click the button below — we're also checking automatically every 5 seconds!",
        )
        dm = await user.create_dm()
        msg = await dm.send(embed=embed, view=GroupJoinView())
        session["_group_msg_id"] = msg.id
        self._cancel_poll(session)
        session["_poll_task"] = asyncio.create_task(self._poll_group(user, session, msg))

    async def _poll_group(self, user, session: dict, msg: discord.Message):
        try:
            for _ in range(120):  # max 10 minutes
                await asyncio.sleep(5)
                s = self.sessions.get(user.id)
                if not s or s["_verify_step"] != "group":
                    return
                if await is_in_group(s["_roblox_id"], ROBLOX_GROUP_ID):
                    try:
                        await msg.edit(
                            embed=make_embed("✅ Group Joined!", "You're in! Moving on to bio verification...", SUCCESS_COLOR),
                            view=None,
                        )
                    except Exception:
                        pass
                    await self._send_bio_verify(user, s)
                    return
        except asyncio.CancelledError:
            pass

    async def _on_group_check(self, interaction: discord.Interaction):
        session = self.sessions.get(interaction.user.id)
        if not session or session["_verify_step"] != "group":
            return
        in_group = await is_in_group(session["_roblox_id"], ROBLOX_GROUP_ID)
        if not in_group:
            await interaction.response.send_message(
                "⚠️ You're not in the group yet! Join the group and try again.",
                ephemeral=True,
            )
            return
        self._cancel_poll(session)
        await interaction.response.edit_message(
            embed=make_embed("✅ Group Joined!", "You're in! Moving on to bio verification...", SUCCESS_COLOR),
            view=None,
        )
        await self._send_bio_verify(interaction.user, session)

    async def _send_bio_verify(self, user, session: dict):
        session["_verify_step"]  = "bio"
        code = generate_code()
        session["_verify_code"] = code
        embed = discord.Embed(
            title="🔑 Verify Your Roblox Account",
            description=(
                f"Great! Now add this code to your **Roblox bio** to confirm you own the account:\n\n"
                f"## `{code}`\n\n"
                f"1. Go to **roblox.com → Settings → About**\n"
                f"2. Paste the code into your bio and save\n"
                f"3. Click **I've added the code** below\n\n"
                f"*Once verified you can remove it from your bio.*\n"
                f"🔄 Checking automatically every 5 seconds..."
            ),
            color=BRAND_COLOR,
        )
        embed.set_footer(text="Fadyn Bot • Roblox UI Commissions")
        dm = await user.create_dm()
        msg = await dm.send(embed=embed, view=BioVerifyView())
        session["_bio_msg_id"] = msg.id
        self._cancel_poll(session)
        session["_poll_task"] = asyncio.create_task(self._poll_bio(user, session, msg))

    async def _poll_bio(self, user, session: dict, msg: discord.Message):
        try:
            for _ in range(120):  # max 10 minutes
                await asyncio.sleep(5)
                s = self.sessions.get(user.id)
                if not s or s["_verify_step"] != "bio":
                    return
                bio = await get_user_bio(s["_roblox_id"])
                if s["_verify_code"] in bio:
                    try:
                        await msg.edit(
                            embed=make_embed("✅ Verified!", "Bio code found — you're verified!", SUCCESS_COLOR),
                            view=None,
                        )
                    except Exception:
                        pass
                    await self._complete_verification(user, s)
                    return
        except asyncio.CancelledError:
            pass

    async def _on_bio_check(self, interaction: discord.Interaction):
        session = self.sessions.get(interaction.user.id)
        if not session or session["_verify_step"] != "bio":
            return
        bio = await get_user_bio(session["_roblox_id"])
        if session["_verify_code"] not in bio:
            await interaction.response.send_message(
                "⚠️ Code not found in your bio yet. Make sure you saved it and try again!",
                ephemeral=True,
            )
            return
        self._cancel_poll(session)
        await interaction.response.edit_message(
            embed=make_embed("✅ Verified!", "Bio code found — you're verified!", SUCCESS_COLOR),
            view=None,
        )
        await self._complete_verification(interaction.user, session)

    async def _on_bio_newcode(self, interaction: discord.Interaction):
        session = self.sessions.get(interaction.user.id)
        if not session or session["_verify_step"] != "bio":
            return
        self._cancel_poll(session)
        await interaction.response.edit_message(
            embed=make_embed("🔄 Generating new code...", "One moment..."),
            view=None,
        )
        await self._send_bio_verify(interaction.user, session)

    async def _complete_verification(self, user, session: dict):
        entry = {
            "discordId": str(user.id),
            "robloxId": session["_roblox_id"],
            "robloxUsername": session["_roblox_username"],
            "robloxDisplayName": session["_roblox_display"],
            "verifiedAt": int(datetime.utcnow().timestamp()),
        }
        await set_verified(entry)
        session["_phase"]       = "commission"
        session["_verify_step"] = "done"

        dm = await user.create_dm()
        await dm.send(embed=make_embed(
            "🎉 Account Verified!",
            f"You're all set, **{session['_roblox_username']}**!\n\nNow let's get your commission started 🎨",
            SUCCESS_COLOR,
        ))
        await self._advance_commission(user)

    def _cancel_poll(self, session: dict):
        task = session.get("_poll_task")
        if task and not task.done():
            task.cancel()
        session["_poll_task"] = None

    # ═══════════════════════════════════════════════════════════════════════════
    #  COMMISSION FLOW
    # ═══════════════════════════════════════════════════════════════════════════

    async def _advance_commission(self, user):
        session = self.sessions.get(user.id)
        if not session:
            return
        q = get_next_question(session["_answers"])
        if q is None:
            await self._send_summary(user)
        else:
            await self._ask(user, q, session)

    async def _ask(self, user, q: Question, session: dict):
        try:
            price_footer = await format_price_footer(session["_answers"])
        except Exception:
            price_footer = ""
        footer_text  = f"Fadyn Bot • Roblox UI Commissions{('  ·  ' + price_footer) if price_footer else ''}"
        first_line   = q.prompt.split(chr(10))[0]
        title        = f"❓ {first_line[:100]}"
        body         = q.prompt[len(first_line):].lstrip("\n")

        if q.kind == "text":
            suffix = "\n\n> 💬 **Reply to this message** with your answer."
            if q.optional:
                suffix += "\n> *(Optional — you may skip)*"
            embed = make_embed(title, body + suffix)
            embed.set_footer(text=footer_text)
            view  = SkipButtonView(q.id) if q.optional else None
            dm    = await user.create_dm()
            msg   = await dm.send(embed=embed, view=view)
            session["_awaiting_text"]   = q.id
            session["_awaiting_msg_id"] = msg.id
        elif q.kind == "choice":
            embed = make_embed(title, body)
            embed.set_footer(text=footer_text)
            dm    = await user.create_dm()
            await dm.send(embed=embed, view=ChoiceView(q))
        elif q.kind == "dropdown":
            embed = make_embed(title, body)
            embed.set_footer(text=footer_text)
            dm    = await user.create_dm()
            await dm.send(embed=embed, view=DropdownView(q))

    async def _on_choice(self, interaction: discord.Interaction, q_id: str, value: str):
        session = self.sessions.get(interaction.user.id)
        if not session:
            return
        q = self._find_question(q_id)
        if not q:
            return
        session["_answers"][q_id] = value
        label = resolve_label(q, value)
        await interaction.response.edit_message(embed=answered_embed(q, label), view=EditButtonView(q_id))
        await self._advance_commission(interaction.user)

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
        await self._advance_commission(interaction.user)

    async def _on_skip(self, interaction: discord.Interaction, q_id: str):
        session = self.sessions.get(interaction.user.id)
        if not session:
            return
        session["_answers"][q_id] = ""
        session["_awaiting_text"]   = None
        session["_awaiting_msg_id"] = None
        await interaction.response.edit_message(
            embed=make_embed("⏭️ Skipped", "*This question was skipped.*", ACCENT_COLOR),
            view=None,
        )
        await self._advance_commission(interaction.user)

    async def _on_edit(self, interaction: discord.Interaction, q_id: str):
        session = self.sessions.get(interaction.user.id)
        if not session:
            return
        q = self._find_question(q_id)
        if not q:
            return
        current_value   = session["_answers"].get(q_id, "")
        current_display = resolve_label(q, current_value) if current_value else ""
        modal = EditModal(self, q, current_display, interaction.message.id)
        await interaction.response.send_modal(modal)

    # ─── ENTRY / EXIT ─────────────────────────────────────────────────────────

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

        verified = get_verified(str(user.id))
        if verified:
            # Already verified — skip straight to commission
            self.sessions[user.id]["_phase"]       = "commission"
            self.sessions[user.id]["_verify_step"] = "done"
            self.sessions[user.id]["_roblox_username"] = verified.get("robloxUsername")
            embed = make_embed(
                "✅ Let's Go!",
                f"Welcome back, **{verified.get('robloxUsername', user.name)}**! 🎉\n\n"
                "You're already verified — let's get your commission started!",
                SUCCESS_COLOR,
            )
            await interaction.response.edit_message(embed=embed, view=None)
            await self._advance_commission(user)
        else:
            embed = make_embed(
                "🔐 Verification Required",
                "Before placing an order you need to verify your Roblox account.\n\n"
                "This only takes a minute and you'll never need to do it again!",
            )
            await interaction.response.edit_message(embed=embed, view=None)
            await self._start_verification(user)

    async def _on_cancel_pending(self, interaction: discord.Interaction):
        self.pending.discard(interaction.user.id)
        await interaction.response.edit_message(
            embed=make_embed("👋 No Problem!", "No worries! Come back anytime when you're ready."),
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
            SUCCESS_COLOR,
        )
        await interaction.response.edit_message(embed=embed, view=None)
        await self._log_order(user, session, order_id)
        self._cancel_poll(session)
        self.sessions.pop(user.id, None)
        self.pending.discard(user.id)

    async def _on_submit_cancel(self, interaction: discord.Interaction):
        session = self.sessions.get(interaction.user.id)
        if session:
            self._cancel_poll(session)
        await interaction.response.edit_message(
            embed=make_embed("❌ Order Cancelled", "Your order has been cancelled.\n\nClick **Create Order** in the server to start again.", ERROR_COLOR),
            view=None,
        )
        self.sessions.pop(interaction.user.id, None)
        self.pending.discard(interaction.user.id)

    # ─── SHARED LABELS / FORMATTER ────────────────────────────────────────────

    _LABELS = {
        "name":                    "👤 Name",
        "project_name":            "🎮 Project Name",
        "project_description":     "📄 Project Description",
        "ui_type":                 "🧩 UI Type",
        "button_style":            "🔘 Button Style",
        "button_hover":            "✨ Button Animations",
        "button_hover_custom":     "✨ Custom Animation",
        "button_icons":            "🔣 Button Icons",
        "button_icons_custom":     "🔣 Icon Details",
        "frame_style":             "🖼️ Frame Style",
        "frame_style_custom":      "🖼️ Custom Frame Style",
        "elements":                "🧩 UI Elements Needed",
        "design_style":            "🎨 Design Style",
        "design_style_custom":     "🎨 Custom Design Style",
        "color_scheme":            "🖌️ Colors & Fonts",
        "reference":               "📎 Reference",
        "payment_method":          "💳 Payment Method",
        "extra_info":              "📝 Additional Notes",
    }

    def _build_qa_block(self, answers: dict) -> str:
        lines = []
        for q in COMMISSION_QUESTIONS:
            val = answers.get(q.id)
            if not val:
                continue
            parts = val.split(", ")
            display = ", ".join(resolve_label(q, v) for v in parts)
            label = self._LABELS.get(q.id, q.id)
            lines.append(f"**{label}**\n{display}")
        return "\n\n".join(lines)

    # ─── SUMMARY ──────────────────────────────────────────────────────────────

    async def _send_summary(self, user):
        session = self.sessions.get(user.id)
        if not session:
            return
        answers      = session["_answers"]
        roblox       = session.get("_roblox_username", "—")
        headshot     = session.get("_roblox_headshot")
        now          = int(datetime.utcnow().timestamp())
        price_footer = await format_price_footer(answers)

        embed = discord.Embed(
            title="📋 Order Summary — Please Confirm",
            description="Here's everything I've collected. Look it over — if anything needs changing, hit **Edit an Answer** before confirming.",
            color=SUCCESS_COLOR,
            timestamp=datetime.utcnow(),
        )

        if headshot:
            embed.set_author(name=roblox, icon_url=headshot)
            embed.set_thumbnail(url=headshot)

        for q in COMMISSION_QUESTIONS:
            if q.show_if and not q.show_if(answers):
                continue
            raw = answers.get(q.id, "")
            if not raw:
                continue
            first_line = q.prompt.split(chr(10))[0]
            if q.kind in ("choice", "dropdown"):
                parts   = raw.split(", ")
                display = ", ".join(resolve_label(q, v) for v in parts)
            else:
                display = raw
            embed.add_field(name=first_line[:256], value=display[:1024], inline=False)

        embed.add_field(name="🎮 Roblox Account", value=roblox,         inline=True)
        embed.add_field(name="📅 Submitted",      value=f"<t:{now}:F>", inline=True)
        if price_footer:
            embed.add_field(name="💰 Price Estimate", value=price_footer, inline=False)

        embed.set_footer(text="Fadyn Bot • Roblox UI Commissions")
        dm = await user.create_dm()
        await dm.send(embed=embed, view=FinalConfirmView())

        # ─── LOGGING ──────────────────────────────────────────────────────────────

    async def _log_order(self, user, session: dict, order_id: str):
        if not self.log_channel_id:
            return
        channel = self.bot.get_channel(self.log_channel_id)
        if not channel:
            return

        answers      = session["_answers"]
        roblox       = session.get("_roblox_username", "—")
        headshot     = session.get("_roblox_headshot")
        now          = int(datetime.utcnow().timestamp())
        price_footer = await format_price_footer(answers)

        embed = discord.Embed(
            title=f"📝 New Commission Order — {order_id}",
            color=BRAND_COLOR,
            timestamp=datetime.utcnow(),
        )

        if headshot:
            embed.set_author(name=roblox, icon_url=headshot)
            embed.set_thumbnail(url=headshot)

        for q in COMMISSION_QUESTIONS:
            if q.show_if and not q.show_if(answers):
                continue
            raw = answers.get(q.id, "")
            if not raw:
                continue
            first_line = q.prompt.split(chr(10))[0]
            if q.kind in ("choice", "dropdown"):
                parts   = raw.split(", ")
                display = ", ".join(resolve_label(q, v) for v in parts)
            else:
                display = raw
            embed.add_field(name=first_line[:256], value=display[:1024], inline=False)

        embed.add_field(name="👤 Discord",        value=f"{user.mention} (`{user.id}`)", inline=True)
        embed.add_field(name="🎮 Roblox Account", value=roblox,                          inline=True)
        embed.add_field(name="📅 Submitted",      value=f"<t:{now}:F>",                  inline=True)
        if price_footer:
            embed.add_field(name="💰 Price Estimate", value=price_footer, inline=False)

        embed.set_footer(text=f"Fadyn Bot • {order_id}")

        await channel.send(embed=embed)

        if self.owner_id:
            try:
                owner = await self.bot.fetch_user(self.owner_id)
                await owner.send(embed=embed)
            except Exception:
                pass

        # ─── LOG MIGRATION ────────────────────────────────────────────────────────

    async def rebuild_log_embeds(self, channel) -> tuple[int, int]:
        """
        Scan *channel* for bot commission log messages and re-edit any that
        still use the old embed-fields format.  Returns (updated, skipped).
        """
        updated = 0
        skipped = 0

        # Build a reverse map:  q.id  →  friendly label  (covers both formats)
        id_to_label = dict(self._LABELS)

        async for message in channel.history(limit=500, oldest_first=False):
            if message.author.id != channel.guild.me.id:
                continue
            if not message.embeds:
                continue

            embed = message.embeds[0]

            # Only touch commission order embeds
            title = embed.title or ""
            if "Commission" not in title or not embed.fields:
                skipped += 1
                continue

            # ── Reconstruct data from old fields ──────────────────────────
            user_line    = ""
            roblox_line  = "—"
            submitted    = ""
            qa_pairs     = []  # list of (label, value)

            for field in embed.fields:
                fname = field.name or ""
                fval  = field.value or ""

                if fname == "User":
                    user_line = fval
                elif fname in ("Roblox Account", "Roblox"):
                    roblox_line = fval
                elif fname.startswith("Submitted"):
                    submitted = fval
                else:
                    # raw q.id  →  friendly label
                    label = id_to_label.get(fname, fname)
                    qa_pairs.append((label, fval))

            if not qa_pairs:
                skipped += 1
                continue

            # Fall back to footer for submitted timestamp
            if not submitted and embed.footer and embed.footer.text:
                submitted = embed.footer.text.replace("Submitted at ", "")

            # ── Build new description ──────────────────────────────────────
            qa_block = "\n\n".join(f"**{lbl}**\n{val}" for lbl, val in qa_pairs)

            description = (
                f"{qa_block}\n\n"
                f"─────────────────────────\n"
                f"**User**\n{user_line}\n\n"
                f"**Roblox Account**\n{roblox_line}\n\n"
                f"**Submitted**\n{submitted}"
            )

            new_embed = discord.Embed(
                title=title.replace("📋 New Commission —", "📝 New Commission Order —"),
                description=description[:4096],
                color=embed.color or BRAND_COLOR,
                timestamp=embed.timestamp,
            )
            if embed.author:
                new_embed.set_author(
                    name=embed.author.name,
                    icon_url=embed.author.icon_url or discord.Embed.Empty,
                )
            new_embed.set_footer(text="Fadyn Bot • Roblox UI Commissions")

            try:
                await message.edit(embed=new_embed)
                updated += 1
            except Exception:
                skipped += 1

        return updated, skipped


    # ─── /UPDATELOGS COMMAND ──────────────────────────────────────────────────

    async def handle_updatelogs(self, interaction: discord.Interaction):
        """
        /updatelogs — Re-renders all commission log embeds in the log channel
        to the latest embed format. Only usable by admins.
        """
        if not interaction.guild or not interaction.user:
            await interaction.response.send_message("Must be used in a server.", ephemeral=True)
            return

        member = interaction.guild.get_member(interaction.user.id)
        if not member or not member.guild_permissions.manage_guild:
            await interaction.response.send_message("You need **Manage Server** permission.", ephemeral=True)
            return

        if not self.log_channel_id:
            await interaction.response.send_message("No log channel configured.", ephemeral=True)
            return

        channel = self.bot.get_channel(self.log_channel_id)
        if not channel:
            await interaction.response.send_message("Log channel not found.", ephemeral=True)
            return

        await interaction.response.defer(ephemeral=True)
        updated, skipped = await self.rebuild_log_embeds(channel)
        await interaction.followup.send(
            f"✅ Done — updated **{updated}** embed(s), skipped **{skipped}**.",
            ephemeral=True,
        )

    # ─── HELPERS ──────────────────────────────────────────────────────────────

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
