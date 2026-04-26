/**
 * flows.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Core flow helpers for FadynBot.
 *
 * Changes:
 *   - apply_start: sends ephemeral with "Open DMs" button instead of direct DM
 *     to eliminate the double "check your DMs" message.
 *   - sendStartPrompt: improved embed, clearer instructions.
 *   - askQuestion: footer now says "Please reply directly to this message."
 *   - buildUiElementsModal: replaced 2-page modal with single 2-field modal
 *     (Buttons Needed + Frames Needed).
 *   - buildUiElementsAfterAnswerRow: simplified — no Page 2 button.
 *   - sendReviewEmbed: Edit button ALWAYS shown, submit now edits existing
 *     message instead of sending new one.
 *   - submitApplication: ticket embed title changed to "📩 New Commission Request",
 *     description reflects it's a new order notification, not confirmation.
 *   - buildCustomAnswerModal: always required.
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
import { moderateAnswers, buildModerationWarningPayload } from "./moderation.js";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Question IDs that must always be answered via a modal (not a raw DM reply). */
export const MODAL_QUESTION_IDS = new Set<string>([
  // add any IDs here that you want to force through a modal
]);

/** Footer text added to every question embed to guide reply behaviour. */
const REPLY_FOOTER = "Please reply directly to this message with your answer.";

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
 * Sends the opening "Commission Request" panel in DMs with Start / Cancel.
 */
export async function sendStartPrompt(dm: DMChannel): Promise<Message> {
  const embed = new EmbedBuilder()
    .setTitle("👋 Commission Request")
    .setDescription(
      [
        "Hey! Thanks for reaching out about a UI commission.",
        "",
        "**Before we begin, please have the following ready:**",
        "› A description of your game and what it does",
        "› Reference images or links showing the style you want",
        "› Any existing assets (logos, icons, etc.) if applicable",
        "",
        "**What to expect:**",
        "› The form takes about **2–3 minutes** to complete",
        "› All questions are required unless stated otherwise",
        "› Type `cancel`, `close`, or `end` at any time to stop",
        "",
        "Hit **Start** when you're ready to begin! 🚀",
      ].join("\n")
    )
    .setColor(0x9b59b6)
    .setFooter({ text: "Commission Request • Step 1 starts after you click Start" });

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
    .setFooter({ text: `Question ${index + 1} of ${total} • ${REPLY_FOOTER}` });

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

  // ── Portfolio / asset done button ─────────────────────────────────────────
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

// ─── Portfolio / asset "add more" prompt ──────────────────────────────────────

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
        .setColor(0x9b59b6)
        .setFooter({ text: REPLY_FOOTER }),
    ],
    components: [row],
  });
}

// ─── Review embed ─────────────────────────────────────────────────────────────

/**
 * Builds and sends (or edits) the final review embed.
 * - showEditButton is now always treated as true (edit button always visible).
 * - If session.reviewMessageId exists, edits that message instead of sending new one.
 */
export async function sendReviewEmbed(
  channel: AnyChannel,
  session: SavedApplication,
  _showEditButton: boolean = true
): Promise<Message> {
  const questions = getQuestionsForRoles(session.roles, session.answers);

  // ── AI moderation ─────────────────────────────────────────────────────────
  try {
    const modResult = await moderateAnswers(session.answers);
    if (!modResult.passed) {
      console.log(`[flows] Moderation failed for ${session.userId}:`, modResult.flags);
      return channel.send(buildModerationWarningPayload(modResult));
    }
  } catch (err) {
    console.error("[flows] Moderation check error:", err);
    // fail-open
  }

  const embed = new EmbedBuilder()
    .setTitle("📋 Commission Request — Review")
    .setDescription(
      [
        "Here's a full summary of your commission request.",
        "Please review everything carefully before submitting.",
        "",
        "› Use **Edit Answers** to change anything",
        "› Hit **Submit Request** when you're happy with it",
        "› **Cancel** will permanently discard this request",
      ].join("\n")
    )
    .setColor(0x9b59b6)
    .setFooter({ text: "Review your answers before submitting • All info is final once submitted" })
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
      value: "Price will be confirmed by the designer after reviewing your request.",
      inline: false,
    });
  }

  // ── Buttons — Edit is always shown ───────────────────────────────────────
  const submitBtn = new ButtonBuilder()
    .setCustomId("review:submit")
    .setLabel("Submit Request")
    .setStyle(ButtonStyle.Success)
    .setEmoji("📨");

  const editBtn = new ButtonBuilder()
    .setCustomId("review:edit")
    .setLabel("Edit Answers")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("✏️");

  const cancelBtn = new ButtonBuilder()
    .setCustomId("review:cancel")
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Danger)
    .setEmoji("✖️");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(submitBtn, editBtn, cancelBtn);

  // ── Edit existing review message if possible ──────────────────────────────
  if (session.reviewMessageId) {
    try {
      const existing = await channel.messages.fetch(session.reviewMessageId);
      await existing.edit({ embeds: [embed], components: [row] });
      return existing;
    } catch {
      // If the old message can't be edited (deleted, too old), fall through to send
    }
  }

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
        .setDescription(
          [
            "Select the question you'd like to change from the dropdown below.",
            "",
            "Your updated answer will be saved and the review will reload.",
          ].join("\n")
        )
        .setColor(0x9b59b6)
        .setFooter({ text: "Select a question to edit it" }),
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
    .setTitle("📩 New Commission Request")
    .setDescription(
      [
        `**Client:** <@${session.userId}>`,
        `**Submitted:** <t:${Math.floor(Date.now() / 1000)}:f>`,
        "",
        "A new commission request has been submitted. Review the details below and open a conversation with the client.",
      ].join("\n")
    )
    .setColor(0x9b59b6)
    .setTimestamp()
    .addFields({ name: "Client ID", value: session.userId, inline: true });

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
    const guilds = client.guilds.cache;
    for (const [, guild] of guilds) {
      const member = await guild.members.fetch(session.userId).catch(() => null);
      if (!member) continue;

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

      const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket:close:${ticketChannel.id}`)
          .setLabel("Close Ticket")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🔒")
      );

      // Ticket welcome embed — framed as a new order notification for staff,
      // not as a confirmation message to the client.
      const ticketWelcomeEmbed = new EmbedBuilder()
        .setTitle("📩 New Commission Request")
        .setDescription(
          [
            `Hey <@${session.userId}>! Your commission request has been received and a ticket has been opened for you here.`,
            "",
            "**What happens next:**",
            "› A designer will review your request and confirm the details",
            "› Final pricing and timeline will be agreed before work starts",
            "› Feel free to add any extra references or notes below",
            "",
            "Please be patient — we'll be with you shortly!",
          ].join("\n")
        )
        .setColor(0x9b59b6)
        .setTimestamp();

      await ticketChannel.send({
        content: `<@${session.userId}>`,
        embeds: [ticketWelcomeEmbed, logEmbed],
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

/** Generic text-input modal for any question. Always required. */
export function buildCustomAnswerModal(q: Question): ModalBuilder {
  const label = q.prompt.split("\n")[0]?.replace(/📝\s*\*\*/, "").replace(/\*\*/, "").trim() ?? "Answer";
  const type = q.answerType as { kind: string; minLength?: number; maxLength?: number; optional?: boolean };

  const isOptional = !!(q.answerType as any).optional;

  const input = new TextInputBuilder()
    .setCustomId("value")
    .setLabel(truncate(label, 45))
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(!isOptional) // required unless explicitly optional
    .setPlaceholder(isOptional ? "Type your answer, or type N/A to skip…" : "Type your answer here…");

  if (type.minLength) input.setMinLength(type.minLength);
  if (type.maxLength) input.setMaxLength(Math.min(type.maxLength, 4000));

  return new ModalBuilder()
    .setCustomId(`q_custom_modal:${q.id}`)
    .setTitle(truncate(label, 45))
    .addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input) as any);
}

/**
 * Step 4 UI Frames Needed — single modal with 2 fields:
 *   1. Buttons Needed
 *   2. Frames Needed
 *
 * Replaces the old 2-page modal system entirely.
 */
export function buildUiElementsModal(): ModalBuilder {
  const modal = new ModalBuilder()
    .setCustomId("ui_elements_modal:main")
    .setTitle("UI Frames Needed");

  const buttonsInput = new TextInputBuilder()
    .setCustomId("buttons_needed")
    .setLabel("Buttons Needed")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder("e.g. Play, Shop, Inventory, Settings, Back\nLeave blank if you don't need buttons.")
    .setMaxLength(1000);

  const framesInput = new TextInputBuilder()
    .setCustomId("frames_needed")
    .setLabel("Frames Needed")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setPlaceholder("e.g. Main Menu, HUD, Shop Screen, Inventory Screen\nLeave blank if you don't need frames.")
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(buttonsInput) as any,
    new ActionRowBuilder<TextInputBuilder>().addComponents(framesInput) as any
  );

  return modal;
}

/** Keep old export names as aliases so existing button.ts / modal.ts don't break. */
export function buildUiElementsModalPage1(): ModalBuilder {
  return buildUiElementsModal();
}

// Page 2 is no longer used — kept as a no-op export for safety
export function buildUiElementsModalPage2(): ModalBuilder {
  return buildUiElementsModal();
}

/**
 * Action row shown after UI Elements modal is submitted.
 * Simplified — no Page 2 anymore.
 */
export function buildUiElementsAfterAnswerRow(_page: 1 | 2 = 1): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  row.addComponents(
    new ButtonBuilder()
      .setCustomId("ui_elements:edit")
      .setLabel("Edit")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✏️"),
    new ButtonBuilder()
      .setCustomId("ui_elements:next")
      .setLabel("Next Question")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅")
  );

  return row;
}

// ─── Misc payload builders ────────────────────────────────────────────────────

/** Confirm-close prompt sent when user types `cancel` / `end` / `close`. */
export function buildCloseConfirmPayload(): MessageCreateOptions {
  const embed = new EmbedBuilder()
    .setTitle("⚠️ Cancel Request?")
    .setDescription(
      [
        "Are you sure you want to cancel your commission request?",
        "",
        "**All your answers will be lost** and you'll need to start over.",
        "",
        "Choose below:",
      ].join("\n")
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
      [
        "Your commission request has been cancelled.",
        "",
        "Feel free to start a new one from the server whenever you're ready!",
      ].join("\n")
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
        "**A ticket channel has been opened in the server** — head there to chat with the designer.",
        "",
        "**What happens next:**",
        "› The designer will review your request",
        "› They'll confirm the final price and timeline",
        "› Work begins once payment is agreed",
      ].join("\n")
    )
    .setColor(0x2ecc71)
    .setFooter({ text: "Check the server for your ticket channel" });
}
