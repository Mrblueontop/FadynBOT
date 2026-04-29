import {
  type ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} from "discord.js";
import { getSession, updateSession, clearSession } from "./data.js";
import { getQuestionsForRoles } from "./questions.js";
import { formatDeadlineTimestamp } from "./deadline.js";
import { getPriceBreakdown } from "./pricing.js";
import {
  askQuestion,
  sendStartPrompt,
  sendReviewEmbed,
  sendReviewEditSelect,
  buildApplicationCancelledEmbed,
  buildApplicationSentEmbed,
  submitApplication,
  buildCustomAnswerModal,
  MODAL_QUESTION_IDS,
  buildUiElementsModalPage1,
  buildUiElementsModalPage2,
  buildCloseConfirmPayload,
  buildModerationFixModal,
  updateAnimationToAnswered,
} from "./flows.js";

export async function handleButton(interaction: ButtonInteraction): Promise<void> {
  const { customId, user } = interaction;

  // ── apply_start — fired from the guild embed ──────────────────────────────
  if (customId === "apply_start") {
    const existing = getSession(user.id);
    if (existing && existing.step !== "submitted") {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription("You already have an active commission request! Check your DMs.")
            .setColor(0xe67e22),
        ],
        ephemeral: true,
      });
      return;
    }

    const dm = await user.createDM().catch(() => null);
    if (!dm) {
      await interaction.reply({
        content: "I couldn't open a DM with you. Please check your privacy settings.",
        ephemeral: true,
      });
      return;
    }

    updateSession({
      userId: user.id,
      step: "pending_start",
      roles: [],
      answers: {},
      currentQuestionIndex: 0,
      startedAt: Date.now(),
    });

    await sendStartPrompt(dm);
    await interaction.reply({ content: "Check your DMs! 📩", ephemeral: true });
    return;
  }

  // ── app:start ─────────────────────────────────────────────────────────────
  if (customId === "app:start") {
    const session = getSession(user.id);
    if (!session) return;
    session.step = "answering";
    session.currentQuestionIndex = 0;
    updateSession(session);

    const dm = interaction.channel?.type === ChannelType.DM ? interaction.channel : await user.createDM();
    const questions = getQuestionsForRoles(session.roles, session.answers);
    const first = questions[0];
    if (!first) return;

    // Edit the start prompt embed to show "in progress" state
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setTitle("🚀 Commission Request — In Progress")
          .setDescription(
            [
              "Your request is underway! Answer the questions in the messages below.",
              "",
              "Type `cancel`, `close`, or `end` at any time to stop.",
            ].join("\n")
          )
          .setColor(0x2ecc71)
          .setFooter({ text: "Commission Request • In Progress" }),
      ],
      components: [],
    });

    const msg = await askQuestion(dm as any, first, 0, questions.length, session);
    if (!session.questionMessageIds) session.questionMessageIds = {};
    session.questionMessageIds[first.id] = msg.id;
    updateSession(session);
    return;
  }

  // ── app:cancel ────────────────────────────────────────────────────────────
  if (customId === "app:cancel") {
    clearSession(user.id);
    await interaction.update({ embeds: [buildApplicationCancelledEmbed()], components: [] });
    return;
  }

  // ── Step 4: open UI elements modal ────────────────────────────────────────
  if (customId === "q_choice:uiRequirementType:open_modal") {
    await interaction.showModal(buildUiElementsModalPage1());
    return;
  }

  // ── Step 4: open page 2 modal (alias — now same modal) ───────────────────
  if (customId === "ui_elements:page2") {
    await interaction.showModal(buildUiElementsModalPage2());
    return;
  }

  // ── Step 4: edit — reopen modal ───────────────────────────────────────────
  if (customId === "ui_elements:edit") {
    await interaction.showModal(buildUiElementsModalPage1());
    return;
  }

  // ── Step 4: next — advance to step 5 ─────────────────────────────────────
  if (customId === "ui_elements:next") {
    const session = getSession(user.id);
    if (!session) return;
    await interaction.deferUpdate();
    await advanceOrReview(interaction, session);
    return;
  }

  // ── q_choice — inline button answer ──────────────────────────────────────
  if (customId.startsWith("q_choice:")) {
    const parts = customId.split(":");
    const questionId = parts[1];
    const value = parts[2];
    const session = getSession(user.id);
    if (!session || !questionId || !value) return;

    session.answers[questionId] = value;

    const questions = getQuestionsForRoles(session.roles, session.answers);
    const currentIndex = questions.findIndex((q) => q.id === questionId);
    const dm = await user.createDM();

    // ── animation: disable both buttons immediately after selection ───────────
    if (questionId === "animation") {
      const msgId = session.questionMessageIds?.[questionId];
      if (msgId && currentIndex >= 0) {
        const { buildAnimationPrompt } = await import("./questions.js");
        const prompt = buildAnimationPrompt(session.answers);
        await updateAnimationToAnswered(dm, msgId, value, prompt, currentIndex, questions.length);
      }
      await advanceOrReview(interaction, session);
      return;
    }

    await advanceOrReview(interaction, session);
    return;
  }

  // ── edit_q — edit a single question from answered view ───────────────────
  if (customId.startsWith("edit_q:")) {
    const questionId = customId.slice(7);
    const session = getSession(user.id);
    if (!session || !questionId) return;

    const questions = getQuestionsForRoles(session.roles, session.answers);
    const q = questions.find((q) => q.id === questionId);
    if (!q) return;

    // Special case: Step 4 (uiRequirementType) — reopen modal
    if (questionId === "uiRequirementType") {
      await interaction.showModal(buildUiElementsModalPage1());
      return;
    }

    if (MODAL_QUESTION_IDS.has(questionId) || q.answerType.kind === "text") {
      await interaction.showModal(buildCustomAnswerModal(q));
    } else {
      session.step = "editing_from_review";
      session.editingQuestionId = questionId;
      updateSession(session);
      const dm = await user.createDM();
      await interaction.deferUpdate();
      const idx = questions.findIndex((q) => q.id === questionId);
      await askQuestion(dm, q, idx, questions.length, session);
    }
    return;
  }

  // ── moderation:fix — open pre-filled modal for flagged fields ────────────
  if (customId === "moderation:fix") {
    const session = getSession(user.id);
    if (!session) return;
    const flags = (session as any).moderationFlags as { questionId: string; label: string }[] | undefined;
    if (!flags || flags.length === 0) {
      // No flags stored — fall back to review
      await interaction.deferUpdate();
      const dm = await user.createDM();
      await sendReviewEmbed(dm, session);
      return;
    }
    await interaction.showModal(buildModerationFixModal(flags, session.answers));
    return;
  }

  // ── review:submit ─────────────────────────────────────────────────────────
  if (customId === "review:submit") {
    const session = getSession(user.id);
    if (!session) return;
    await interaction.deferUpdate();
    await submitApplication(session, interaction.client);
    const dm = await user.createDM();
    await dm.send({ embeds: [buildApplicationSentEmbed()] });
    return;
  }

  // ── review:cancel ─────────────────────────────────────────────────────────
  if (customId === "review:cancel") {
    clearSession(user.id);
    await interaction.update({ embeds: [buildApplicationCancelledEmbed()], components: [] });
    return;
  }

  // ── review:edit ───────────────────────────────────────────────────────────
  if (customId === "review:edit") {
    const session = getSession(user.id);
    if (!session) return;
    session.finalEditUsed = true;
    updateSession(session);
    await interaction.deferUpdate();
    const dm = await user.createDM();
    await sendReviewEditSelect(dm, session);
    return;
  }

  // ── app:close:confirm — user confirmed cancellation ───────────────────────
  if (customId === "app:close:confirm") {
    clearSession(user.id);
    await interaction.update({ embeds: [buildApplicationCancelledEmbed()], components: [] });
    return;
  }

  // ── app:close:cancel — user chose to keep going ───────────────────────────
  if (customId === "app:close:cancel") {
    await interaction.update({ embeds: [], components: [], content: "Got it — carry on! 👍" });
    return;
  }

  // ── price:breakdown — show per-item price breakdown ephemerally ──────────
  if (customId.startsWith("price:breakdown:")) {
    const messageId = customId.slice(16);
    const breakdown = getPriceBreakdown(messageId);

    if (!breakdown) {
      await interaction.reply({
        content: "⚠️ Breakdown data isn't available (the bot may have restarted since this order was submitted).",
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("💰 Price Breakdown")
      .setDescription(breakdown)
      .setColor(0x9b59b6)
      .setFooter({ text: "Prices are estimates — final amount agreed in ticket" });

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  // ── ticket:close ──────────────────────────────────────────────────────────
  if (customId.startsWith("ticket:close:confirm:")) {
    const channelId = customId.split(":")[3];
    const guild = interaction.guild;
    if (!guild || !channelId) return;
    const channel = guild.channels.cache.get(channelId);
    await interaction.deferUpdate();
    await channel?.delete().catch(() => {});
    return;
  }

  if (customId === "ticket:close:cancel") {
    await interaction.update({ components: [] });
    return;
  }

  if (customId.startsWith("ticket:close:")) {
    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) return;
    await interaction.deferUpdate();
    await channel.delete().catch(() => {});
    return;
  }


  // ── deadline:confirm — user confirmed the AI-resolved timestamp ──────────
  if (customId === "deadline:confirm") {
    const session = getSession(user.id);
    if (!session || !session.deadlineTimestamp) return;

    session.deadlinePending = false;
    updateSession(session);

    const questions = getQuestionsForRoles(session.roles, session.answers);
    const idx = questions.findIndex((q) => q.id === "deadline");

    // Edit message to green confirmed state
    const formattedTs = formatDeadlineTimestamp(session.deadlineTimestamp);
    const embed = new EmbedBuilder()
      .setDescription(
        "## 11/12 — Deadline\n" +
        "### ⏰ When do you need this by?"
      )
      .setColor(0x2ecc71)
      .addFields({ name: "✅ Your deadline", value: formattedTs, inline: false })
      .setFooter({ text: `Question ${idx + 1} of ${questions.length} — answered` });

    await interaction.update({ embeds: [embed], components: [] });

    // Advance flow
    const dm = await user.createDM();
    await advanceOrReview(interaction, session);
    return;
  }

  // ── deadline:reenter — user wants to type a different deadline ───────────
  if (customId === "deadline:reenter") {
    const session = getSession(user.id);
    if (!session) return;

    session.deadlineTimestamp = undefined;
    session.deadlinePending   = false;
    updateSession(session);

    const questions = getQuestionsForRoles(session.roles, session.answers);
    const idx = questions.findIndex((q) => q.id === "deadline");

    const embed = new EmbedBuilder()
      .setDescription(
        "## 11/12 — Deadline\n" +
        "### ⏰ When do you need this by?\n\n" +
        "No problem — please reply with a clearer deadline.\n\n" +
        "**Examples:**\n" +
        "• `December 25th`\n" +
        "• `End of next week`\n" +
        "• `In 2 weeks`\n" +
        "• `ASAP` *(treated as 3 days from now)*\n\n" +
        "💬 *Reply to this message with your deadline.*"
      )
      .setColor(0x9b59b6)
      .setFooter({ text: `Question ${idx + 1} of ${questions.length} • Reply with your deadline` });

    await interaction.update({ embeds: [embed], components: [] });
    return;
  }

  // ── portfolio:done ────────────────────────────────────────────────────────
  if (customId === "portfolio:done") {
    const session = getSession(user.id);
    if (!session) return;
    await interaction.deferUpdate();
    await advanceOrReview(interaction, session);
    return;
  }
}


async function advanceOrReview(interaction: ButtonInteraction, session: ReturnType<typeof getSession> & object): Promise<void> {
  if (!session) return;
  const questions = getQuestionsForRoles(session.roles, session.answers);

  if (session.step === "editing_from_review") {
    session.step = "review";
    session.editingQuestionId = undefined;
    updateSession(session);
    const dm = await interaction.user.createDM();
    try { await interaction.deferUpdate(); } catch {}
    const msg = await sendReviewEmbed(dm, session, !session.finalEditUsed);
    session.reviewMessageId = msg.id;
    updateSession(session);
    return;
  }

  // Re-anchor the index to the last question that has an answer in the
  // current filtered list, so that newly-visible conditional questions
  // (showIf) don't cause the cursor to skip or repeat a step.
  const answeredIds = new Set(Object.keys(session.answers));
  let anchoredIndex = session.currentQuestionIndex;
  for (let i = questions.length - 1; i >= 0; i--) {
    if (answeredIds.has(questions[i]!.id)) {
      anchoredIndex = i;
      break;
    }
  }
  session.currentQuestionIndex = anchoredIndex;

  const next = session.currentQuestionIndex + 1;
  if (next >= questions.length) {
    session.step = "review";
    updateSession(session);
    const dm = await interaction.user.createDM();
    try { await interaction.deferUpdate(); } catch {}
    const msg = await sendReviewEmbed(dm, session, !session.finalEditUsed);
    session.reviewMessageId = msg.id;
    updateSession(session);
  } else {
    session.currentQuestionIndex = next;
    updateSession(session);
    const dm = await interaction.user.createDM();
    try { await interaction.deferUpdate(); } catch {}
    const q = questions[next]!;
    const msgOut = await askQuestion(dm, q, next, questions.length, session);
    if (!session.questionMessageIds) session.questionMessageIds = {};
    session.questionMessageIds[q.id] = msgOut.id;
    updateSession(session);
  }
}
