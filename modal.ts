import { type ModalSubmitInteraction, EmbedBuilder } from "discord.js";
import { getSession, updateSession } from "./data.js";
import { getQuestionsForRoles } from "./questions.js";
import { askQuestion, sendReviewEmbed, buildUiElementsAfterAnswerRow, updateQuestionToAnswered } from "./flows.js";

export async function handleModal(interaction: ModalSubmitInteraction): Promise<void> {
  const { customId, user } = interaction;

  // ── Step 4: UI elements page 1 ───────────────────────────────────────────
  if (customId === "ui_elements_modal:page1") {
    const session = getSession(user.id);
    if (!session) return;

    const fields = ["main_menu", "hud", "shop", "inventory", "settings"];
    const fieldLabels: Record<string, string> = {
      main_menu: "Main Menu",
      hud: "HUD",
      shop: "Shop",
      inventory: "Inventory",
      settings: "Settings",
    };

    const parts: string[] = [];
    for (const f of fields) {
      try {
        const val = interaction.fields.getTextInputValue(f).trim();
        if (val) parts.push(`**${fieldLabels[f]}:** ${val}`);
      } catch {}
    }

    const existing = session.answers["uiRequirementType"] ?? "";
    const p2Marker = existing.includes("--- Page 2 ---") ? existing.split("--- Page 2 ---")[1] : "";
    session.answers["uiRequirementType"] = parts.join("\n") + (p2Marker ? `\n--- Page 2 ---${p2Marker}` : "");
    updateSession(session);

    const summary = parts.length > 0 ? parts.join("\n") : "*Nothing filled in yet.*";

    // Edit the original Step 4 question message in-place
    const dm = await user.createDM();
    const msgId = session.questionMessageIds?.["uiRequirementType"];
    if (msgId) {
      const questions = getQuestionsForRoles(session.roles, session.answers);
      const idx = questions.findIndex((q) => q.id === "uiRequirementType");
      const q = questions[idx];
      if (q && idx >= 0) {
        await updateQuestionToAnswered(dm, msgId, q, session.answers["uiRequirementType"]!, idx, questions.length);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle("📋 Step 4: UI Elements — Page 1 Saved")
      .setDescription(summary)
      .setColor(0x9b59b6)
      .setFooter({ text: "Click Page 2 to add more, Edit to change, or Next to continue" });

    await interaction.reply({
      embeds: [embed],
      components: [buildUiElementsAfterAnswerRow(1)],
      ephemeral: false,
    });
    return;
  }

  // ── Step 4: UI elements page 2 ───────────────────────────────────────────
  if (customId === "ui_elements_modal:page2") {
    const session = getSession(user.id);
    if (!session) return;

    const fields = ["leaderboard", "loading", "cutscene", "notifications", "other"];
    const fieldLabels: Record<string, string> = {
      leaderboard: "Leaderboard",
      loading: "Loading Screen",
      cutscene: "Cutscene UI",
      notifications: "Notifications",
      other: "Other",
    };

    const parts: string[] = [];
    for (const f of fields) {
      try {
        const val = interaction.fields.getTextInputValue(f).trim();
        if (val) parts.push(`**${fieldLabels[f]}:** ${val}`);
      } catch {}
    }

    const existing = session.answers["uiRequirementType"] ?? "";
    const p1Part = existing.includes("--- Page 2 ---") ? existing.split("--- Page 2 ---")[0] : existing;
    const p2Text = parts.length > 0 ? parts.join("\n") : "";
    session.answers["uiRequirementType"] = p1Part + (p2Text ? `\n--- Page 2 ---\n${p2Text}` : "");
    updateSession(session);

    const summary = parts.length > 0 ? parts.join("\n") : "*Nothing filled in on page 2.*";
    const embed = new EmbedBuilder()
      .setTitle("📋 Step 4: UI Elements — Page 2 Saved")
      .setDescription(summary)
      .setColor(0x9b59b6)
      .setFooter({ text: "Click Edit to change page 1, or Next to continue" });

    await interaction.reply({
      embeds: [embed],
      components: [buildUiElementsAfterAnswerRow(2)],
      ephemeral: false,
    });
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

    // Edit original question message in-place
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
