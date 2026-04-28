import {
  type ButtonInteraction,
  EmbedBuilder,
  ChannelType,
} from "discord.js";
import { getSession, updateSession, clearSession } from "./data.js";
import { getQuestionsForRoles } from "./questions.js";
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
  buildUiElementsAfterAnswerRow,
  buildCloseConfirmPayload,
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
