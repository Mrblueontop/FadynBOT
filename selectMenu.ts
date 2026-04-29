import { type StringSelectMenuInteraction, ChannelType } from "discord.js";
import { getSession, updateSession } from "./data.js";
import { getQuestionsForRoles } from "./questions.js";
import {
  askQuestion,
  sendReviewEmbed,
  buildCustomAnswerModal,
  buildCustomOptionModal,
  MODAL_QUESTION_IDS,
  updateQuestionToAnswered,
} from "./flows.js";

export async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
  const { customId, user, values } = interaction;

  // ── q_select — dropdown question answer ───────────────────────────────────
  if (customId.startsWith("q_select:")) {
    const questionId = customId.slice(9);
    const session = getSession(user.id);
    if (!session || !questionId) return;

    const selectedValue = values.join(", ");

    // ── Custom option → open a modal for freeform input ──────────────────────
    if (selectedValue === "Custom") {
      const questions = getQuestionsForRoles(session.roles, session.answers);
      const q = questions.find((q) => q.id === questionId);
      if (q) {
        await interaction.showModal(buildCustomOptionModal(q));
      }
      return;
    }

    session.answers[questionId] = selectedValue;

    const questions = getQuestionsForRoles(session.roles, session.answers);
    const currentIndex = questions.findIndex((q) => q.id === questionId);

    // Edit original question message in-place
    const dm = await user.createDM();
    const msgId = session.questionMessageIds?.[questionId];
    if (msgId && currentIndex >= 0) {
      const q = questions[currentIndex]!;
      await updateQuestionToAnswered(dm, msgId, q, session.answers[questionId]!, currentIndex, questions.length);
    }

    // Check if next question is a modal-triggered one
    const nextIndex = session.step === "editing_from_review"
      ? questions.findIndex((q) => q.id === session.editingQuestionId) + 1
      : session.currentQuestionIndex + 1;

    const nextQ = questions[nextIndex];
    if (nextQ && MODAL_QUESTION_IDS.has(nextQ.id)) {
      session.currentQuestionIndex = nextIndex;
      updateSession(session);
      await interaction.showModal(buildCustomAnswerModal(nextQ));
      return;
    }

    updateSession(session);

    if (session.step === "editing_from_review") {
      session.step = "review";
      session.editingQuestionId = undefined;
      updateSession(session);
      await interaction.deferUpdate();
      const msg = await sendReviewEmbed(dm, session, !session.finalEditUsed);
      session.reviewMessageId = msg.id;
      updateSession(session);
      return;
    }

    // Use currentIndex (from findIndex) as the anchor so showIf shifts don't skew the cursor
    const next = (currentIndex >= 0 ? currentIndex : session.currentQuestionIndex) + 1;
    if (next >= questions.length) {
      session.step = "review";
      updateSession(session);
      await interaction.deferUpdate();
      const msg = await sendReviewEmbed(dm, session, !session.finalEditUsed);
      session.reviewMessageId = msg.id;
      updateSession(session);
    } else {
      session.currentQuestionIndex = next;
      updateSession(session);
      await interaction.deferUpdate();
      const q = questions[next]!;
      const msgOut = await askQuestion(dm, q, next, questions.length, session);
      if (!session.questionMessageIds) session.questionMessageIds = {};
      session.questionMessageIds[q.id] = msgOut.id;
      updateSession(session);
    }
    return;
  }

  // ── review_edit_select — pick a question to edit ──────────────────────────
  if (customId === "review_edit_select") {
    const session = getSession(user.id);
    if (!session) return;

    const questionId = values[0];
    if (!questionId) return;

    const questions = getQuestionsForRoles(session.roles, session.answers);
    const q = questions.find((q) => q.id === questionId);
    if (!q) return;

    session.step = "editing_from_review";
    session.editingQuestionId = questionId;
    updateSession(session);

    if (MODAL_QUESTION_IDS.has(questionId) || q.answerType.kind === "text") {
      await interaction.showModal(buildCustomAnswerModal(q));
    } else {
      await interaction.deferUpdate();
      const dm = await user.createDM();
      const idx = questions.findIndex((q) => q.id === questionId);
      const msg = await askQuestion(dm, q, idx, questions.length, session);
      if (!session.questionMessageIds) session.questionMessageIds = {};
      session.questionMessageIds[q.id] = msg.id;
      updateSession(session);
    }
    return;
  }
}
