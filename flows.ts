import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
  type DMChannel,
  type Client,
  type Message,
  type Guild,
  type TextChannel,
} from "discord.js";
import { config } from "./config.js";
import { getQuestionsForRoles, resolveAnswerLabel, type Question } from "./questions.js";
import { updateSession, getSession, type SavedApplication } from "./data.js";
export type { SavedApplication } from "./data.js";

// ─── Start prompt ─────────────────────────────────────────────────────────────

export async function sendStartPrompt(channel: DMChannel): Promise<Message> {
  // Clean up any old start messages
  try {
    const recent = await channel.messages.fetch({ limit: 50 });
    for (const [, msg] of recent) {
      if (!msg.author.bot) continue;
      const hasStartButton = (msg.components as any[]).some((row: any) =>
        (row.components as any[]).some((c: any) => c.customId === "app:start")
      );
      if (hasStartButton) await msg.delete().catch(() => {});
    }
  } catch {}

  const embed = new EmbedBuilder()
    .setTitle("🎨 Roblox UI Commission Request")
    .setDescription(
      [
        "Thanks for your interest in a UI commission!",
        "",
        "I'll send you a series of questions about your project. **You have 15 minutes per question** — if you go over, your application will be cancelled and you'll need to restart.",
        "",
        "You can cancel at any time by clicking **Cancel** below.",
        "",
        "Ready to get started?",
      ].join("\n")
    )
    .setColor(0x9b59b6);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("app:start").setLabel("Start Commission Request").setStyle(ButtonStyle.Success).setEmoji("📩"),
    new ButtonBuilder().setCustomId("app:cancel").setLabel("Cancel").setStyle(ButtonStyle.Danger).setEmoji("❌")
  );

  return await channel.send({ embeds: [embed], components: [row] });
}

// ─── Generic embed builders ───────────────────────────────────────────────────

export function buildApplicationStartedEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Commission Request Started")
    .setDescription("Please answer the questions below. Use the dropdowns where provided, or type your answer in DMs.")
    .setColor(0x2ecc71);
}

export function buildApplicationCancelledEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Commission Request Cancelled")
    .setDescription("Your request has been cancelled. You can start a new one at any time!")
    .setColor(0xe74c3c);
}

export function buildAnsweredEmbed(question: Question, answer: string, index: number, total: number): EmbedBuilder {
  return new EmbedBuilder()
    .setDescription(`✅ **${index + 1}/${total}. ${question.prompt}**\n\n**Answer:** ${answer}`)
    .setColor(0x2ecc71);
}

export function buildEditButtonRow(questionId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`edit_q:${questionId}`).setLabel("Edit").setStyle(ButtonStyle.Secondary).setEmoji("✏️")
  );
}

export function buildApplicationSentEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("✅ Commission Request Submitted!")
    .setDescription(
      [
        "Your commission request has been received!",
        "",
        "A private ticket has been created for you — check your channels. The team will review your request and get back to you soon.",
      ].join("\n")
    )
    .setColor(0x2ecc71);
}

// ─── Edit modal (inline text edit for a single question) ─────────────────────

export function buildEditModal(question: Question, currentAnswer: string): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId(`edit_modal:${question.id}`)
    .setTitle(question.prompt.length > 45 ? question.prompt.slice(0, 42) + "…" : question.prompt);

  let placeholder = "Type your answer here…";
  let style = TextInputStyle.Paragraph;

  if (question.answerType.kind === "choice") {
    const opts = question.answerType.options.map((o) => o.label).join(", ");
    placeholder = `Choose one: ${opts}`.slice(0, 100);
    style = TextInputStyle.Short;
  } else if (question.answerType.kind === "dropdown") {
    const opts = question.answerType.options.map((o) => o.label).join(", ");
    placeholder = `Choose one: ${opts}`.slice(0, 100);
    style = TextInputStyle.Short;
  }

  const input = new TextInputBuilder()
    .setCustomId("answer")
    .setLabel(question.prompt.slice(0, 45))
    .setStyle(style)
    .setPlaceholder(placeholder)
    .setRequired(true);

  if (currentAnswer) input.setValue(currentAnswer.slice(0, 4000));
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

// ─── Custom-answer modals for specific questions ──────────────────────────────

const CUSTOM_MODAL_META: Record<string, { title: string; label: string; style: TextInputStyle; minLength?: number; maxLength?: number }> = {
  contactMethodOther: { title: "Contact Method",       label: "Platform & handle",               style: TextInputStyle.Short,     maxLength: 200 },
  commissionTypeCustom: { title: "Commission Type",    label: "Describe the UI you need",         style: TextInputStyle.Paragraph, minLength: 20, maxLength: 500 },
  deadlineCustom:     { title: "Specific Deadline",    label: "Target date or deadline",          style: TextInputStyle.Short,     minLength: 5, maxLength: 200 },
  budgetUSD:          { title: "USD Budget",           label: "Amount & payment method",          style: TextInputStyle.Short,     maxLength: 200 },
  assetDetails:       { title: "Your Assets",          label: "Describe & how you'll share them", style: TextInputStyle.Paragraph, maxLength: 500 },
};

export const MODAL_QUESTION_IDS = new Set(Object.keys(CUSTOM_MODAL_META));

export function buildCustomAnswerModal(question: Question): ModalBuilder {
  const meta = CUSTOM_MODAL_META[question.id] ?? {
    title: question.prompt.slice(0, 45),
    label: question.prompt.slice(0, 45),
    style: TextInputStyle.Paragraph,
  };
  const modal = new ModalBuilder()
    .setCustomId(`q_custom_modal:${question.id}`)
    .setTitle(meta.title);
  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel(meta.label.slice(0, 45))
    .setStyle(meta.style)
    .setRequired(true);
  if (meta.minLength) input.setMinLength(meta.minLength);
  if (meta.maxLength) input.setMaxLength(meta.maxLength);
  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  return modal;
}

// ─── Multi-page review edit modal ────────────────────────────────────────────

export function buildReviewEditModal(session: SavedApplication, page: number): ModalBuilder {
  const questions = getQuestionsForRoles(session.roles, session.answers);
  const start = page * 5;
  const slice = questions.slice(start, start + 5);

  const modal = new ModalBuilder()
    .setCustomId(`review_edit_page:${page}`)
    .setTitle(`Edit Answers — Page ${page + 1} of ${Math.ceil(questions.length / 5)}`);

  for (const q of slice) {
    let placeholder = "Type your answer here…";
    let style = TextInputStyle.Paragraph;

    if (q.answerType.kind === "choice") {
      placeholder = q.answerType.options.map((o) => o.label).join(" / ").slice(0, 100);
      style = TextInputStyle.Short;
    } else if (q.answerType.kind === "dropdown") {
      placeholder = q.answerType.options.map((o) => o.label).join(" / ").slice(0, 100);
      style = TextInputStyle.Short;
    }

    const label = q.prompt.length > 45 ? q.prompt.slice(0, 42) + "…" : q.prompt;
    const current = session.answers[q.id] ?? "";

    const input = new TextInputBuilder()
      .setCustomId(`review_field:${q.id}`)
      .setLabel(label)
      .setStyle(style)
      .setPlaceholder(placeholder)
      .setRequired(false);

    if (current) input.setValue(current.slice(0, 4000));
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }

  return modal;
}

// ─── Ask a question ───────────────────────────────────────────────────────────

export async function askQuestion(
  channel: DMChannel,
  question: Question,
  index: number,
  total: number,
  session?: SavedApplication
): Promise<Message> {
  if (session) {
    session.questionStartedAt = Date.now();
    updateSession(session);
  }

  const embed = new EmbedBuilder()
    .setTitle("🎨 UI Commission Request")
    .setDescription(`**${index + 1}/${total}.** ${question.prompt}`)
    .setColor(0x9b59b6)
    .setFooter({ text: getHint(question) });

  const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  if (question.answerType.kind === "choice") {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      question.answerType.options.map((opt) => {
        const btn = new ButtonBuilder()
          .setCustomId(`q_choice:${question.id}:${opt.value}`)
          .setLabel(opt.label)
          .setStyle(ButtonStyle.Secondary);
        if (opt.emoji) btn.setEmoji(opt.emoji);
        return btn;
      })
    );
    components.push(row);
  } else if (question.answerType.kind === "dropdown") {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`q_select:${question.id}`)
      .setPlaceholder("Select an option…")
      .addOptions(question.answerType.options);
    if (question.answerType.minValues !== undefined) select.setMinValues(question.answerType.minValues);
    if (question.answerType.maxValues !== undefined) select.setMaxValues(question.answerType.maxValues);
    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  }

  return await channel.send({ embeds: [embed], components });
}

function getHint(question: Question): string {
  const type = question.answerType;
  switch (type.kind) {
    case "text":     return type.optional ? "↩️ Type your answer (or type N/A to skip)" : "↩️ Type your answer in this DM";
    case "image":    return "↩️ Send a message with an image attached";
    case "media":    return "↩️ Attach images and/or paste links";
    case "link":     return "↩️ Paste a URL (https://...)";
    case "choice":   return "Click a button above to answer";
    case "dropdown": return "Select from the dropdown above to answer";
  }
}

// ─── Review embed ─────────────────────────────────────────────────────────────

export async function sendReviewEmbed(channel: DMChannel, session: SavedApplication, showEditButton: boolean): Promise<Message> {
  const questions = getQuestionsForRoles(session.roles, session.answers);
  const lines = questions.map((q, i) => {
    const raw = session.answers[q.id] || "";
    const answer = raw ? resolveAnswerLabel(q, raw) : "*No answer*";
    return `**${i + 1}.** ${q.prompt}\n> ${answer}`;
  });
  const description = lines.join("\n\n");
  const truncated = description.length > 4000 ? description.slice(0, 3997) + "..." : description;

  const embed = new EmbedBuilder()
    .setTitle("📋 Review Your Commission Request")
    .setDescription(truncated)
    .setColor(0x9b59b6)
    .setFooter({ text: "Check your answers before submitting" });

  const buttons: ButtonBuilder[] = [
    new ButtonBuilder().setCustomId("review:submit").setLabel("Submit Request").setStyle(ButtonStyle.Success).setEmoji("📩"),
    new ButtonBuilder().setCustomId("review:cancel").setLabel("Cancel").setStyle(ButtonStyle.Danger).setEmoji("🗑️"),
  ];

  if (showEditButton) {
    buttons.push(new ButtonBuilder().setCustomId("review:edit").setLabel("Edit").setStyle(ButtonStyle.Primary).setEmoji("✏️"));
  }

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
  return await channel.send({ embeds: [embed], components: [row] });
}

export async function sendReviewEditSelect(channel: DMChannel, session: SavedApplication): Promise<void> {
  const questions = getQuestionsForRoles(session.roles, session.answers);
  const options = questions.map((q, i) => ({
    label: `${i + 1}. ${q.prompt.slice(0, 90)}`,
    value: q.id,
    description: (session.answers[q.id] ?? "No answer").slice(0, 100),
  }));
  const select = new StringSelectMenuBuilder()
    .setCustomId("review_edit_select")
    .setPlaceholder("Select a question to edit…")
    .addOptions(options.slice(0, 25));
  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  const embed = new EmbedBuilder().setDescription("Which question would you like to edit?").setColor(0x9b59b6);
  await channel.send({ embeds: [embed], components: [row] });
}

// ─── Portfolio (media collection) ─────────────────────────────────────────────

export async function sendPortfolioAddMorePrompt(channel: DMChannel, count: number, maxCount = 5): Promise<Message> {
  const embed = new EmbedBuilder()
    .setTitle(`✅ Reference ${count}/${maxCount} Added!`)
    .setDescription(
      count >= maxCount
        ? "You've reached the maximum of 5 references. Moving to the next question…"
        : "Send another image or link to add more, or click **Done** when you're finished."
    )
    .setColor(0x2ecc71);

  if (count >= maxCount) return await channel.send({ embeds: [embed] });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("portfolio:done").setLabel("Done Adding References").setStyle(ButtonStyle.Success).setEmoji("✅")
  );
  return await channel.send({ embeds: [embed], components: [row] });
}

// ─── Submit — create ticket channel ──────────────────────────────────────────

export async function submitApplication(session: SavedApplication, client: Client): Promise<void> {
  session.step = "submitted";
  updateSession(session);

  const guild = client.guilds.cache.first();
  if (!guild) return;

  const questions = getQuestionsForRoles(session.roles, session.answers);
  const now = Math.floor(Date.now() / 1000);

  // ── Find or fall back to the ticket category ──────────────────────────────
  const categoryId = config.ticketCategoryId;
  const category = categoryId ? guild.channels.cache.get(categoryId) : null;

  // ── Create private ticket channel ─────────────────────────────────────────
  const applicant = await guild.members.fetch(session.userId).catch(() => null);
  const channelName = `commission-${applicant?.user.username ?? session.userId}`.slice(0, 100).toLowerCase().replace(/[^a-z0-9-]/g, "-");

  const ticketChannel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category?.id ?? undefined,
    permissionOverwrites: [
      // Deny @everyone
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      // Allow the applicant
      {
        id: session.userId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      // Allow admins (anyone with ManageGuild)
      ...(guild.roles.cache
        .filter((r) => r.permissions.has(PermissionFlagsBits.ManageGuild))
        .map((r) => ({
          id: r.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.AttachFiles,
          ],
        }))),
    ],
  }).catch(() => null);

  if (!ticketChannel || ticketChannel.type !== ChannelType.GuildText) return;

  // ── Build the application embed ───────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setTitle("🎨 New UI Commission Request")
    .setColor(0x9b59b6)
    .setTimestamp();

  embed.addFields({ name: "Applicant", value: `<@${session.userId}>`, inline: true });
  embed.addFields({ name: "Submitted", value: `<t:${now}:F>`, inline: true });

  for (const q of questions) {
    const raw = session.answers[q.id] ?? "";
    const display = raw ? resolveAnswerLabel(q, raw) : "*No answer*";
    embed.addFields({
      name: q.prompt.length > 256 ? q.prompt.slice(0, 253) + "…" : q.prompt,
      value: display.length > 1024 ? display.slice(0, 1021) + "…" : display,
    });
  }

  // ── Close button ──────────────────────────────────────────────────────────
  const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:close:${session.userId}`)
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔒")
  );

  const ticketMsg = await ticketChannel.send({
    content: `<@${session.userId}> Your commission request has been received! The team will review it and get back to you here.`,
    embeds: [embed],
    components: [closeRow],
  }).catch(() => null);

  if (ticketMsg) {
    session.logMessageId = ticketMsg.id;
    session.logChannelId = ticketChannel.id;
    updateSession(session);
  }

  // ── Also ping the log channel if configured ───────────────────────────────
  if (config.logChannelId) {
    const logChannel = await guild.channels.fetch(config.logChannelId).catch(() => null);
    if (logChannel && logChannel.type === ChannelType.GuildText) {
      const summaryEmbed = new EmbedBuilder()
        .setTitle("📋 New Commission Request")
        .setDescription(
          [
            `**Applicant:** <@${session.userId}>`,
            `**Ticket:** <#${ticketChannel.id}>`,
            `**Submitted:** <t:${now}:F>`,
          ].join("\n")
        )
        .setColor(0x9b59b6)
        .setTimestamp();
      await logChannel.send({ content: `<@${config.ownerId}>`, embeds: [summaryEmbed] }).catch(() => {});
    }
  }
}

// ─── Resume after bot restart ─────────────────────────────────────────────────

export async function resumeStep(channel: DMChannel, session: SavedApplication): Promise<void> {
  const fresh = await getSession(session.userId);
  const s = fresh ?? session;

  switch (s.step) {
    case "pending_start":
      await sendStartPrompt(channel);
      break;
    case "answering": {
      const questions = getQuestionsForRoles(s.roles, s.answers);
      const current = questions[s.currentQuestionIndex];
      if (current) {
        const msg = await askQuestion(channel, current, s.currentQuestionIndex, questions.length, s);
        if (!s.questionMessageIds) s.questionMessageIds = {};
        s.questionMessageIds[current.id] = msg.id;
        updateSession(s);
      }
      break;
    }
    case "review":
      await sendReviewEmbed(channel, s, !s.finalEditUsed);
      break;
    case "editing_from_review": {
      if (s.editingQuestionId) {
        const questions = getQuestionsForRoles(s.roles, s.answers);
        const qIndex = questions.findIndex((q) => q.id === s.editingQuestionId);
        if (qIndex >= 0) {
          const msg = await askQuestion(channel, questions[qIndex]!, qIndex, questions.length, s);
          if (!s.questionMessageIds) s.questionMessageIds = {};
          s.questionMessageIds[questions[qIndex]!.id] = msg.id;
          updateSession(s);
        }
      }
      break;
    }
  }
}

// ─── Stub exports kept for handler compatibility ──────────────────────────────
// (Handlers import these — they are no-ops in the commission flow.)

export async function sendNicknameSelectionDM(_channel: DMChannel, _robloxUsername: string, _robloxDisplayName: string): Promise<void> {}

export async function sendVerificationChannelMessage(channel: TextChannel): Promise<Message> {
  return channel.send({ content: "Verification is not used in the commission flow." });
}

export function buildRevisionEditModal(session: SavedApplication, flaggedQuestions: Question[]): ModalBuilder {
  // Minimal implementation — revision flow is unused for commissions.
  const modal = new ModalBuilder().setCustomId("revision_edit_modal").setTitle("Fix Flagged Answers");
  const slice = flaggedQuestions.slice(0, 5);
  for (const q of slice) {
    const label = q.prompt.length > 45 ? q.prompt.slice(0, 42) + "…" : q.prompt;
    const input = new TextInputBuilder()
      .setCustomId(`revision_field:${q.id}`)
      .setLabel(label)
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("Type your updated answer here…")
      .setRequired(true);
    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
  }
  return modal;
}

export async function sendReviewNeedsRevisionEmbed(
  channel: DMChannel,
  session: SavedApplication,
  issues: string,
  showSubmit: boolean
): Promise<Message> {
  const embed = new EmbedBuilder()
    .setTitle("⚠️ Request Needs Revision")
    .setDescription(`Please review the following:\n\n${issues}`)
    .setColor(0xe67e22);
  const buttons: ButtonBuilder[] = [
    new ButtonBuilder().setCustomId("review:edit_revision").setLabel("Edit").setStyle(ButtonStyle.Primary).setEmoji("✏️"),
  ];
  if (showSubmit) {
    buttons.push(new ButtonBuilder().setCustomId("review:submit").setLabel("Submit").setStyle(ButtonStyle.Success).setEmoji("📩"));
  }
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
  return await channel.send({ embeds: [embed], components: [row] });
}

// ─── Role-selection stubs (not used in commission flow) ───────────────────────

export async function sendRoleSelect1(_channel: DMChannel, _robloxUsername?: string, _guild?: Guild): Promise<void> {}
export async function sendRoleSelect2(_channel: DMChannel, _excludeRoles: string[], _guild?: Guild): Promise<void> {}
export async function sendRoleConfirm(_channel: DMChannel, _selectedRole: string): Promise<void> {}
export function buildRoleConfirmPayload(_roleKey: string): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  return { embeds: [], components: [] };
}
export function buildRoleSelectedPayload(_roleKey: string): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  return { embeds: [], components: [] };
}
export async function buildRoleSelect1Payload(_robloxUsername?: string, _guild?: Guild): Promise<{ embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } | null> {
  return null;
}

// Roblox verification stubs
export async function sendUsernamePrompt(_channel: DMChannel): Promise<void> {}
export async function sendUsernameConfirm(_channel: DMChannel, _username: string): Promise<void> {}
export async function sendGroupJoinPrompt(_channel: DMChannel, _username: string): Promise<Message> {
  return _channel.send({ content: "Not used." });
}
export async function sendBioVerification(_channel: DMChannel, _code: string, _username: string): Promise<Message> {
  return _channel.send({ content: "Not used." });
}
export async function sendPaymentExplanationEmbed(_channel: DMChannel): Promise<Message> {
  return _channel.send({ content: "Not used." });
}
