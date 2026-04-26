/**
 * flows.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Core flow helpers for FadynBot:
 *   - sendStartPrompt            DM the "start" prompt with role selector
 *   - askQuestion                Send a single question message to DM
 *   - updateQuestionToAnswered   Edit an answered question in-place
 *   - sendReviewEmbed            Build + send the full review embed (with AI price)
 *   - sendReviewEditSelect       Dropdown to pick which answer to edit
 *   - submitApplication          Post the order to the log channel + open ticket
 *   - buildCustomAnswerModal     Text-input modal for a question
 *   - buildUiElementsModalPage1 / Page2
 *   - buildUiElementsAfterAnswerRow
 *   - buildCloseConfirmPayload
 *   - buildApplicationCancelledEmbed
 *   - buildApplicationSentEmbed
 *   - sendPortfolioAddMorePrompt
 *   - MODAL_QUESTION_IDS
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  type DMChannel,
  type TextChannel,
  type Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Message,
  type MessagePayload,
  type MessageCreateOptions,
} from "discord.js";

import { type SavedApplication, updateSession, clearSession, storeSubmission } from "./data.js";
import { getQuestionsForRoles, type Question, resolveAnswerLabel } from "./questions.js";
import { config } from "./config.js";
import { calculatePrice, buildPriceEmbedFields } from "./pricing.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Question IDs that must always be answered via a modal (not a raw DM reply). */
export const MODAL_QUESTION_IDS = new Set<string>([
  // add any IDs here that you want to force through a modal
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AnyChannel = DMChannel | TextChannel;

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// ─── Start prompt ─────────────────────────────────────────────────────────────

/**
 * Sends the opening "Are you ready?" DM with Start / Cancel buttons.
 */
export async function sendStartPrompt(dm: DMChannel): Promise<Message> {
  const embed = new EmbedBuilder()
    .setTitle("👋 Commission Request")
    .setDescription(
      [
        "Hey! Thanks for reaching out about a UI commission.",
        "",
        "Before we begin, make sure you have the following ready:",
        "• **A project description** — what your game does",
        "• **Reference images or links** — any visual style you like",
        "• **A rough budget** in mind",
        "",
        "The form takes about **2–3 minutes** to complete.",
        "You can type `cancel` at any time to stop.",
      ].join("\n")
    )
    .setColor(0x9b59b6)
    .setFooter({ text: "Hit Start when you're ready!" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("app:start")
      .setLabel("Start Request")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🚀"),
    new ButtonBuilder()
      .setCustomId("app:cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✖️")
  );

  return dm.send({ embeds: [embed], components: [row] });
}

// ─── Ask a question ───────────────────────────────────────────────────────────

/**
 * Sends a question message to the DM channel and returns the sent Message.
 * Handles all answer types: text, choice (buttons), dropdown, image, media, link.
 */
export async function askQuestion(
  channel: AnyChannel,
  q: Question,
  index: number,
  total: number,
  session?: SavedApplication
): Promise<Message> {
  const embed = new EmbedBuilder()
    .setDescription(q.prompt)
    .setColor(0x9b59b6)
    .setFooter({ text: `Question ${index + 1} of ${total}` });

  const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

  const kind = q.answerType.kind;

  // ── Choice (buttons) ──────────────────────────────────────────────────────
  if (kind === "choice") {
    const opts = q.answerType.options;
    const chunks = chunkArray(opts, 5);
    for (const chunk of chunks) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      for (const opt of chunk) {
        const btn = new ButtonBuilder()
          .setCustomId(`q_choice:${q.id}:${opt.value}`)
          .setLabel(opt.label)
          .setStyle(ButtonStyle.Primary);
        if (opt.emoji) btn.setEmoji(opt.emoji);
        row.addComponents(btn);
      }
      components.push(row as any);
    }
  }

  // ── Dropdown ──────────────────────────────────────────────────────────────
  if (kind === "dropdown") {
    const select = new StringSelectMenuBuilder()
      .setCustomId(`q_select:${q.id}`)
      .setPlaceholder("Choose an option…")
      .setMinValues(q.answerType.minValues ?? 1)
      .setMaxValues(q.answerType.maxValues ?? 1);

    for (const opt of q.answerType.options) {
      const o = new StringSelectMenuOptionBuilder().setLabel(opt.label).setValue(opt.value);
      if (opt.description) o.setDescription(opt.description);
      select.addOptions(o);
    }

    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select) as any);
  }

  // ── Image / media: show an "Upload or paste link" note ───────────────────
  if (kind === "image" || kind === "media") {
    embed.addFields({
      name: "📎 How to answer",
      value: "Upload an image **or** paste a direct image URL as a reply to this message.",
      inline: false,
    });
  }

  // ── Portfolio done button ─────────────────────────────────────────────────
  if (kind === "text" && (q.answerType as any).acceptMedia) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("portfolio:done")
        .setLabel("Done — Continue")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅")
    );
    components.push(row as any);
  }

  return channel.send({ embeds: [embed], components: components as any });
}

// ─── Update question to answered ──────────────────────────────────────────────

/**
 * Edits a question message in-place to show the confirmed answer and remove
 * interactive components.
 */
export async function updateQuestionToAnswered(
  channel: AnyChannel,
  messageId: string,
  q: Question,
  answer: string,
  index: number,
  total: number
): Promise<void> {
  try {
    const msg = await channel.messages.fetch(messageId);
    const displayAnswer = truncate(resolveAnswerLabel(q, answer), 1024);

    const embed = new EmbedBuilder()
      .setDescription(q.prompt)
      .setColor(0x2ecc71) // green = answered
      .addFields({ name: "✅ Your answer", value: displayAnswer, inline: false })
      .setFooter({ text: `Question ${index + 1} of ${total} — answered` });

    await msg.edit({ embeds: [embed], components: [] });
  } catch {
    // Message may have been deleted or is too old — silently skip
  }
}

// ─── Portfolio "add more" prompt ──────────────────────────────────────────────

export async function sendPortfolioAddMorePrompt(
  channel: AnyChannel,
  currentCount: number
): Promise<void> {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("portfolio:done")
      .setLabel(`Done (${currentCount} uploaded)`)
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅")
  );

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setDescription(
          `Got it! **${currentCount}** item(s) uploaded so far.\nSend more or click **Done** to continue.`
        )
        .setColor(0x9b59b6),
    ],
    components: [row],
  });
}

// ─── Review embed ─────────────────────────────────────────────────────────────

/**
 * Builds and sends the final review embed.
 * Calls the Groq API to calculate an estimated price and appends it.
 */
export async function sendReviewEmbed(
  channel: AnyChannel,
  session: SavedApplication,
  showEditButton: boolean
): Promise<Message> {
  const questions = getQuestionsForRoles(session.roles, session.answers);

  const embed = new EmbedBuilder()
    .setTitle("📋 Commission Request — Review")
    .setDescription(
      "Here's a summary of your request. Check everything looks correct, then hit **Submit**."
    )
    .setColor(0x9b59b6)
    .setTimestamp();

  // ── Answer fields ─────────────────────────────────────────────────────────
  for (const q of questions) {
    const raw = session.answers[q.id] ?? "";
    if (!raw) continue;
    const label = q.prompt.split("\n")[0]?.replace(/📝\s*\*\*/, "").replace(/\*\*/, "").trim() ?? q.id;
    const display = truncate(resolveAnswerLabel(q, raw), 1024);
    embed.addFields({ name: label, value: display || "—", inline: false });
  }

  // ── AI price estimate ─────────────────────────────────────────────────────
  try {
    const estimate = await calculatePrice(session.answers);
    const priceFields = buildPriceEmbedFields(estimate, session.answers);
    embed.addFields(...priceFields);
  } catch (err) {
    console.error("[flows] Price calculation failed:", err);
    embed.addFields({
      name: "💰 Estimated Price",
      value: "Price will be confirmed by the designer.",
      inline: false,
    });
  }

  // ── Buttons ───────────────────────────────────────────────────────────────
  const submitBtn = new ButtonBuilder()
    .setCustomId("review:submit")
    .setLabel("Submit Request")
    .setStyle(ButtonStyle.Success)
    .setEmoji("📨");

  const cancelBtn = new ButtonBuilder()
    .setCustomId("review:cancel")
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("✖️");

  const editBtn = new ButtonBuilder()
    .setCustomId("review:edit")
    .setLabel("Edit Answers")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("✏️");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    submitBtn,
    ...(showEditButton ? [editBtn] : []),
    cancelBtn
  );

  return channel.send({ embeds: [embed], components: [row] });
}

// ─── Review edit select ───────────────────────────────────────────────────────

/**
 * Sends a dropdown so the user can pick which question to edit.
 */
export async function sendReviewEditSelect(
  channel: AnyChannel,
  session: SavedApplication
): Promise<void> {
  const questions = getQuestionsForRoles(session.roles, session.answers);

  const select = new StringSelectMenuBuilder()
    .setCustomId("review_edit_select")
    .setPlaceholder("Pick a question to edit…");

  for (const q of questions) {
    const label = q.prompt.split("\n")[0]?.replace(/📝\s*\*\*/, "").replace(/\*\*/, "").trim() ?? q.id;
    const currentVal = session.answers[q.id] ? truncate(resolveAnswerLabel(q, session.answers[q.id]!), 50) : "—";
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(truncate(label, 100))
      .setValue(q.id)
      .setDescription(truncate(`Current: ${currentVal}`, 100));
    select.addOptions(opt);
  }

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("✏️ Edit an Answer")
        .setDescription("Select the question you'd like to change:")
        .setColor(0x9b59b6),
    ],
    components: [row],
  });
}

// ─── Submit application ───────────────────────────────────────────────────────

/**
 * Posts the completed commission order to the log channel and opens a ticket
 * channel in the guild.  Clears the session when done.
 */
export async function submitApplication(
  session: SavedApplication,
  client: Client
): Promise<void> {
  const questions = getQuestionsForRoles(session.roles, session.answers);

  // ── Build log embed ───────────────────────────────────────────────────────
  const logEmbed = new EmbedBuilder()
    .setTitle("📥 New Commission Request")
    .setColor(0x9b59b6)
    .setTimestamp()
    .addFields({ name: "Client", value: `<@${session.userId}>`, inline: true });

  for (const q of questions) {
    const raw = session.answers[q.id] ?? "";
    if (!raw) continue;
    const label = q.prompt.split("\n")[0]?.replace(/📝\s*\*\*/, "").replace(/\*\*/, "").trim() ?? q.id;
    logEmbed.addFields({ name: label, value: truncate(resolveAnswerLabel(q, raw), 1024), inline: false });
  }

  // ── AI price for the log embed too ───────────────────────────────────────
  try {
    const estimate = await calculatePrice(session.answers);
    logEmbed.addFields(...buildPriceEmbedFields(estimate, session.answers));
  } catch {}

  // ── Post to log channel ───────────────────────────────────────────────────
  if (config.logChannelId) {
    const logChannel = await client.channels.fetch(config.logChannelId).catch(() => null);
    if (logChannel?.isTextBased()) {
      const logMsg = await (logChannel as TextChannel).send({ embeds: [logEmbed] }).catch(() => null);
      if (logMsg) {
        session.logMessageId = logMsg.id;
        session.logChannelId = logChannel.id;
      }
    }
  }

  // ── Create ticket channel ─────────────────────────────────────────────────
  try {
    // Find the guild via any shared guild between bot and user
    const guilds = client.guilds.cache;
    for (const [, guild] of guilds) {
      const member = await guild.members.fetch(session.userId).catch(() => null);
      if (!member) continue;

      // Resolve category
      const category = config.ticketCategoryId
        ? guild.channels.cache.get(config.ticketCategoryId) ?? null
        : null;

      const clientName = (session.answers["name"] ?? session.userId).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 20);
      const ticketName = `commission-${clientName}`.toLowerCase();

      const ticketChannel = await guild.channels.create({
        name: ticketName,
        parent: (category as any)?.id ?? null,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: ["ViewChannel"],
          },
          {
            id: session.userId,
            allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"],
          },
          {
            id: client.user!.id,
            allow: ["ViewChannel", "SendMessages", "ReadMessageHistory", "ManageChannels"],
          },
        ],
      });

      // Welcome message in ticket
      const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket:close:${ticketChannel.id}`)
          .setLabel("Close Ticket")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🔒")
      );

      await ticketChannel.send({
        content: `<@${session.userId}>`,
        embeds: [
          new EmbedBuilder()
            .setTitle("🎨 Commission Request Received!")
            .setDescription(
              [
                `Hey <@${session.userId}>! Your commission request has been submitted successfully.`,
                "",
                "A designer will review your request and get back to you here shortly.",
                "",
                "In the meantime, feel free to add any extra details or reference images below.",
              ].join("\n")
            )
            .setColor(0x2ecc71),
          logEmbed,
        ],
        components: [closeRow],
      });

      break; // only create one ticket
    }
  } catch (err) {
    console.error("[flows] Ticket creation error:", err);
  }

  // ── Finalise session ──────────────────────────────────────────────────────
  session.step = "submitted";
  updateSession(session);
  storeSubmission(session);
  clearSession(session.userId);
}

// ─── Modal builders ───────────────────────────────────────────────────────────

/** Generic text-input modal for any question. */
export function buildCustomAnswerModal(q: Question): ModalBuilder {
  const label = q.prompt.split("\n")[0]?.replace(/📝\s*\*\*/, "").replace(/\*\*/, "").trim() ?? "Answer";
  const type = q.answerType as { kind: string; minLength?: number; maxLength?: number };

  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel(truncate(label, 45))
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(!(q.answerType as any).optional)
    .setPlaceholder("Type your answer here…");

  if (type.minLength) input.setMinLength(type.minLength);
  if (type.maxLength) input.setMaxLength(Math.min(type.maxLength, 4000));

  return new ModalBuilder()
    .setCustomId(`q_custom_modal:${q.id}`)
    .setTitle(truncate(label, 45))
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input) as any);
}

/** Step 4 UI Elements — Page 1 (Main Menu, HUD, Shop, Inventory, Settings). */
export function buildUiElementsModalPage1(): ModalBuilder {
  const fields = [
    { id: "main_menu", label: "Main Menu" },
    { id: "hud", label: "HUD" },
    { id: "shop", label: "Shop" },
    { id: "inventory", label: "Inventory" },
    { id: "settings", label: "Settings" },
  ];

  const modal = new ModalBuilder()
    .setCustomId("ui_elements_modal:page1")
    .setTitle("UI Elements — Page 1 of 2");

  for (const f of fields) {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(f.id)
          .setLabel(f.label)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setPlaceholder(`Describe the ${f.label.toLowerCase()} UI…`)
          .setMaxLength(500)
      ) as any
    );
  }

  return modal;
}

/** Step 4 UI Elements — Page 2 (Leaderboard, Loading, Cutscene, Notifications, Other). */
export function buildUiElementsModalPage2(): ModalBuilder {
  const fields = [
    { id: "leaderboard", label: "Leaderboard" },
    { id: "loading", label: "Loading Screen" },
    { id: "cutscene", label: "Cutscene UI" },
    { id: "notifications", label: "Notifications" },
    { id: "other", label: "Other" },
  ];

  const modal = new ModalBuilder()
    .setCustomId("ui_elements_modal:page2")
    .setTitle("UI Elements — Page 2 of 2");

  for (const f of fields) {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(f.id)
          .setLabel(f.label)
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setPlaceholder(`Describe the ${f.label.toLowerCase()} UI…`)
          .setMaxLength(500)
      ) as any
    );
  }

  return modal;
}

/**
 * Action row shown after a UI Elements page is submitted.
 * @param page 1 or 2 — controls which buttons appear
 */
export function buildUiElementsAfterAnswerRow(page: 1 | 2): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  if (page === 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("ui_elements:page2")
        .setLabel("Page 2")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("➡️"),
      new ButtonBuilder()
        .setCustomId("ui_elements:edit")
        .setLabel("Edit Page 1")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("✏️"),
      new ButtonBuilder()
        .setCustomId("ui_elements:next")
        .setLabel("Next Question")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅")
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("ui_elements:edit")
        .setLabel("Edit Page 1")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("✏️"),
      new ButtonBuilder()
        .setCustomId("ui_elements:next")
        .setLabel("Next Question")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅")
    );
  }

  return row;
}

// ─── Misc payload builders ────────────────────────────────────────────────────

/** Confirm-close prompt sent when user types `cancel` / `end` / `close`. */
export function buildCloseConfirmPayload(): MessageCreateOptions {
  const embed = new EmbedBuilder()
    .setTitle("⚠️ Cancel Request?")
    .setDescription(
      "Are you sure you want to cancel your commission request?\n\nAll your answers will be lost."
    )
    .setColor(0xe74c3c);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("app:close:confirm")
      .setLabel("Yes, cancel")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("✖️"),
    new ButtonBuilder()
      .setCustomId("app:close:cancel")
      .setLabel("No, keep going")
      .setStyle(ButtonStyle.Success)
      .setEmoji("↩️")
  );

  return { embeds: [embed], components: [row] };
}

export function buildApplicationCancelledEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("❌ Request Cancelled")
    .setDescription(
      "Your commission request has been cancelled.\n\nFeel free to start a new one from the server whenever you're ready!"
    )
    .setColor(0xe74c3c);
}

export function buildApplicationSentEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("✅ Request Submitted!")
    .setDescription(
      [
        "Your commission request has been received! 🎉",
        "",
        "A ticket channel has been created in the server where you can chat with the designer.",
        "",
        "**What happens next:**",
        "• The designer will review your request",
        "• They'll confirm the final price and timeline",
        "• Work begins once payment is agreed",
      ].join("\n")
    )
    .setColor(0x2ecc71);
}
