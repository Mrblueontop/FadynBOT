import discord
from discord.ext import commands
from discord import app_commands
import os
from dotenv import load_dotenv
from commission_flow import CommissionFlow

load_dotenv()

TOKEN               = os.getenv("DISCORD_TOKEN")
COMMISSION_CHANNEL_ID = int(os.getenv("COMMISSION_CHANNEL_ID", 0))
LOG_CHANNEL_ID      = int(os.getenv("LOG_CHANNEL_ID", 0))
OWNER_ID            = int(os.getenv("OWNER_ID", 0))

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
    if COMMISSION_CHANNEL_ID:
        channel = bot.get_channel(COMMISSION_CHANNEL_ID)
        if channel:
            await commission_flow.post_main_embed(channel)


@bot.event
async def on_message(message: discord.Message):
    if message.author.bot:
        return
    # Only handle DM replies — ignore everything in servers
    if isinstance(message.channel, discord.DMChannel):
        await commission_flow.handle_dm_reply(message)
    await bot.process_commands(message)


@bot.event
async def on_interaction(interaction: discord.Interaction):
    if interaction.type == discord.InteractionType.component:
        await commission_flow.handle_interaction(interaction)


@bot.tree.command(name="setup", description="Post the commissions embed in this channel")
@app_commands.checks.has_permissions(administrator=True)
async def setup(interaction: discord.Interaction):
    await commission_flow.post_main_embed(interaction.channel)
    await interaction.response.send_message("✅ Commission embed posted!", ephemeral=True)


@bot.tree.command(name="clearorders", description="Clear all active order sessions")
@app_commands.checks.has_permissions(administrator=True)
async def clearorders(interaction: discord.Interaction):
    commission_flow.active_sessions.clear()
    commission_flow.pending_users.clear()
    commission_flow.awaiting_reply.clear()
    await interaction.response.send_message("🧹 All sessions cleared.", ephemeral=True)


bot.run(TOKEN)
