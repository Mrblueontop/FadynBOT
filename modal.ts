import { type ModalSubmitInteraction } from "discord.js";
import { getSession, updateSession } from "./data.js";
import { getQuestionsForRoles } from "./questions.js";
import { askQuestion, sendReviewEmbed } from "./flows.js";

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const { customId, user } = interaction;

  // ── q_custom_modal — answer a specific question via modal ─────────────────
  if (customId.startsWith("q_custom_modal:")) {
    const questionId = customId.slice(15);
    const session = getSession(user.id);
    if (!session || !questionId) return;

    const value = interaction.fields.getTextInputValue("value").trim();
    session.answers[questionId] = value;

    const questions = getQuestionsForRoles(session.roles, session.answers);

    if (session.step === "editing_from_review") {
      session.step = "review";
      session.editingQuestionId = undefined;
      updateSession(session);
      await interaction.deferUpdate();
      const dm = await user.createDM();
      const msg = await sendReviewEmbed(dm, session, !session.finalEditUsed);
      session.reviewMessageId = msg.id;
      updateSession(session);
      return;
    }

    const next = session.currentQuestionIndex + 1;
    if (next >= questions.length) {
      session.step = "review";
      updateSession(session);
      await interaction.deferUpdate();
      const dm = await user.createDM();
      const msg = await sendReviewEmbed(dm, session, !session.finalEditUsed);
      session.reviewMessageId = msg.id;
      updateSession(session);
    } else {
      session.currentQuestionIndex = next;
      updateSession(session);
      await interaction.deferUpdate();
      const dm = await user.createDM();
      const q = questions[next]!;
      const msgOut = await askQuestion(dm, q, next, questions.length, session);
      if (!session.questionMessageIds) session.questionMessageIds = {};
      session.questionMessageIds[q.id] = msgOut.id;
      updateSession(session);
    }
    return;
  }

  // ── edit_modal — edit answer from review ──────────────────────────────────
  if (customId.startsWith("edit_modal:")) {
    const questionId = customId.slice(11);
    const session = getSession(user.id);
    if (!session || !questionId) return;

    const value = interaction.fields.getTextInputValue("answer").trim();
    session.answers[questionId] = value;
    session.step = "review";
    session.editingQuestionId = undefined;
    updateSession(session);

    await interaction.deferUpdate();
    const dm = await user.createDM();
    const msg = await sendReviewEmbed(dm, session, !session.finalEditUsed);
    session.reviewMessageId = msg.id;
    updateSession(session);
    return;
  }

  // ── review_edit_page — bulk edit answers from review page ─────────────────
  if (customId.startsWith("review_edit_page:")) {
    const session = getSession(user.id);
    if (!session) return;

    const questions = getQuestionsForRoles(session.roles, session.answers);
    const page = parseInt(customId.slice(17), 10);
    const start = page * 5;
    const slice = questions.slice(start, start + 5);

    for (const q of slice) {
      try {
        const val = interaction.fields.getTextInputValue(`review_field:${q.id}`).trim();
        if (val) session.answers[q.id] = val;
      } catch {}
    }

    session.step = "review";
    session.editingQuestionId = undefined;
    updateSession(session);

    await interaction.deferUpdate();
    const dm = await user.createDM();
    const msg = await sendReviewEmbed(dm, session, !session.finalEditUsed);
    session.reviewMessageId = msg.id;
    updateSession(session);
    return;
  }
}
