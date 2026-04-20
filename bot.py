import discord
from discord.ext import commands
from discord import app_commands
import os
from dotenv import load_dotenv
from commission_flow import CommissionFlow

load_dotenv()

TOKEN = os.getenv("DISCORD_TOKEN")
COMMISSION_CHANNEL_ID = int(os.getenv("COMMISSION_CHANNEL_ID", 0))
LOG_CHANNEL_ID = int(os.getenv("LOG_CHANNEL_ID", 0))
OWNER_ID = int(os.getenv("OWNER_ID", 0))

intents = discord.Intents.default()
intents.message_content = True
intents.members = True
intents.dm_messages = True

bot = commands.Bot(command_prefix="!", intents=intents)
commission_flow = CommissionFlow(bot, LOG_CHANNEL_ID, OWNER_ID)


@bot.event
async def on_ready():
    print(f"✅ Fadyn Bot is online as {bot.user}")
    try:
        synced = await bot.tree.sync()
        print(f"Synced {len(synced)} command(s)")
    except Exception as e:
        print(f"Sync error: {e}")

    # Auto-post the commission embed if channel is set
    if COMMISSION_CHANNEL_ID:
        channel = bot.get_channel(COMMISSION_CHANNEL_ID)
        if channel:
            # Check if bot already posted (optional: clear old ones)
            await commission_flow.post_main_embed(channel)


@bot.tree.command(name="setup", description="Post the commissions embed in this channel")
@app_commands.checks.has_permissions(administrator=True)
async def setup(interaction: discord.Interaction):
    await commission_flow.post_main_embed(interaction.channel)
    await interaction.response.send_message("✅ Commission embed posted!", ephemeral=True)


@bot.tree.command(name="clearorders", description="Clear all active order sessions")
@app_commands.checks.has_permissions(administrator=True)
async def clearorders(interaction: discord.Interaction):
    commission_flow.active_sessions.clear()
    await interaction.response.send_message("🧹 All active sessions cleared.", ephemeral=True)


# Pass interactions to commission flow
@bot.event
async def on_interaction(interaction: discord.Interaction):
    if interaction.type == discord.InteractionType.component:
        await commission_flow.handle_interaction(interaction)
    elif interaction.type == discord.InteractionType.modal_submit:
        await commission_flow.handle_modal(interaction)


bot.run(TOKEN)
