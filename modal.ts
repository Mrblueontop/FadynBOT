import { type ModalSubmitInteraction, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getSession, updateSession, clearSession } from "./data.js";
import { getQuestionsForRoles } from "./questions.js";
import {
  askQuestion,
  sendReviewEmbed,
  updateQuestionToAnswered,
  updateStep4ToAnswered,
} from "./flows.js";
import { moderateUiElements } from "./moderation.js";

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

      // Silently acknowledge the modal first
      await interaction.deferUpdate();

      const dm = await user.createDM();
      const msgId = session.questionMessageIds?.["uiRequirementType"];

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

        if (msgId) {
          try {
            const msg = await dm.messages.fetch(msgId);
            await msg.edit({ embeds: [embed], components: [] });
          } catch {}
        }
        return;
      }

      // Still have strikes left — edit Step 4 embed in-place to show the error
      if (msgId) {
        try {
          const msg = await dm.messages.fetch(msgId);

          const strikeWarning = strikesLeft === 1
            ? "\n\n⚠️ **Last chance** — one more invalid attempt will cancel your application."
            : `\n\n⚠️ **${strikesLeft} attempt${strikesLeft === 1 ? "" : "s"} remaining** before your application is cancelled.`;

          const flagLines = modResult.flags.map((f) => `> **${f.label}** — ${f.reason}`).join("\n");

          const embed = new EmbedBuilder()
            .setTitle("⚠️ Step 4: Invalid UI Elements")
            .setDescription(
              [
                "The names you entered don't look like real UI elements. Please try again.",
                "",
                flagLines,
                "",
                "**Valid examples:**",
                "> Buttons: `Play, Shop, Inventory, Settings, Back`",
                "> Frames: `Main Menu, HUD, Shop Screen, Leaderboard`",
                "",
                "Click **Fill In** to try again." + strikeWarning,
              ].join("\n")
            )
            .setColor(strikesLeft === 1 ? 0xe74c3c : 0xe67e22)
            .setFooter({ text: `Question 4 • ${strikesLeft} attempt${strikesLeft === 1 ? "" : "s"} remaining` });

          const fillInBtn = new ButtonBuilder()
            .setCustomId("q_choice:uiRequirementType:open_modal")
            .setLabel("Fill In")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📋");

          const row = new ActionRowBuilder<ButtonBuilder>().addComponents(fillInBtn);
          await msg.edit({ embeds: [embed], components: [row as any] });
        } catch {}
      }
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

    const dm = await user.createDM();
    const questions = getQuestionsForRoles(session.roles, session.answers);

    // Edit the original Step 4 message in-place to green (no buttons)
    const msgId = session.questionMessageIds?.["uiRequirementType"];
    if (msgId) {
      const idx = questions.findIndex((q) => q.id === "uiRequirementType");
      if (idx >= 0) {
        await updateStep4ToAnswered(dm, msgId, session.answers["uiRequirementType"]!, idx, questions.length);
      }
    }

    // Re-anchor index before advancing (guards against showIf shifts)
    {
      const answeredIds = new Set(Object.keys(session.answers));
      for (let i = questions.length - 1; i >= 0; i--) {
        if (answeredIds.has(questions[i]!.id)) { session.currentQuestionIndex = i; break; }
      }
    }

    // Auto-advance to the next question (replaces the removed Next button)
    const next = session.currentQuestionIndex + 1;
    if (next >= questions.length) {
      session.step = "review";
      updateSession(session);
      const msg = await sendReviewEmbed(dm, session, !session.finalEditUsed);
      session.reviewMessageId = msg.id;
      updateSession(session);
    } else {
      session.currentQuestionIndex = next;
      updateSession(session);
      const q = questions[next]!;
      const msgOut = await askQuestion(dm, q, next, questions.length, session);
      if (!session.questionMessageIds) session.questionMessageIds = {};
      session.questionMessageIds[q.id] = msgOut.id;
      updateSession(session);
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


  // ── custom_option_modal — "Custom" dropdown freeform description ──────────
  if (customId.startsWith("custom_option_modal:")) {
    const questionId = customId.slice(20);
    const session = getSession(user.id);
    if (!session || !questionId) return;

    const value = interaction.fields.getTextInputValue("custom_value").trim();
    if (!value) return;

    // Store as "Custom: <their description>" so the review is clear
    session.answers[questionId] = `Custom: ${value}`;

    const questions = getQuestionsForRoles(session.roles, session.answers);
    const currentIndex = questions.findIndex((q) => q.id === questionId);

    // Edit the original question message to green answered state
    const dm = await user.createDM();
    const msgId = session.questionMessageIds?.[questionId];
    if (msgId && currentIndex >= 0) {
      const q = questions[currentIndex]!;
      await updateQuestionToAnswered(dm, msgId, q, session.answers[questionId]!, currentIndex, questions.length);
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

  // ── moderation_fix_modal — apply fixes and rerun review ──────────────────
  if (customId === "moderation_fix_modal") {
    const session = getSession(user.id);
    if (!session) return;

    const flags = (session as any).moderationFlags as { questionId: string; label: string }[] | undefined ?? [];

    // Apply updated values for each flagged field
    for (const flag of flags) {
      try {
        const val = interaction.fields.getTextInputValue(`fix_field:${flag.questionId}`).trim();
        if (val) session.answers[flag.questionId] = val;
      } catch {}
    }

    // Clear stored flags — the review will re-moderate fresh
    (session as any).moderationFlags = undefined;
    updateSession(session);

    await interaction.deferUpdate();
    const dm = await user.createDM();
    // sendReviewEmbed will re-run moderation on the updated answers
    const msg = await sendReviewEmbed(dm, session, !session.finalEditUsed);
    session.reviewMessageId = msg.id;
    updateSession(session);
    return;
  }
}
