# 🎮 Fadyn Bot — Roblox UI Commission Bot

A full Discord bot that handles Roblox UI commission orders through a guided DM flow.

---

## 📁 Files

```
fadyn-bot/
├── bot.py              # Main bot entry point
├── commission_flow.py  # All commission logic, views, modals
├── requirements.txt    # Python dependencies
├── .env.example        # Copy this to .env and fill in your values
└── README.md
```

---

## ⚡ Setup

### 1. Install Python
Make sure you have **Python 3.10+** installed.

### 2. Install dependencies
```bash
pip install -r requirements.txt
```

### 3. Create your bot
1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → name it **Fadyn Bot**
3. Go to **Bot** tab → click **Add Bot**
4. Under **Privileged Gateway Intents**, enable:
   - ✅ Server Members Intent
   - ✅ Message Content Intent
5. Copy your **Token**

### 4. Set permissions
When inviting the bot, give it these permissions:
- Send Messages
- Embed Links
- Use Application Commands (Slash Commands)
- Read Message History

OAuth2 URL scope: `bot` + `applications.commands`

### 5. Configure .env
```bash
cp .env.example .env
```
Then open `.env` and fill in:
- `DISCORD_TOKEN` — your bot token
- `COMMISSION_CHANNEL_ID` — the channel where the order embed goes (e.g. #ui-commissions)
- `LOG_CHANNEL_ID` — a private channel where completed orders are logged
- `OWNER_ID` — your Discord user ID (get it by enabling Developer Mode → right-click yourself → Copy ID)

### 6. Enable Developer Mode in Discord
Settings → Advanced → Developer Mode ✅  
This lets you right-click channels/users to copy IDs.

### 7. Run the bot
```bash
python bot.py
```

---

## 🛠️ Slash Commands (Admin Only)

| Command | Description |
|---------|-------------|
| `/setup` | Posts the commission embed in the current channel |
| `/clearorders` | Clears all active commission sessions |

---

## 🔄 How the Flow Works

```
#ui-commissions embed
        ↓
  [Create Order] button
        ↓
  Bot DMs user → "Are you sure?"
        ↓
  Step 1: Name + Project Name
  Step 2: UI Type (Buttons / Frames / Both)
  Step 3: Style (based on UI type)
  Step 4: Elements needed (multi-select)
  Step 5: Design style + Colors/Fonts
  Step 6: References (link/image)
  Step 7: Payment method + Budget
  Step 8: Extra info
  Step 9: Summary → Confirm
        ↓
  Order logged to #log-channel + DM to owner
```

---

## 💡 Tips

- The bot **auto-posts** the embed on startup if `COMMISSION_CHANNEL_ID` is set
- Use `/setup` to re-post the embed manually in any channel
- Orders get an ID like `FDN-0001`, `FDN-0002`, etc.
- Sessions expire after 5 minutes of inactivity per step

---

## 🧩 Customization Ideas

- Add a `orders.json` to persist order history across restarts
- Add ticket channel creation per order (requires more permissions)
- Add a `/orders` command to list pending commissions
- Replace the thumbnail URL in `post_main_embed()` with your actual logo
