import asyncio
import random
import sys
import discord
from discord.ext import commands
from discord import app_commands
import os
from dotenv import load_dotenv
from commission_flow import CommissionFlow
from storage import init_storage

load_dotenv()

TOKEN                 = os.getenv("DISCORD_TOKEN")
COMMISSION_CHANNEL_ID = int(os.getenv("COMMISSION_CHANNEL_ID", 0))
LOG_CHANNEL_ID        = int(os.getenv("LOG_CHANNEL_ID", 0))
OWNER_ID              = int(os.getenv("OWNER_ID", 0))

intents = discord.Intents.default()
intents.message_content = True
intents.members = True
intents.dm_messages = True

bot = commands.Bot(command_prefix="!", intents=intents)
commission_flow = CommissionFlow(bot, LOG_CHANNEL_ID, OWNER_ID)


@bot.event
async def on_ready():
    print(f"✅ Fadyn Bot is online as {bot.user}")
    await init_storage()
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
    for session in commission_flow.sessions.values():
        commission_flow._cancel_poll(session)
    commission_flow.sessions.clear()
    commission_flow.pending.clear()
    await interaction.response.send_message("🧹 All sessions cleared.", ephemeral=True)


@bot.tree.command(
    name="updatelogs",
    description="Re-format all old commission log embeds in the log channel to the new style",
)
@app_commands.checks.has_permissions(administrator=True)
async def updatelogs(interaction: discord.Interaction):
    await interaction.response.defer(ephemeral=True)

    if not LOG_CHANNEL_ID:
        await interaction.followup.send("⚠️ No log channel configured (`LOG_CHANNEL_ID` not set).", ephemeral=True)
        return

    channel = bot.get_channel(LOG_CHANNEL_ID)
    if channel is None:
        await interaction.followup.send("⚠️ Couldn't find the log channel — make sure the bot has access to it.", ephemeral=True)
        return

    await interaction.followup.send("🔄 Scanning log channel — this may take a moment...", ephemeral=True)

    updated, skipped = await commission_flow.rebuild_log_embeds(channel)

    await interaction.followup.send(
        f"✅ Done!\n"
        f"• **{updated}** order log(s) updated to the new format\n"
        f"• **{skipped}** message(s) skipped (already up to date or not order logs)",
        ephemeral=True,
    )


MAX_RETRIES     = 10
BASE_DELAY      = 5    # seconds
MAX_DELAY       = 300  # seconds (5 minutes)

for attempt in range(1, MAX_RETRIES + 1):
    try:
        bot.run(TOKEN)
        break  # clean exit — no retry needed
    except discord.errors.HTTPException as e:
        if e.status == 429:
            delay = min(BASE_DELAY * (2 ** (attempt - 1)), MAX_DELAY)
            jitter = random.uniform(0, delay * 0.1)
            wait = delay + jitter
            print(
                f"⚠️  Rate limited by Discord (429) on attempt {attempt}/{MAX_RETRIES}. "
                f"Retrying in {wait:.1f}s..."
            )
            if attempt == MAX_RETRIES:
                print("❌ Max retries reached. Exiting.")
                sys.exit(1)
            asyncio.get_event_loop().run_until_complete(asyncio.sleep(wait))
        else:
            print(f"❌ HTTP error {e.status}: {e}. Not retrying.")
            sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}. Not retrying.")
        sys.exit(1)
