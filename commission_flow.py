import discord
from discord.ui import View, Button, Select, Modal, TextInput
import asyncio
from datetime import datetime
from typing import Optional
import json


# ─────────────────────────────────────────────
#  DATA STRUCTURE FOR AN ORDER SESSION
# ─────────────────────────────────────────────
def empty_order():
    return {
        "name": "",
        "project_name": "",
        "ui_type": [],           # buttons / frames / both
        "button_style": "",
        "frame_style": "",
        "elements": [],
        "design_style": "",
        "color_scheme": "",
        "fonts_branding": "",
        "reference": "",         # link or attachment URL
        "payment_method": "",
        "budget": "",
        "extra_info": "",
        "step": 0,
        "started_at": datetime.utcnow().isoformat(),
    }


# ─────────────────────────────────────────────
#  COLOURS & HELPERS
# ─────────────────────────────────────────────
BRAND_COLOR = 0x7B2FFF   # purple
ACCENT_COLOR = 0x00F5FF  # neon cyan
SUCCESS_COLOR = 0x00FF88
ERROR_COLOR = 0xFF4466


def neon_embed(title: str, description: str, color: int = BRAND_COLOR, step: Optional[int] = None, total: int = 8) -> discord.Embed:
    embed = discord.Embed(title=title, description=description, color=color)
    if step is not None:
        embed.set_footer(text=f"Fadyn Bot • Step {step}/{total}")
    else:
        embed.set_footer(text="Fadyn Bot • Roblox UI Commissions")
    return embed


# ─────────────────────────────────────────────
#  MODALS
# ─────────────────────────────────────────────
class BasicInfoModal(Modal, title="📋 Basic Info"):
    name = TextInput(label="Your Name", placeholder="e.g. Alex", max_length=50)
    project_name = TextInput(label="Project Name", placeholder="e.g. Phantom Warzone", max_length=100)

    def __init__(self, flow, user_id):
        super().__init__()
        self.flow = flow
        self.user_id = user_id

    async def on_submit(self, interaction: discord.Interaction):
        session = self.flow.active_sessions.get(self.user_id)
        if not session:
            await interaction.response.send_message("Session expired. Please start again.", ephemeral=True)
            return
        session["name"] = self.name.value
        session["project_name"] = self.project_name.value
        session["step"] = 2
        await interaction.response.defer()
        await self.flow.send_step(interaction.user, 2)


class CustomButtonStyleModal(Modal, title="🖊️ Custom Button Style"):
    custom_style = TextInput(label="Describe your custom button style", placeholder="e.g. Rounded with a soft shadow and pastel tones", max_length=200)

    def __init__(self, flow, user_id):
        super().__init__()
        self.flow = flow
        self.user_id = user_id

    async def on_submit(self, interaction: discord.Interaction):
        session = self.flow.active_sessions.get(self.user_id)
        if not session:
            await interaction.response.send_message("Session expired.", ephemeral=True)
            return
        session["button_style"] = f"Custom: {self.custom_style.value}"
        await interaction.response.defer()
        await self.flow.advance_after_styles(interaction.user)


class CustomFrameStyleModal(Modal, title="🖊️ Custom Frame Style"):
    custom_style = TextInput(label="Describe your custom frame style", placeholder="e.g. Dark glass with glitch borders", max_length=200)

    def __init__(self, flow, user_id):
        super().__init__()
        self.flow = flow
        self.user_id = user_id

    async def on_submit(self, interaction: discord.Interaction):
        session = self.flow.active_sessions.get(self.user_id)
        if not session:
            await interaction.response.send_message("Session expired.", ephemeral=True)
            return
        session["frame_style"] = f"Custom: {self.custom_style.value}"
        await interaction.response.defer()
        await self.flow.advance_after_styles(interaction.user)


class ColorFontModal(Modal, title="🎨 Style & Design Details"):
    color_scheme = TextInput(label="Preferred Color Scheme", placeholder="e.g. Dark purple + cyan neon glow", max_length=150)
    fonts_branding = TextInput(label="Fonts / Branding (optional)", placeholder="e.g. Orbitron font, no logo yet", required=False, max_length=200)

    def __init__(self, flow, user_id):
        super().__init__()
        self.flow = flow
        self.user_id = user_id

    async def on_submit(self, interaction: discord.Interaction):
        session = self.flow.active_sessions.get(self.user_id)
        if not session:
            await interaction.response.send_message("Session expired.", ephemeral=True)
            return
        session["color_scheme"] = self.color_scheme.value
        session["fonts_branding"] = self.fonts_branding.value or "Not specified"
        session["step"] = 6
        await interaction.response.defer()
        await self.flow.send_step(interaction.user, 6)


class ReferenceModal(Modal, title="📎 References"):
    reference = TextInput(
        label="Image Link or Description",
        placeholder="Paste an image URL, Imgur link, or describe reference(s)",
        style=discord.TextStyle.paragraph,
        max_length=500
    )

    def __init__(self, flow, user_id):
        super().__init__()
        self.flow = flow
        self.user_id = user_id

    async def on_submit(self, interaction: discord.Interaction):
        session = self.flow.active_sessions.get(self.user_id)
        if not session:
            await interaction.response.send_message("Session expired.", ephemeral=True)
            return
        session["reference"] = self.reference.value
        session["step"] = 7
        await interaction.response.defer()
        await self.flow.send_step(interaction.user, 7)


class CustomBudgetModal(Modal, title="💸 Custom Budget"):
    budget = TextInput(label="Your Budget", placeholder="e.g. $75 USD or 5000 Robux", max_length=100)

    def __init__(self, flow, user_id):
        super().__init__()
        self.flow = flow
        self.user_id = user_id

    async def on_submit(self, interaction: discord.Interaction):
        session = self.flow.active_sessions.get(self.user_id)
        if not session:
            await interaction.response.send_message("Session expired.", ephemeral=True)
            return
        session["budget"] = f"Custom: {self.budget.value}"
        session["step"] = 8
        await interaction.response.defer()
        await self.flow.send_step(interaction.user, 8)


class ExtraInfoModal(Modal, title="📝 Extra Info"):
    extra = TextInput(
        label="Anything else I should know?",
        style=discord.TextStyle.paragraph,
        placeholder="Deadlines, special requests, game genre, references to other games...",
        required=False,
        max_length=600
    )

    def __init__(self, flow, user_id):
        super().__init__()
        self.flow = flow
        self.user_id = user_id

    async def on_submit(self, interaction: discord.Interaction):
        session = self.flow.active_sessions.get(self.user_id)
        if not session:
            await interaction.response.send_message("Session expired.", ephemeral=True)
            return
        session["extra_info"] = self.extra.value or "None"
        session["step"] = 9
        await interaction.response.defer()
        await self.flow.send_step(interaction.user, 9)


# ─────────────────────────────────────────────
#  MAIN COMMISSION FLOW CLASS
# ─────────────────────────────────────────────
class CommissionFlow:
    def __init__(self, bot, log_channel_id: int, owner_id: int):
        self.bot = bot
        self.log_channel_id = log_channel_id
        self.owner_id = owner_id
        self.active_sessions: dict[int, dict] = {}  # user_id -> order dict
        self.order_counter = 0

    # ── POST THE MAIN EMBED IN #ui-commissions ──
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
        embed.set_thumbnail(url="https://i.imgur.com/placeholder.png")  # replace with your logo
        embed.set_footer(text="Fadyn Bot • Roblox UI Commissions")

        view = MainEntryView(self)
        await channel.send(embed=embed, view=view)

    # ── HANDLE COMPONENT INTERACTIONS ──
    async def handle_interaction(self, interaction: discord.Interaction):
        cid = interaction.data.get("custom_id", "")

        # Entry buttons
        if cid == "start_order":
            await self.on_start_order(interaction)
        elif cid == "confirm_start_yes":
            await self.on_confirmed_start(interaction)
        elif cid == "confirm_start_no":
            await interaction.response.edit_message(
                content="No worries! Come back anytime when you're ready. 👋",
                embed=None, view=None
            )

        # Step 2 — UI Type
        elif cid.startswith("ui_type_"):
            await self.on_ui_type(interaction, cid)

        # Step 3 — Button styles
        elif cid.startswith("btn_style_"):
            await self.on_button_style(interaction, cid)
        elif cid == "btn_style_custom":
            await interaction.response.send_modal(CustomButtonStyleModal(self, interaction.user.id))

        # Step 3b — Frame styles
        elif cid.startswith("frm_style_"):
            await self.on_frame_style(interaction, cid)
        elif cid == "frm_style_custom":
            await interaction.response.send_modal(CustomFrameStyleModal(self, interaction.user.id))

        # Step 4 — Elements (multi-select handled via select menu)
        elif cid == "elements_done":
            await self.on_elements_done(interaction)

        # Step 5 — Design style
        elif cid.startswith("design_style_"):
            await self.on_design_style(interaction, cid)

        # Step 5b — Color/font modal trigger
        elif cid == "open_color_modal":
            await interaction.response.send_modal(ColorFontModal(self, interaction.user.id))

        # Step 6 — Reference
        elif cid == "open_reference_modal":
            await interaction.response.send_modal(ReferenceModal(self, interaction.user.id))

        # Step 7 — Payment method
        elif cid.startswith("pay_method_"):
            await self.on_payment_method(interaction, cid)

        # Step 7b — Budget
        elif cid.startswith("budget_"):
            await self.on_budget(interaction, cid)
        elif cid == "budget_custom":
            await interaction.response.send_modal(CustomBudgetModal(self, interaction.user.id))

        # Step 8 — Extra info
        elif cid == "open_extra_modal":
            await interaction.response.send_modal(ExtraInfoModal(self, interaction.user.id))

        # Step 9 — Final confirmation
        elif cid == "confirm_order_yes":
            await self.on_order_confirmed(interaction)
        elif cid == "confirm_order_no":
            await self.on_order_edit(interaction)

        # Elements select menu
        elif cid == "elements_select":
            await self.on_elements_select(interaction)

    async def handle_modal(self, interaction: discord.Interaction):
        pass  # Handled inside each Modal's on_submit

    # ─────────────── STEP HANDLERS ───────────────

    async def on_start_order(self, interaction: discord.Interaction):
        user = interaction.user
        # Only works in the server (not DM)
        if isinstance(interaction.channel, discord.DMChannel):
            await interaction.response.send_message("Please click the button from the server channel.", ephemeral=True)
            return

        try:
            embed = neon_embed(
                "🛒 Start Your Commission",
                "Hey! Are you sure you want to start a new UI commission order?\n\nThis will open a private DM flow with all the questions.",
                color=BRAND_COLOR
            )
            view = ConfirmStartView(self)
            await user.send(embed=embed, view=view)
            await interaction.response.send_message("📬 Check your DMs! I sent you a message.", ephemeral=True)
        except discord.Forbidden:
            await interaction.response.send_message(
                "❌ I couldn't DM you. Please enable DMs from server members in your privacy settings.",
                ephemeral=True
            )

    async def on_confirmed_start(self, interaction: discord.Interaction):
        user = interaction.user
        if user.id in self.active_sessions:
            await interaction.response.edit_message(
                content="⚠️ You already have an active session! Please finish or cancel it first.",
                embed=None, view=None
            )
            return
        self.active_sessions[user.id] = empty_order()
        await interaction.response.edit_message(
            content="✅ Let's get started!",
            embed=None, view=None
        )
        await self.send_step(user, 1)

    async def send_step(self, user: discord.User, step: int):
        session = self.active_sessions.get(user.id)
        if not session:
            return

        if step == 1:
            embed = neon_embed("👤 Step 1: Basic Info", "Let's start with some basic details about you and your project.", step=1)
            view = Step1View(self, user.id)
            await user.send(embed=embed, view=view)

        elif step == 2:
            embed = neon_embed("🧩 Step 2: UI Type", "What type of UI do you need?", step=2)
            view = Step2View(self, user.id)
            await user.send(embed=embed, view=view)

        elif step == 3:
            ui_type = session.get("ui_type", [])
            if "Buttons UI" in ui_type or "Both" in ui_type:
                embed = neon_embed("🔘 Step 3A: Button Style", "What style of buttons do you want?", step=3)
                view = Step3ButtonsView(self, user.id)
                await user.send(embed=embed, view=view)
            elif "Frames UI" in ui_type:
                embed = neon_embed("🖼️ Step 3B: Frame Style", "What style of frames do you want?", step=3)
                view = Step3FramesView(self, user.id)
                await user.send(embed=embed, view=view)

        elif step == "3b":
            # After button style, ask for frame style if "Both"
            embed = neon_embed("🖼️ Step 3B: Frame Style", "Now, what style of frames do you want?", step=3)
            view = Step3FramesView(self, user.id)
            await user.send(embed=embed, view=view)

        elif step == 4:
            embed = neon_embed(
                "🧠 Step 4: UI Elements",
                "Select all the UI elements you need.\nWhen you're done selecting, click **Done ✅**.",
                step=4
            )
            view = Step4ElementsView(self, user.id)
            await user.send(embed=embed, view=view)

        elif step == 5:
            embed = neon_embed("🎨 Step 5: Design Style", "What overall style are you going for?", step=5)
            view = Step5StyleView(self, user.id)
            await user.send(embed=embed, view=view)

        elif step == "5b":
            embed = neon_embed(
                "🎨 Step 5B: Colors & Fonts",
                "Now tell me about your color scheme and any fonts or branding.\nClick the button below to fill in the details.",
                step=5
            )
            view = Step5bColorView(self, user.id)
            await user.send(embed=embed, view=view)

        elif step == 6:
            embed = neon_embed(
                "📎 Step 6: References",
                "Please provide a reference image or link.\n\n"
                "You can paste:\n• A direct image URL (Imgur, Discord CDN, etc.)\n• A Google Drive link\n• A description if you have no image",
                step=6
            )
            view = Step6RefView(self, user.id)
            await user.send(embed=embed, view=view)

        elif step == 7:
            embed = neon_embed("💳 Step 7A: Payment Method", "How would you like to pay?", step=7)
            view = Step7PaymentView(self, user.id)
            await user.send(embed=embed, view=view)

        elif step == "7b":
            embed = neon_embed("💰 Step 7B: Budget", "What's your budget range?", step=7)
            view = Step7BudgetView(self, user.id)
            await user.send(embed=embed, view=view)

        elif step == 8:
            embed = neon_embed(
                "📝 Step 8: Extra Info",
                "Almost done! Click below to add any extra notes, deadlines, or special requests.",
                step=8
            )
            view = Step8ExtraView(self, user.id)
            await user.send(embed=embed, view=view)

        elif step == 9:
            await self.send_confirmation(user)

    async def advance_after_styles(self, user: discord.User):
        """After button or frame style is set, check if we need the other one."""
        session = self.active_sessions.get(user.id)
        if not session:
            return
        ui_type = session.get("ui_type", [])
        has_buttons = "Buttons UI" in ui_type or "Both" in ui_type
        has_frames = "Frames UI" in ui_type or "Both" in ui_type

        if has_buttons and has_frames and not session.get("button_style") and not session.get("frame_style"):
            await self.send_step(user, 3)
        elif has_buttons and has_frames and session.get("button_style") and not session.get("frame_style"):
            await self.send_step(user, "3b")
        else:
            session["step"] = 4
            await self.send_step(user, 4)

    async def on_ui_type(self, interaction: discord.Interaction, cid: str):
        session = self.active_sessions.get(interaction.user.id)
        if not session:
            return
        mapping = {
            "ui_type_buttons": "Buttons UI",
            "ui_type_frames": "Frames UI",
            "ui_type_both": "Both"
        }
        chosen = mapping.get(cid, "Both")
        session["ui_type"] = [chosen]
        session["step"] = 3
        await interaction.response.edit_message(
            content=f"✅ UI Type: **{chosen}**",
            embed=None, view=None
        )
        await self.send_step(interaction.user, 3)

    async def on_button_style(self, interaction: discord.Interaction, cid: str):
        session = self.active_sessions.get(interaction.user.id)
        if not session:
            return
        mapping = {
            "btn_style_rounded": "Rounded",
            "btn_style_square": "Square",
            "btn_style_neon": "Neon/Glow",
        }
        style = mapping.get(cid, "")
        session["button_style"] = style
        await interaction.response.edit_message(
            content=f"✅ Button Style: **{style}**",
            embed=None, view=None
        )
        await self.advance_after_styles(interaction.user)

    async def on_frame_style(self, interaction: discord.Interaction, cid: str):
        session = self.active_sessions.get(interaction.user.id)
        if not session:
            return
        mapping = {
            "frm_style_sharp": "Sharp",
            "frm_style_rounded": "Rounded",
            "frm_style_glass": "Glass / Transparent",
            "frm_style_neon": "Neon/Glow",
        }
        style = mapping.get(cid, "")
        session["frame_style"] = style
        await interaction.response.edit_message(
            content=f"✅ Frame Style: **{style}**",
            embed=None, view=None
        )
        await self.advance_after_styles(interaction.user)

    async def on_elements_select(self, interaction: discord.Interaction):
        session = self.active_sessions.get(interaction.user.id)
        if not session:
            return
        values = interaction.data.get("values", [])
        session["elements"] = values
        await interaction.response.defer()

    async def on_elements_done(self, interaction: discord.Interaction):
        session = self.active_sessions.get(interaction.user.id)
        if not session:
            return
        if not session.get("elements"):
            await interaction.response.send_message("⚠️ Please select at least one element first!", ephemeral=True)
            return
        session["step"] = 5
        await interaction.response.edit_message(
            content=f"✅ Elements: **{', '.join(session['elements'])}**",
            embed=None, view=None
        )
        await self.send_step(interaction.user, 5)

    async def on_design_style(self, interaction: discord.Interaction, cid: str):
        session = self.active_sessions.get(interaction.user.id)
        if not session:
            return
        mapping = {
            "design_style_retro": "Retro",
            "design_style_cartoon": "Cartoon",
            "design_style_neon": "Neon/Glow",
        }
        style = mapping.get(cid, "")
        session["design_style"] = style
        await interaction.response.edit_message(
            content=f"✅ Design Style: **{style}**",
            embed=None, view=None
        )
        await self.send_step(interaction.user, "5b")

    async def on_payment_method(self, interaction: discord.Interaction, cid: str):
        session = self.active_sessions.get(interaction.user.id)
        if not session:
            return
        mapping = {
            "pay_method_paypal": "PayPal",
            "pay_method_cashapp": "Cash App",
            "pay_method_robux": "Robux",
            "pay_method_other": "Other",
        }
        method = mapping.get(cid, "")
        session["payment_method"] = method
        await interaction.response.edit_message(
            content=f"✅ Payment: **{method}**",
            embed=None, view=None
        )
        await self.send_step(interaction.user, "7b")

    async def on_budget(self, interaction: discord.Interaction, cid: str):
        session = self.active_sessions.get(interaction.user.id)
        if not session:
            return
        mapping = {
            "budget_under50": "Under $50",
            "budget_50_100": "$50–$100",
            "budget_100_300": "$100–$300",
            "budget_300plus": "$300+",
        }
        budget = mapping.get(cid, "")
        session["budget"] = budget
        session["step"] = 8
        await interaction.response.edit_message(
            content=f"✅ Budget: **{budget}**",
            embed=None, view=None
        )
        await self.send_step(interaction.user, 8)

    async def send_confirmation(self, user: discord.User):
        session = self.active_sessions.get(user.id)
        if not session:
            return

        ui_type_str = ", ".join(session.get("ui_type", ["N/A"]))
        elements_str = ", ".join(session.get("elements", ["N/A"])) if session.get("elements") else "N/A"

        style_line = ""
        if session.get("button_style"):
            style_line += f"• Button Style: **{session['button_style']}**\n"
        if session.get("frame_style"):
            style_line += f"• Frame Style: **{session['frame_style']}**\n"

        embed = discord.Embed(
            title="✅ Order Summary — Please Confirm",
            description="Here's everything I've got. Does this look right?",
            color=SUCCESS_COLOR
        )
        embed.add_field(name="👤 Client", value=f"{session['name']}", inline=True)
        embed.add_field(name="🎮 Project", value=f"{session['project_name']}", inline=True)
        embed.add_field(name="\u200b", value="\u200b", inline=False)
        embed.add_field(name="🧩 UI Type", value=ui_type_str, inline=True)
        embed.add_field(name="🎨 Design Style", value=session.get("design_style", "N/A"), inline=True)
        embed.add_field(name="🔘 Styles", value=style_line or "N/A", inline=False)
        embed.add_field(name="🧠 Elements", value=elements_str, inline=False)
        embed.add_field(name="🖌️ Color Scheme", value=session.get("color_scheme", "N/A"), inline=True)
        embed.add_field(name="🔤 Fonts/Branding", value=session.get("fonts_branding", "N/A"), inline=True)
        embed.add_field(name="📎 Reference", value=session.get("reference", "N/A"), inline=False)
        embed.add_field(name="💳 Payment", value=session.get("payment_method", "N/A"), inline=True)
        embed.add_field(name="💰 Budget", value=session.get("budget", "N/A"), inline=True)
        embed.add_field(name="📝 Extra Info", value=session.get("extra_info", "None"), inline=False)
        embed.set_footer(text="Fadyn Bot • Please confirm or go back to edit")

        view = FinalConfirmView(self, user.id)
        await user.send(embed=embed, view=view)

    async def on_order_confirmed(self, interaction: discord.Interaction):
        user = interaction.user
        session = self.active_sessions.get(user.id)
        if not session:
            return

        self.order_counter += 1
        order_id = f"FDN-{self.order_counter:04d}"
        session["order_id"] = order_id

        # Tell the user
        await interaction.response.edit_message(
            content=(
                f"🎉 **Order `{order_id}` submitted!**\n\n"
                "Fadyn will review your order and reach out to you shortly.\n"
                "Thank you for commissioning! 💜"
            ),
            embed=None, view=None
        )

        # Log to owner/log channel
        await self.log_order(user, session, order_id)

        # Clean up session
        del self.active_sessions[user.id]

    async def on_order_edit(self, interaction: discord.Interaction):
        await interaction.response.edit_message(
            content="No problem! Unfortunately re-editing isn't supported yet.\nPlease click **Create Order** again to restart.",
            embed=None, view=None
        )
        if interaction.user.id in self.active_sessions:
            del self.active_sessions[interaction.user.id]

    async def log_order(self, user: discord.User, session: dict, order_id: str):
        """Send order details to the log channel and DM the owner."""
        ui_type_str = ", ".join(session.get("ui_type", ["N/A"]))
        elements_str = ", ".join(session.get("elements", ["N/A"])) if session.get("elements") else "N/A"

        embed = discord.Embed(
            title=f"📥 New Commission — {order_id}",
            color=ACCENT_COLOR,
            timestamp=datetime.utcnow()
        )
        embed.set_author(name=str(user), icon_url=user.display_avatar.url)
        embed.add_field(name="Discord", value=f"{user.mention} (`{user.id}`)", inline=True)
        embed.add_field(name="Client Name", value=session['name'], inline=True)
        embed.add_field(name="Project", value=session['project_name'], inline=True)
        embed.add_field(name="UI Type", value=ui_type_str, inline=True)
        embed.add_field(name="Design Style", value=session.get("design_style", "N/A"), inline=True)
        embed.add_field(name="Elements", value=elements_str, inline=False)
        if session.get("button_style"):
            embed.add_field(name="Button Style", value=session["button_style"], inline=True)
        if session.get("frame_style"):
            embed.add_field(name="Frame Style", value=session["frame_style"], inline=True)
        embed.add_field(name="Color Scheme", value=session.get("color_scheme", "N/A"), inline=True)
        embed.add_field(name="Fonts/Branding", value=session.get("fonts_branding", "N/A"), inline=True)
        embed.add_field(name="Reference", value=session.get("reference", "N/A"), inline=False)
        embed.add_field(name="Payment", value=session.get("payment_method", "N/A"), inline=True)
        embed.add_field(name="Budget", value=session.get("budget", "N/A"), inline=True)
        embed.add_field(name="Extra Info", value=session.get("extra_info", "None"), inline=False)
        embed.set_footer(text=f"Order ID: {order_id}")

        # Log channel
        if self.log_channel_id:
            channel = self.bot.get_channel(self.log_channel_id)
            if channel:
                await channel.send(embed=embed)

        # DM owner
        if self.owner_id:
            try:
                owner = await self.bot.fetch_user(self.owner_id)
                await owner.send(
                    content=f"🔔 **New commission from {user}!** Order ID: `{order_id}`",
                    embed=embed
                )
            except Exception:
                pass


# ─────────────────────────────────────────────
#  VIEWS
# ─────────────────────────────────────────────
class MainEntryView(View):
    def __init__(self, flow):
        super().__init__(timeout=None)
        self.flow = flow
        btn = Button(label="🛒 Create Order", style=discord.ButtonStyle.primary, custom_id="start_order")
        self.add_item(btn)


class ConfirmStartView(View):
    def __init__(self, flow):
        super().__init__(timeout=120)
        self.flow = flow
        yes = Button(label="Yes, let's go! ✅", style=discord.ButtonStyle.success, custom_id="confirm_start_yes")
        no = Button(label="Not right now ❌", style=discord.ButtonStyle.secondary, custom_id="confirm_start_no")
        self.add_item(yes)
        self.add_item(no)


class Step1View(View):
    def __init__(self, flow, user_id):
        super().__init__(timeout=300)
        self.flow = flow
        self.user_id = user_id
        btn = Button(label="📝 Fill in Basic Info", style=discord.ButtonStyle.primary, custom_id="__step1_open__")
        btn.callback = self.open_modal
        self.add_item(btn)

    async def open_modal(self, interaction: discord.Interaction):
        await interaction.response.send_modal(BasicInfoModal(self.flow, self.user_id))


class Step2View(View):
    def __init__(self, flow, user_id):
        super().__init__(timeout=300)
        self.flow = flow
        buttons = Button(label="🔘 Buttons UI", style=discord.ButtonStyle.primary, custom_id="ui_type_buttons")
        frames = Button(label="🖼️ Frames UI", style=discord.ButtonStyle.primary, custom_id="ui_type_frames")
        both = Button(label="⚡ Both", style=discord.ButtonStyle.success, custom_id="ui_type_both")
        self.add_item(buttons)
        self.add_item(frames)
        self.add_item(both)


class Step3ButtonsView(View):
    def __init__(self, flow, user_id):
        super().__init__(timeout=300)
        self.flow = flow
        options = [
            ("Rounded", "btn_style_rounded", discord.ButtonStyle.primary),
            ("Square", "btn_style_square", discord.ButtonStyle.primary),
            ("Neon/Glow ✨", "btn_style_neon", discord.ButtonStyle.primary),
            ("Custom 🖊️", "btn_style_custom", discord.ButtonStyle.secondary),
        ]
        for label, cid, style in options:
            self.add_item(Button(label=label, style=style, custom_id=cid))


class Step3FramesView(View):
    def __init__(self, flow, user_id):
        super().__init__(timeout=300)
        self.flow = flow
        options = [
            ("Sharp", "frm_style_sharp", discord.ButtonStyle.primary),
            ("Rounded", "frm_style_rounded", discord.ButtonStyle.primary),
            ("Glass / Transparent", "frm_style_glass", discord.ButtonStyle.primary),
            ("Neon/Glow ✨", "frm_style_neon", discord.ButtonStyle.primary),
            ("Custom 🖊️", "frm_style_custom", discord.ButtonStyle.secondary),
        ]
        for label, cid, style in options:
            self.add_item(Button(label=label, style=style, custom_id=cid))


class Step4ElementsView(View):
    def __init__(self, flow, user_id):
        super().__init__(timeout=300)
        self.flow = flow
        self.user_id = user_id

        select = Select(
            custom_id="elements_select",
            placeholder="Select all elements you need...",
            min_values=1,
            max_values=7,
            options=[
                discord.SelectOption(label="Main Menu", value="Main Menu", emoji="🏠"),
                discord.SelectOption(label="HUD (health, ammo, etc.)", value="HUD", emoji="❤️"),
                discord.SelectOption(label="Inventory", value="Inventory", emoji="🎒"),
                discord.SelectOption(label="Shop", value="Shop", emoji="🛒"),
                discord.SelectOption(label="Settings Menu", value="Settings Menu", emoji="⚙️"),
                discord.SelectOption(label="Leaderboard", value="Leaderboard", emoji="🏆"),
                discord.SelectOption(label="Other (specify in extra info)", value="Other", emoji="📌"),
            ]
        )
        done_btn = Button(label="Done ✅", style=discord.ButtonStyle.success, custom_id="elements_done")
        self.add_item(select)
        self.add_item(done_btn)


class Step5StyleView(View):
    def __init__(self, flow, user_id):
        super().__init__(timeout=300)
        self.flow = flow
        options = [
            ("🕹️ Retro", "design_style_retro"),
            ("🎨 Cartoon", "design_style_cartoon"),
            ("✨ Neon/Glow", "design_style_neon"),
        ]
        for label, cid in options:
            self.add_item(Button(label=label, style=discord.ButtonStyle.primary, custom_id=cid))


class Step5bColorView(View):
    def __init__(self, flow, user_id):
        super().__init__(timeout=300)
        self.flow = flow
        self.user_id = user_id
        btn = Button(label="🎨 Enter Colors & Fonts", style=discord.ButtonStyle.primary, custom_id="open_color_modal")
        self.add_item(btn)


class Step6RefView(View):
    def __init__(self, flow, user_id):
        super().__init__(timeout=300)
        self.flow = flow
        self.user_id = user_id
        btn = Button(label="📎 Add Reference", style=discord.ButtonStyle.primary, custom_id="open_reference_modal")
        self.add_item(btn)


class Step7PaymentView(View):
    def __init__(self, flow, user_id):
        super().__init__(timeout=300)
        self.flow = flow
        options = [
            ("💳 PayPal", "pay_method_paypal"),
            ("💵 Cash App", "pay_method_cashapp"),
            ("🎮 Robux", "pay_method_robux"),
            ("❓ Other", "pay_method_other"),
        ]
        for label, cid in options:
            self.add_item(Button(label=label, style=discord.ButtonStyle.primary, custom_id=cid))


class Step7BudgetView(View):
    def __init__(self, flow, user_id):
        super().__init__(timeout=300)
        self.flow = flow
        options = [
            ("< $50", "budget_under50"),
            ("$50–$100", "budget_50_100"),
            ("$100–$300", "budget_100_300"),
            ("$300+", "budget_300plus"),
            ("Custom 🖊️", "budget_custom"),
        ]
        for label, cid in options:
            self.add_item(Button(label=label, style=discord.ButtonStyle.primary, custom_id=cid))


class Step8ExtraView(View):
    def __init__(self, flow, user_id):
        super().__init__(timeout=300)
        self.flow = flow
        self.user_id = user_id
        btn = Button(label="📝 Add Extra Info", style=discord.ButtonStyle.primary, custom_id="open_extra_modal")
        self.add_item(btn)


class FinalConfirmView(View):
    def __init__(self, flow, user_id):
        super().__init__(timeout=300)
        self.flow = flow
        self.user_id = user_id
        yes = Button(label="✅ Yes, Submit Order!", style=discord.ButtonStyle.success, custom_id="confirm_order_yes")
        no = Button(label="❌ No, Start Over", style=discord.ButtonStyle.danger, custom_id="confirm_order_no")
        self.add_item(yes)
        self.add_item(no)
