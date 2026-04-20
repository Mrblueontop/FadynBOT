import discord
from discord.ui import View, Button, Select
from datetime import datetime
from typing import Optional

# ─────────────────────────────────────────────
#  DATA STRUCTURE
# ─────────────────────────────────────────────
def empty_order():
    return {
        "name": "",
        "project_name": "",
        "ui_type": "",
        "button_style": "",
        "frame_style": "",
        "_styles_done": False,
        "elements": [],
        "design_style": "",
        "color_scheme": "",
        "reference": "",
        "payment_method": "",
        "budget": "",
        "extra_info": "",
        "step": 0,
        "started_at": datetime.utcnow().isoformat(),
    }

# ─────────────────────────────────────────────
#  COLOURS & HELPERS
# ─────────────────────────────────────────────
BRAND_COLOR   = 0x7B2FFF
ACCENT_COLOR  = 0x00F5FF
SUCCESS_COLOR = 0x00FF88
ERROR_COLOR   = 0xFF4466

STEP_TITLES = {
    "name":           ("👤 Step 1 of 9 — Your Name",        "What is your name?"),
    "project_name":   ("🎮 Step 2 of 9 — Project Name",     "What is your project name?"),
    "ui_type":        ("🧩 Step 3 of 9 — UI Type",          "What type of UI do you need?"),
    "button_style":   ("🔘 Step 4A of 9 — Button Style",    "What style of buttons do you want?"),
    "frame_style":    ("🖼️ Step 4B of 9 — Frame Style",    "What style of frames do you want?"),
    "elements":       ("🧠 Step 5 of 9 — UI Elements",      "Which UI elements do you need?"),
    "design_style":   ("🎨 Step 6 of 9 — Design Style",     "What overall style are you going for?"),
    "color_scheme":   ("🖌️ Step 7 of 9 — Colors & Fonts",  "What is your preferred color scheme? (Also mention fonts/branding or say none)"),
    "reference":      ("📎 Step 8 of 9 — References",       "Please provide a reference image link or description."),
    "payment_method": ("💳 Payment Method",                  "How would you like to pay?"),
    "budget":         ("💰 Budget",                          "What is your budget range?"),
    "extra_info":     ("📝 Step 9 of 9 — Extra Info",       "Anything else I should know? (deadlines, special requests, etc. — or reply 'none')"),
}

def neon_embed(title: str, description: str, color: int = BRAND_COLOR) -> discord.Embed:
    embed = discord.Embed(title=title, description=description, color=color)
    embed.set_footer(text="Fadyn Bot • Roblox UI Commissions")
    return embed

def answered_embed(field: str, answer: str) -> discord.Embed:
    title, question = STEP_TITLES.get(field, (field, field))
    embed = discord.Embed(title=title, color=BRAND_COLOR)
    embed.add_field(name="❓ Question", value=question, inline=False)
    embed.add_field(name="✅ Your Answer", value=f"```{answer}```", inline=False)
    embed.set_footer(text="Fadyn Bot • Click ✏️ Edit to change your answer")
    return embed


# ─────────────────────────────────────────────
#  VIEWS
# ─────────────────────────────────────────────
class MainEntryView(View):
    def __init__(self, flow):
        super().__init__(timeout=None)
        self.add_item(Button(label="🛒 Create Order", style=discord.ButtonStyle.primary, custom_id="start_order"))

class ConfirmStartView(View):
    def __init__(self):
        super().__init__(timeout=120)
        self.add_item(Button(label="Yes, let's go! ✅", style=discord.ButtonStyle.success,   custom_id="confirm_start_yes"))
        self.add_item(Button(label="Not right now ❌",  style=discord.ButtonStyle.secondary, custom_id="confirm_start_no"))

class UITypeView(View):
    def __init__(self):
        super().__init__(timeout=300)
        self.add_item(Button(label="🔘 Buttons UI", style=discord.ButtonStyle.primary, custom_id="ui_type_buttons"))
        self.add_item(Button(label="🖼️ Frames UI",  style=discord.ButtonStyle.primary, custom_id="ui_type_frames"))
        self.add_item(Button(label="⚡ Both",        style=discord.ButtonStyle.success, custom_id="ui_type_both"))

class ButtonStyleView(View):
    def __init__(self):
        super().__init__(timeout=300)
        for label, cid in [("Rounded","btn_style_rounded"),("Square","btn_style_square"),("Neon/Glow ✨","btn_style_neon")]:
            self.add_item(Button(label=label, style=discord.ButtonStyle.primary, custom_id=cid))
        self.add_item(Button(label="Custom — reply below 🖊️", style=discord.ButtonStyle.secondary, custom_id="btn_style_custom"))

class FrameStyleView(View):
    def __init__(self):
        super().__init__(timeout=300)
        for label, cid in [("Sharp","frm_style_sharp"),("Rounded","frm_style_rounded"),("Glass / Transparent","frm_style_glass"),("Neon/Glow ✨","frm_style_neon")]:
            self.add_item(Button(label=label, style=discord.ButtonStyle.primary, custom_id=cid))
        self.add_item(Button(label="Custom — reply below 🖊️", style=discord.ButtonStyle.secondary, custom_id="frm_style_custom"))

class ElementsView(View):
    def __init__(self):
        super().__init__(timeout=300)
        self.add_item(Select(
            custom_id="elements_select",
            placeholder="Select all elements you need...",
            min_values=1, max_values=7,
            options=[
                discord.SelectOption(label="Main Menu",                  value="Main Menu",    emoji="🏠"),
                discord.SelectOption(label="HUD (health, ammo, etc.)",  value="HUD",          emoji="❤️"),
                discord.SelectOption(label="Inventory",                 value="Inventory",    emoji="🎒"),
                discord.SelectOption(label="Shop",                      value="Shop",         emoji="🛒"),
                discord.SelectOption(label="Settings Menu",             value="Settings Menu",emoji="⚙️"),
                discord.SelectOption(label="Leaderboard",               value="Leaderboard",  emoji="🏆"),
                discord.SelectOption(label="Other",                     value="Other",        emoji="📌"),
            ]
        ))
        self.add_item(Button(label="Done ✅", style=discord.ButtonStyle.success, custom_id="elements_done"))

class DesignStyleView(View):
    def __init__(self):
        super().__init__(timeout=300)
        for label, cid in [("🕹️ Retro","design_style_retro"),("🎨 Cartoon","design_style_cartoon"),("✨ Neon/Glow","design_style_neon")]:
            self.add_item(Button(label=label, style=discord.ButtonStyle.primary, custom_id=cid))

class PaymentView(View):
    def __init__(self):
        super().__init__(timeout=300)
        for label, cid in [("💳 PayPal","pay_method_paypal"),("💵 Cash App","pay_method_cashapp"),("🎮 Robux","pay_method_robux"),("❓ Other","pay_method_other")]:
            self.add_item(Button(label=label, style=discord.ButtonStyle.primary, custom_id=cid))

class BudgetView(View):
    def __init__(self):
        super().__init__(timeout=300)
        for label, cid in [("< $50","budget_under50"),("$50–$100","budget_50_100"),("$100–$300","budget_100_300"),("$300+","budget_300plus"),("Custom 🖊️","budget_custom")]:
            self.add_item(Button(label=label, style=discord.ButtonStyle.primary, custom_id=cid))

class EditButtonView(View):
    def __init__(self, field: str):
        super().__init__(timeout=None)
        self.add_item(Button(label="✏️ Edit", style=discord.ButtonStyle.secondary, custom_id=f"edit_{field}"))

class FinalConfirmView(View):
    def __init__(self):
        super().__init__(timeout=300)
        self.add_item(Button(label="✅ Submit Order!", style=discord.ButtonStyle.success, custom_id="confirm_order_yes"))
        self.add_item(Button(label="❌ Cancel",        style=discord.ButtonStyle.danger,  custom_id="confirm_order_no"))


# ─────────────────────────────────────────────
#  MAIN FLOW CLASS
# ─────────────────────────────────────────────
class CommissionFlow:
    def __init__(self, bot, log_channel_id: int, owner_id: int):
        self.bot = bot
        self.log_channel_id = log_channel_id
        self.owner_id = owner_id
        self.active_sessions: dict[int, dict] = {}
        self.pending_users:   set[int]        = set()
        self.order_counter = 0
        # msg_id -> (user_id, field) — tracks which message we're waiting a reply to
        self.awaiting_reply: dict[int, tuple[int, str]] = {}

    # ── POST MAIN EMBED ──
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
            color=BRAND_COLOR
        )
        embed.set_footer(text="Fadyn Bot • Roblox UI Commissions")
        await channel.send(embed=embed, view=MainEntryView(self))

    # ── ROUTE BUTTON/SELECT INTERACTIONS ──
    async def handle_interaction(self, interaction: discord.Interaction):
        cid = interaction.data.get("custom_id", "")

        if   cid == "start_order":          await self._on_start_order(interaction)
        elif cid == "confirm_start_yes":    await self._on_confirmed_start(interaction)
        elif cid == "confirm_start_no":     await self._on_cancel_pending(interaction)
        elif cid.startswith("ui_type_"):    await self._on_button_answer(interaction, "ui_type", cid)
        elif cid.startswith("btn_style_"):  await self._on_button_answer(interaction, "button_style", cid)
        elif cid.startswith("frm_style_"):  await self._on_button_answer(interaction, "frame_style", cid)
        elif cid == "elements_select":      await self._on_elements_select(interaction)
        elif cid == "elements_done":        await self._on_elements_done(interaction)
        elif cid.startswith("design_style_"): await self._on_button_answer(interaction, "design_style", cid)
        elif cid.startswith("pay_method_"): await self._on_button_answer(interaction, "payment_method", cid)
        elif cid.startswith("budget_"):     await self._on_budget(interaction, cid)
        elif cid == "confirm_order_yes":    await self._on_order_confirmed(interaction)
        elif cid == "confirm_order_no":     await self._on_order_cancelled(interaction)
        elif cid.startswith("edit_"):       await self._on_edit(interaction, cid[5:])

    # ── HANDLE DM REPLIES ──
    async def handle_dm_reply(self, message: discord.Message):
        if message.author.bot:
            return
        # Must be a Discord reply (not a standalone message)
        if not message.reference or not message.reference.message_id:
            return
        ref_id = message.reference.message_id
        if ref_id not in self.awaiting_reply:
            return  # reply is to some other message — ignore silently
        user_id, field = self.awaiting_reply[ref_id]
        if user_id != message.author.id:
            return
        session = self.active_sessions.get(user_id)
        if not session:
            return

        answer = message.content.strip()
        if not answer:
            return

        # Delete the user's reply to keep DMs clean
        try:
            await message.delete()
        except Exception:
            pass

        # Save answer
        session[field] = answer
        self.awaiting_reply.pop(ref_id, None)

        # Edit the question embed → show answered state
        try:
            dm = await message.author.create_dm()
            msg = await dm.fetch_message(ref_id)
            await msg.edit(embed=answered_embed(field, answer), view=EditButtonView(field))
        except Exception:
            pass

        await self._advance(message.author)

    # ─────────── STEP LOGIC ───────────

    async def _advance(self, user: discord.User):
        s = self.active_sessions.get(user.id)
        if not s:
            return
        if not s["name"]:                                           await self._ask(user, "name")
        elif not s["project_name"]:                                 await self._ask(user, "project_name")
        elif not s["ui_type"]:                                      await self._ask(user, "ui_type",      view=UITypeView())
        elif s["ui_type"] in ("Buttons UI","Both") and not s["button_style"]:
                                                                    await self._ask(user, "button_style", view=ButtonStyleView())
        elif s["ui_type"] in ("Frames UI","Both") and not s["frame_style"]:
                                                                    await self._ask(user, "frame_style",  view=FrameStyleView())
        elif not s["elements"]:                                     await self._ask(user, "elements",     view=ElementsView())
        elif not s["design_style"]:                                 await self._ask(user, "design_style", view=DesignStyleView())
        elif not s["color_scheme"]:                                 await self._ask(user, "color_scheme")
        elif not s["reference"]:                                    await self._ask(user, "reference")
        elif not s["payment_method"]:                               await self._ask(user, "payment_method", view=PaymentView())
        elif not s["budget"]:                                       await self._ask(user, "budget",       view=BudgetView())
        elif s["extra_info"] == "":                                 await self._ask(user, "extra_info")
        else:                                                       await self._send_summary(user)

    async def _ask(self, user: discord.User, field: str, view: View = None):
        title, question = STEP_TITLES[field]
        if view:
            desc = question
        else:
            desc = f"{question}\n\n> 💬 **Reply to this message** with your answer."
        embed = neon_embed(title, desc)
        dm = await user.create_dm()
        msg = await dm.send(embed=embed, view=view)
        self.awaiting_reply[msg.id] = (user.id, field)

    # ─────────── BUTTON ANSWER HANDLER ───────────

    ANSWER_MAPS = {
        "ui_type":        {"ui_type_buttons":"Buttons UI","ui_type_frames":"Frames UI","ui_type_both":"Both"},
        "button_style":   {"btn_style_rounded":"Rounded","btn_style_square":"Square","btn_style_neon":"Neon/Glow"},
        "frame_style":    {"frm_style_sharp":"Sharp","frm_style_rounded":"Rounded","frm_style_glass":"Glass / Transparent","frm_style_neon":"Neon/Glow"},
        "design_style":   {"design_style_retro":"Retro","design_style_cartoon":"Cartoon","design_style_neon":"Neon/Glow"},
        "payment_method": {"pay_method_paypal":"PayPal","pay_method_cashapp":"Cash App","pay_method_robux":"Robux","pay_method_other":"Other"},
    }

    async def _on_button_answer(self, interaction: discord.Interaction, field: str, cid: str):
        session = self.active_sessions.get(interaction.user.id)
        if not session:
            return

        # Custom style — keep awaiting_reply alive for a text reply
        if cid in ("btn_style_custom", "frm_style_custom"):
            await interaction.response.send_message("✏️ Reply to the question message above with your custom style!", ephemeral=True)
            return

        answer = self.ANSWER_MAPS.get(field, {}).get(cid, cid)
        session[field] = answer

        # Remove from awaiting
        ref_id = self._get_ref(interaction.user.id, field)
        if ref_id:
            self.awaiting_reply.pop(ref_id, None)

        await interaction.response.edit_message(embed=answered_embed(field, answer), view=EditButtonView(field))
        await self._advance(interaction.user)

    async def _on_elements_select(self, interaction: discord.Interaction):
        session = self.active_sessions.get(interaction.user.id)
        if session:
            session["elements"] = interaction.data.get("values", [])
        await interaction.response.defer()

    async def _on_elements_done(self, interaction: discord.Interaction):
        session = self.active_sessions.get(interaction.user.id)
        if not session:
            return
        if not session["elements"]:
            await interaction.response.send_message("⚠️ Please select at least one element first!", ephemeral=True)
            return
        answer = ", ".join(session["elements"])
        ref_id = self._get_ref(interaction.user.id, "elements")
        if ref_id:
            self.awaiting_reply.pop(ref_id, None)
        await interaction.response.edit_message(embed=answered_embed("elements", answer), view=EditButtonView("elements"))
        await self._advance(interaction.user)

    async def _on_budget(self, interaction: discord.Interaction, cid: str):
        session = self.active_sessions.get(interaction.user.id)
        if not session:
            return
        if cid == "budget_custom":
            # Keep awaiting_reply for this message so user can reply
            self.awaiting_reply[interaction.message.id] = (interaction.user.id, "budget")
            await interaction.response.send_message("✏️ Reply to the budget message above with your custom amount!", ephemeral=True)
            return
        mapping = {"budget_under50":"Under $50","budget_50_100":"$50–$100","budget_100_300":"$100–$300","budget_300plus":"$300+"}
        answer = mapping.get(cid, "")
        session["budget"] = answer
        ref_id = self._get_ref(interaction.user.id, "budget")
        if ref_id:
            self.awaiting_reply.pop(ref_id, None)
        await interaction.response.edit_message(embed=answered_embed("budget", answer), view=EditButtonView("budget"))
        await self._advance(interaction.user)

    async def _on_edit(self, interaction: discord.Interaction, field: str):
        session = self.active_sessions.get(interaction.user.id)
        if not session:
            return
        if field == "elements":
            session["elements"] = []
        else:
            session[field] = ""
        # If editing a style, allow re-asking
        if field in ("button_style", "frame_style"):
            pass  # _advance will re-ask naturally
        await interaction.response.send_message("↩️ Re-sending that question...", ephemeral=True)
        await self._advance(interaction.user)

    # ─────────── ENTRY / EXIT ───────────

    async def _on_start_order(self, interaction: discord.Interaction):
        user = interaction.user
        if isinstance(interaction.channel, discord.DMChannel):
            await interaction.response.send_message("Please click the button from the server channel.", ephemeral=True)
            return
        if user.id in self.active_sessions:
            await interaction.response.send_message(embed=neon_embed("⚠️ Active Order In Progress","You already have an open order! Check your DMs.",ERROR_COLOR), ephemeral=True)
            return
        if user.id in self.pending_users:
            await interaction.response.send_message(embed=neon_embed("⚠️ Already Sent a DM!","Check your DMs — I already messaged you!",ERROR_COLOR), ephemeral=True)
            return
        try:
            embed = neon_embed("🛒 Start Your Commission","Are you sure you want to start a new UI commission order?\n\nThis will open a DM flow with all the questions.")
            await user.send(embed=embed, view=ConfirmStartView())
            self.pending_users.add(user.id)
            await interaction.response.send_message("📬 Check your DMs!", ephemeral=True)
        except discord.Forbidden:
            await interaction.response.send_message("❌ I couldn't DM you. Enable DMs from server members in your privacy settings.", ephemeral=True)

    async def _on_confirmed_start(self, interaction: discord.Interaction):
        user = interaction.user
        self.pending_users.discard(user.id)
        if user.id in self.active_sessions:
            await interaction.response.edit_message(embed=neon_embed("⚠️ Already Active","You already have a session running!",ERROR_COLOR), view=None)
            return
        self.active_sessions[user.id] = empty_order()
        embed = neon_embed("✅ Let's Go!","Great! I'll walk you through everything step by step.\n\n**Reply to each question message** to answer it. For questions with buttons, just click the button!", color=SUCCESS_COLOR)
        await interaction.response.edit_message(embed=embed, view=None)
        await self._advance(user)

    async def _on_cancel_pending(self, interaction: discord.Interaction):
        self.pending_users.discard(interaction.user.id)
        embed = neon_embed("👋 No Problem!","No worries! Come back anytime when you're ready.\n\nJust hit **Create Order** again whenever you want!")
        await interaction.response.edit_message(embed=embed, view=None)

    async def _on_order_confirmed(self, interaction: discord.Interaction):
        user = interaction.user
        session = self.active_sessions.get(user.id)
        if not session:
            return
        self.order_counter += 1
        order_id = f"FDN-{self.order_counter:04d}"
        embed = neon_embed("🎉 Order Submitted!", f"Your order **`{order_id}`** has been received!\n\nFadyn will review it and reach out to you shortly. Thank you! 💜", color=SUCCESS_COLOR)
        await interaction.response.edit_message(embed=embed, view=None)
        await self._log_order(user, session, order_id)
        del self.active_sessions[user.id]
        self.pending_users.discard(user.id)

    async def _on_order_cancelled(self, interaction: discord.Interaction):
        embed = neon_embed("❌ Order Cancelled","Your order has been cancelled.\n\nClick **Create Order** in the server to start again.", color=ERROR_COLOR)
        await interaction.response.edit_message(embed=embed, view=None)
        self.active_sessions.pop(interaction.user.id, None)
        self.pending_users.discard(interaction.user.id)

    # ─────────── SUMMARY ───────────

    async def _send_summary(self, user: discord.User):
        s = self.active_sessions.get(user.id)
        if not s:
            return
        elements_str = ", ".join(s["elements"]) if s["elements"] else "N/A"
        style_lines = ""
        if s.get("button_style"): style_lines += f"• Button Style: **{s['button_style']}**\n"
        if s.get("frame_style"):  style_lines += f"• Frame Style: **{s['frame_style']}**\n"

        embed = discord.Embed(title="✅ Order Summary — Please Confirm", description="Here's everything I've got. Does it all look right?", color=SUCCESS_COLOR)
        embed.add_field(name="👤 Name",          value=s["name"],            inline=True)
        embed.add_field(name="🎮 Project",       value=s["project_name"],    inline=True)
        embed.add_field(name="\u200b",           value="\u200b",             inline=False)
        embed.add_field(name="🧩 UI Type",       value=s["ui_type"],         inline=True)
        embed.add_field(name="🎨 Design Style",  value=s["design_style"],    inline=True)
        embed.add_field(name="🔘 Styles",        value=style_lines or "N/A", inline=False)
        embed.add_field(name="🧠 Elements",      value=elements_str,         inline=False)
        embed.add_field(name="🖌️ Color Scheme", value=s["color_scheme"],    inline=True)
        embed.add_field(name="📎 Reference",     value=s["reference"],       inline=False)
        embed.add_field(name="💳 Payment",       value=s["payment_method"],  inline=True)
        embed.add_field(name="💰 Budget",        value=s["budget"],          inline=True)
        embed.add_field(name="📝 Extra Info",    value=s["extra_info"] or "None", inline=False)
        embed.set_footer(text="Fadyn Bot • Confirm or cancel below")

        dm = await user.create_dm()
        await dm.send(embed=embed, view=FinalConfirmView())

    # ─────────── HELPERS ───────────

    def _get_ref(self, user_id: int, field: str) -> Optional[int]:
        for msg_id, (uid, f) in self.awaiting_reply.items():
            if uid == user_id and f == field:
                return msg_id
        return None

    async def _log_order(self, user: discord.User, s: dict, order_id: str):
        elements_str = ", ".join(s["elements"]) if s["elements"] else "N/A"
        embed = discord.Embed(title=f"📥 New Commission — {order_id}", color=ACCENT_COLOR, timestamp=datetime.utcnow())
        embed.set_author(name=str(user), icon_url=user.display_avatar.url)
        embed.add_field(name="Discord",      value=f"{user.mention} (`{user.id}`)", inline=True)
        embed.add_field(name="Name",         value=s["name"],            inline=True)
        embed.add_field(name="Project",      value=s["project_name"],    inline=True)
        embed.add_field(name="UI Type",      value=s["ui_type"],         inline=True)
        embed.add_field(name="Design Style", value=s["design_style"],    inline=True)
        embed.add_field(name="Elements",     value=elements_str,         inline=False)
        if s.get("button_style"): embed.add_field(name="Button Style", value=s["button_style"], inline=True)
        if s.get("frame_style"):  embed.add_field(name="Frame Style",  value=s["frame_style"],  inline=True)
        embed.add_field(name="Color Scheme", value=s["color_scheme"],   inline=False)
        embed.add_field(name="Reference",    value=s["reference"],       inline=False)
        embed.add_field(name="Payment",      value=s["payment_method"],  inline=True)
        embed.add_field(name="Budget",       value=s["budget"],          inline=True)
        embed.add_field(name="Extra Info",   value=s.get("extra_info") or "None", inline=False)
        embed.set_footer(text=f"Order ID: {order_id}")

        if self.log_channel_id:
            ch = self.bot.get_channel(self.log_channel_id)
            if ch:
                await ch.send(embed=embed)
        if self.owner_id:
            try:
                owner = await self.bot.fetch_user(self.owner_id)
                await owner.send(content=f"🔔 **New commission from {user}!** `{order_id}`", embed=embed)
            except Exception:
                pass
