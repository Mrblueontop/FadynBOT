import { type ModalSubmitInteraction, EmbedBuilder } from "discord.js";
import { getSession, updateSession, clearSession } from "./data.js";
import { getQuestionsForRoles } from "./questions.js";
import {
  askQuestion,
  sendReviewEmbed,
  buildUiElementsAfterAnswerRow,
  updateQuestionToAnswered,
  updateStep4ToAnswered,
} from "./flows.js";
import { moderateUiElements, buildUiElementsModerationWarning } from "./moderation.js";

const MAX_UI_STRIKES = 3;

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const { customId, user } = interaction;

  // ── Step 4: UI elements (single modal, 2 fields) ─────────────────────────
  if (
    customId === "ui_elements_modal:main" ||
    customId === "ui_elements_modal:page1" ||
    customId === "ui_elements_modal:page2"
  ) {
    const session = getSession(user.id);
    if (!session) return;

    let buttonsVal = "";
    let framesVal = "";
    try { buttonsVal = interaction.fields.getTextInputValue("buttons_needed").trim(); } catch {}
    try { framesVal = interaction.fields.getTextInputValue("frames_needed").trim(); } catch {}

    // ── AI validation ─────────────────────────────────────────────────────
    const modResult = await moderateUiElements(buttonsVal, framesVal);

    if (!modResult.passed) {
      // Increment strike counter
      session.uiElementsStrikes = (session.uiElementsStrikes ?? 0) + 1;
      updateSession(session);

      const strikesLeft = MAX_UI_STRIKES - session.uiElementsStrikes;

      if (session.uiElementsStrikes >= MAX_UI_STRIKES) {
        // Too many bad attempts — end the application
        clearSession(user.id);

        const embed = new EmbedBuilder()
          .setTitle("❌ Application Ended")
          .setDescription(
            [
              "You've entered invalid UI element names too many times.",
              "",
              "Your commission request has been **cancelled**.",
              "",
              "If you'd like to try again, head back to the server and start a new request. Make sure you have real button and frame names ready!",
            ].join("\n")
          )
          .setColor(0xe74c3c)
          .setFooter({ text: "Too many invalid attempts • Application cancelled" });

        await interaction.reply({ embeds: [embed], components: [] });
        return;
      }

      // Still have strikes left — show warning with strikes remaining
      const warningPayload = buildUiElementsModerationWarning(modResult, strikesLeft);
      await interaction.reply({ embeds: warningPayload.embeds ?? [], components: (warningPayload.components ?? []) as any });
      return;
    }

    // ── Valid — reset strike counter and save answer ───────────────────────
    session.uiElementsStrikes = 0;

    const parts: string[] = [];
    if (buttonsVal) parts.push(`Buttons Needed: ${buttonsVal}`);
    if (framesVal)  parts.push(`Frames Needed: ${framesVal}`);

    session.answers["uiRequirementType"] = parts.join("\n");
    updateSession(session);

    // Silently acknowledge the modal
    await interaction.deferUpdate();

    // Edit the original Step 4 message in-place to green + Edit/Next buttons
    const dm = await user.createDM();
    const msgId = session.questionMessageIds?.["uiRequirementType"];
    if (msgId) {
      const questions = getQuestionsForRoles(session.roles, session.answers);
      const idx = questions.findIndex((q) => q.id === "uiRequirementType");
      if (idx >= 0) {
        await updateStep4ToAnswered(dm, msgId, session.answers["uiRequirementType"]!, idx, questions.length);
      }
    }

    return;
  }

  // ── q_custom_modal — answer a specific question via modal ─────────────────
  if (customId.startsWith("q_custom_modal:")) {
    const questionId = customId.slice(15);
    const session = getSession(user.id);
    if (!session || !questionId) return;

    const value = interaction.fields.getTextInputValue("value").trim();
    session.answers[questionId] = value;

    const questions = getQuestionsForRoles(session.roles, session.answers);
    const currentIndex = questions.findIndex((q) => q.id === questionId);

    const dm = await user.createDM();
    const msgId = session.questionMessageIds?.[questionId];
    if (msgId && currentIndex >= 0) {
      const q = questions[currentIndex]!;
      await updateQuestionToAnswered(dm, msgId, q, value, currentIndex, questions.length);
    }

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

    const next = session.currentQuestionIndex + 1;
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
