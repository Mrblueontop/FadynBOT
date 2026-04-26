import { createServer } from "http";
import {
  Client,
  GatewayIntentBits,
  Partials,
  Events,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  type Interaction,
  type ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { handleButton } from "./button.js";
import { handleMessage } from "./message.js";
import { handleModal } from "./modal.js";
import { handleSelectMenu } from "./selectMenu.js";
import { getSession, clearSession, getAllApplications, updateSession } from "./applicationSession.js";
import { buildApplicationEmbed } from "./applicationEmbed.js";
import { trackRecruitmentMessage, getTrackedMessages, untrackRecruitmentMessage } from "./recruitmentTracker.js";
import { getQuestionsForRoles } from "./questions.js";
import { config } from "./config.js";
import { askQuestion, sendReviewEmbed, submitApplication } from "./flows.js";

// ─────────────────────────────────────────────────────────────────────────────
// Slash command definitions
// ─────────────────────────────────────────────────────────────────────────────

const commands = [
  // Send the commission application embed to a channel
  new SlashCommandBuilder()
    .setName("sendmessage")
    .setDescription("Send the commission application embed to a channel.")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to send the embed to (defaults to APPLICATION_CHANNEL_ID)")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Remove an active application/commission session for a user
  new SlashCommandBuilder()
    .setName("removeapplication")
    .setDescription("Clear a user's active commission application so they can start fresh.")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The user whose application to remove").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // Close a commission ticket channel
  new SlashCommandBuilder()
    .setName("closeticket")
    .setDescription("Close and delete the current commission ticket channel.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

  // View a user's current application answers
  new SlashCommandBuilder()
    .setName("viewapplication")
    .setDescription("View the current in-progress application answers for a user.")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("The user to view").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  // List all active commission sessions
  new SlashCommandBuilder()
    .setName("listapplications")
    .setDescription("List all users who currently have an active commission application in progress.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map((cmd) => cmd.toJSON());

// ─────────────────────────────────────────────────────────────────────────────
// Register slash commands with Discord
// ─────────────────────────────────────────────────────────────────────────────

async function registerCommands(token: string, clientId: string, guildId?: string): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`[commands] Registered ${commands.length} guild commands for guild ${guildId}.`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log(`[commands] Registered ${commands.length} global commands.`);
    }
  } catch (err) {
    console.error("[commands] Failed to register commands:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Command handler
// ─────────────────────────────────────────────────────────────────────────────

async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const { commandName } = interaction;

  // ── /sendmessage ──────────────────────────────────────────────────────────
  if (commandName === "sendmessage") {
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "This command must be used in a server.", ephemeral: true });
      return;
    }

    let targetChannel = interaction.options.getChannel("channel");

    if (!targetChannel) {
      if (config.applicationChannelId) {
        const fetched = await guild.channels.fetch(config.applicationChannelId).catch(() => null);
        targetChannel = fetched as any;
      } else {
        targetChannel = interaction.channel as any;
      }
    }

    if (!targetChannel || targetChannel.type !== ChannelType.GuildText) {
      await interaction.reply({
        content: "Please specify a valid text channel, or set `APPLICATION_CHANNEL_ID` in your environment.",
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const payload = await buildApplicationEmbed(guild);
    const msg = await (targetChannel as any).send(payload);
    trackRecruitmentMessage(msg);

    await interaction.editReply({ content: `Commission application message sent to <#${targetChannel.id}>!` });
    return;
  }

  // ── /removeapplication ────────────────────────────────────────────────────
  if (commandName === "removeapplication") {
    const target = interaction.options.getUser("user", true);
    const session = getSession(target.id);

    if (!session) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(`<@${target.id}> doesn't have an active commission application.`)
            .setColor(0xe67e22),
        ],
        ephemeral: true,
      });
      return;
    }

    clearSession(target.id);

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Application Removed")
          .setDescription(
            `<@${target.id}>'s commission application has been cleared.\n\nThey can now start a new one from the server.`
          )
          .setColor(0x2ecc71),
      ],
      ephemeral: true,
    });
    return;
  }

  // ── /closeticket ──────────────────────────────────────────────────────────
  if (commandName === "closeticket") {
    const channel = interaction.channel;

    if (!channel || channel.type !== ChannelType.GuildText) {
      await interaction.reply({ content: "This command must be used inside a ticket channel.", ephemeral: true });
      return;
    }

    // Confirm before deleting
    const confirmEmbed = new EmbedBuilder()
      .setTitle("🔒 Close Ticket")
      .setDescription(
        `Are you sure you want to close and delete **#${(channel as any).name}**?\n\nThis action cannot be undone.`
      )
      .setColor(0xe74c3c);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket:close:confirm:${channel.id}`)
        .setLabel("Yes, close it")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒"),
      new ButtonBuilder()
        .setCustomId("ticket:close:cancel")
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("↩️")
    );

    await interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });
    return;
  }

  // ── /viewapplication ──────────────────────────────────────────────────────
  if (commandName === "viewapplication") {
    const target = interaction.options.getUser("user", true);
    const session = getSession(target.id);

    if (!session) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(`<@${target.id}> doesn't have an active commission application.`)
            .setColor(0xe67e22),
        ],
        ephemeral: true,
      });
      return;
    }

    const questions = getQuestionsForRoles(session.roles);
    const answeredCount = Object.keys(session.answers).length;

    const embed = new EmbedBuilder()
      .setTitle(`Commission Application — ${target.username}`)
      .setDescription(
        `**Step:** \`${session.step}\`\n**Progress:** ${answeredCount}/${questions.length} questions answered\n**Started:** <t:${Math.floor(session.startedAt / 1000)}:R>`
      )
      .setColor(0x9b59b6)
      .setThumbnail(target.displayAvatarURL());

    for (const q of questions) {
      const answer = session.answers[q.id];
      if (answer) {
        embed.addFields({
          name: q.prompt.length > 256 ? q.prompt.slice(0, 253) + "…" : q.prompt,
          value: answer.length > 1024 ? answer.slice(0, 1021) + "…" : answer,
        });
      }
    }

    if (answeredCount === 0) {
      embed.addFields({ name: "Answers", value: "*No questions answered yet.*" });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // ── /listapplications ─────────────────────────────────────────────────────
  if (commandName === "listapplications") {
    const all = getAllApplications().filter((a) => a.step !== "submitted");

    if (all.length === 0) {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription("No active commission applications right now.")
            .setColor(0x95a5a6),
        ],
        ephemeral: true,
      });
      return;
    }

    const lines = all.map((a) => {
      const questions = getQuestionsForRoles(a.roles);
      const answered = Object.keys(a.answers).length;
      const startedTs = Math.floor(a.startedAt / 1000);
      return `• <@${a.userId}> — \`${a.step}\` — ${answered}/${questions.length} answered — started <t:${startedTs}:R>`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`Active Commission Applications (${all.length})`)
      .setDescription(lines.join("\n"))
      .setColor(0x9b59b6);

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error handlers
// ─────────────────────────────────────────────────────────────────────────────

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

// ─────────────────────────────────────────────────────────────────────────────
// Bot client
// ─────────────────────────────────────────────────────────────────────────────

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error("DISCORD_BOT_TOKEN is not set.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ─────────────────────────────────────────────────────────────────────────────
// Ready
// ─────────────────────────────────────────────────────────────────────────────

client.once(Events.ClientReady, async (c) => {
  console.log(`Commission bot ready! Logged in as ${c.user.tag}`);

  const clientId = process.env.DISCORD_CLIENT_ID;
  if (clientId) {
    await registerCommands(token!, clientId, process.env.DISCORD_GUILD_ID);
  }

  // ── Resume in-progress applications after restart ─────────────────────────
  const RESTART_TIMEOUT_MS = 30 * 60 * 1000;

  for (const app of getAllApplications()) {
    if (app.step === "submitted") continue;

    try {
      const user = await c.users.fetch(app.userId).catch(() => null);
      if (!user) continue;
      const dm = await user.createDM().catch(() => null);
      if (!dm) continue;

      const elapsed = app.questionStartedAt ? Date.now() - app.questionStartedAt : 0;

      if (
        (app.step === "answering" || app.step === "editing_from_review") &&
        app.questionStartedAt &&
        elapsed > RESTART_TIMEOUT_MS
      ) {
        clearSession(app.userId);
        await dm.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("⏰ Application Timed Out")
              .setDescription(
                "Your commission application was paused while the bot was offline, and more than **30 minutes** passed.\n\nYour session has expired — you can start a fresh application anytime from the server!"
              )
              .setColor(0xe74c3c),
          ],
        }).catch(() => {});
        console.log(`[startup] Application for ${app.userId} timed out.`);
        continue;
      }

      if (app.step === "answering" || app.step === "editing_from_review") {
        const questions = getQuestionsForRoles(app.roles);
        const isEditing = !!app.editingQuestionId;
        const currentIndex = isEditing
          ? questions.findIndex((q) => q.id === app.editingQuestionId)
          : app.currentQuestionIndex;
        const safeIndex = currentIndex >= 0 ? currentIndex : 0;
        const currentQ = questions[safeIndex];

        if (!currentQ) {
          app.step = "review";
          updateSession(app);
          const reviewMsg = await sendReviewEmbed(dm, app, !app.finalEditUsed).catch(() => null);
          if (reviewMsg) { app.reviewMessageId = reviewMsg.id; updateSession(app); }
        } else {
          await dm.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("⚡ We're Back Online!")
                .setDescription(
                  "Sorry for the interruption — your commission application is still saved! I'm re-sending your current question below."
                )
                .setColor(0x9b59b6),
            ],
          }).catch(() => {});

          const msg = await askQuestion(dm, currentQ, safeIndex, questions.length).catch(() => null);
          if (msg) {
            if (!app.questionMessageIds) app.questionMessageIds = {};
            app.questionMessageIds[currentQ.id] = msg.id;
            updateSession(app);
          }
        }
        console.log(`[startup] Resumed application for ${app.userId} at question ${safeIndex}.`);
      }
    } catch (err) {
      console.error(`[startup] Recovery error for ${app.userId}:`, err);
    }
  }

  // ── Re-track recruitment messages ─────────────────────────────────────────
  // (kept for compatibility if you use persistedTrackedEntries in your db)
  console.log("[startup] Commission bot fully initialised.");
});

// ─────────────────────────────────────────────────────────────────────────────
// Interactions
// ─────────────────────────────────────────────────────────────────────────────

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  try {
    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
    } else if (interaction.isButton()) {
      await handleButton(interaction);
    } else if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModal(interaction);
    }
  } catch (err) {
    console.error("Interaction error:", err);
    try {
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: "Something went wrong. Please try again.", ephemeral: true });
      }
    } catch {}
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Messages (DM application flow)
// ─────────────────────────────────────────────────────────────────────────────

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;

  console.log(
    `[MSG] ${message.author.tag} (${message.author.id}) in ${
      message.channel.type === ChannelType.DM ? "DM" : "guild"
    }: ${message.content.slice(0, 80)}`
  );

  try {
    await handleMessage(message);
  } catch (err) {
    console.error("Message handler error:", err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Health check server
// ─────────────────────────────────────────────────────────────────────────────

const port = process.env.PORT ?? 3000;
createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("commission bot is running");
}).listen(port, () => {
  console.log(`Health server listening on port ${port}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────────────────────

client.login(token);
