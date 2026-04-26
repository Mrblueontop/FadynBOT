import { type Message, ChannelType } from "discord.js";
import { getSession, updateSession } from "./data.js";
import { getQuestionsForRoles } from "./questions.js";
import { askQuestion, sendReviewEmbed, sendPortfolioAddMorePrompt, updateQuestionToAnswered, buildCloseConfirmPayload } from "./flows.js";

export async function handleMessage(message: Message): Promise<void> {
  // Only handle DMs
  if (message.channel.type !== ChannelType.DM) return;

  const session = getSession(message.author.id);
  if (!session) return;
  if (session.step !== "answering" && session.step !== "editing_from_review") return;

  // ── Close / cancel keyword detection ────────────────────────────────────
  const CLOSE_KEYWORDS = /^\s*(end|close|cancel)\s*$/i;
  if (CLOSE_KEYWORDS.test(message.content.trim())) {
    await message.channel.send(buildCloseConfirmPayload());
    return;
  }

  const questions = getQuestionsForRoles(session.roles, session.answers);

  const isEditing = session.step === "editing_from_review";
  const currentIndex = isEditing
    ? questions.findIndex((q) => q.id === session.editingQuestionId)
    : session.currentQuestionIndex;

  if (currentIndex < 0) return;
  const currentQ = questions[currentIndex];
  if (!currentQ) return;

  // ── Reply-only enforcement ───────────────────────────────────────────────
  const expectedMsgId = session.questionMessageIds?.[currentQ.id];
  if (expectedMsgId && message.reference?.messageId !== expectedMsgId) return;

  // Only handle text/image/media/link type questions via message
  const kind = currentQ.answerType.kind;
  if (kind !== "text" && kind !== "image" && kind !== "media" && kind !== "link") return;

  let answer = message.content.trim();

  // Handle media/image attachments
  if (kind === "image" || kind === "media") {
    const attachments = [...message.attachments.values()];
    const urls = attachments.map((a) => a.url);
    if (answer) urls.push(answer);
    answer = urls.join("\n") || answer;
  }

  // Handle optional questions with N/A
  if (!answer) {
    if ((currentQ.answerType as any).optional) {
      answer = "N/A";
    } else {
      // Required — reject empty answers
      await message.reply({
        content: "⚠️ This field is required. Please provide an answer before continuing.",
      }).catch(() => {});
      return;
    }
  }

  // ── Character limit validation ────────────────────────────────────────────
  if (kind === "text" && answer !== "N/A") {
    const type = currentQ.answerType as { kind: "text"; minLength?: number; maxLength?: number; optional?: boolean };
    if (type.minLength && answer.length < type.minLength) {
      await message.reply({
        content: `⚠️ Your answer is too short! Please write at least **${type.minLength}** characters (you wrote **${answer.length}**).`,
      }).catch(() => {});
      return;
    }
    if (type.maxLength && answer.length > type.maxLength) {
      await message.reply({
        content: `⚠️ Your answer is too long! Please keep it under **${type.maxLength}** characters (you wrote **${answer.length}**).`,
      }).catch(() => {});
      return;
    }
  }

  // Handle media collection (acceptMedia) — multi-upload flow (references + assets)
  if (kind === "text" && (currentQ.answerType as any).acceptMedia) {
    const attachments = [...message.attachments.values()];
    if (attachments.length > 0) {
      const existing = session.answers[currentQ.id] ? session.answers[currentQ.id].split("\n") : [];
      const newItems = attachments.map((a) => a.url);
      if (answer && !attachments.some((a) => a.url === answer)) newItems.unshift(answer);
      const combined = [...existing, ...newItems];
      session.answers[currentQ.id] = combined.join("\n");
      updateSession(session);

      if (combined.length < 5) {
        await sendPortfolioAddMorePrompt(message.channel as any, combined.length);
        return;
      }
      answer = combined.join("\n");
    }
  }

  // ── Reference question: image or URL required ─────────────────────────────
  if (currentQ.id === "reference") {
    const hasAttachment = message.attachments.size > 0;
    const isUrl = /^https?:\/\//i.test(answer);
    if (!hasAttachment && !isUrl) {
      await message.reply({
        content: "⚠️ A reference is required. Please upload an image or paste a direct image/link URL.",
      }).catch(() => {});
      return;
    }
  }

  // ── Assets question: require image or URL if they said Yes ───────────────
  if (currentQ.id === "assetFiles") {
    const hasAttachment = message.attachments.size > 0;
    const isUrl = /^https?:\/\//i.test(answer);
    if (!hasAttachment && !isUrl) {
      await message.reply({
        content: "⚠️ Please upload an image/file or paste a direct URL for your assets.",
      }).catch(() => {});
      return;
    }
  }

  session.answers[currentQ.id] = answer;

  // ── Edit the original question message in-place ───────────────────────────
  const msgId = session.questionMessageIds?.[currentQ.id];
  if (msgId) {
    await updateQuestionToAnswered(message.channel as any, msgId, currentQ, answer, currentIndex, questions.length);
  }

  if (isEditing) {
    session.step = "review";
    session.editingQuestionId = undefined;
    updateSession(session);
    const msg = await sendReviewEmbed(message.channel as any, session);
    session.reviewMessageId = msg.id;
    updateSession(session);
    return;
  }

  const next = currentIndex + 1;
  if (next >= questions.length) {
    session.step = "review";
    updateSession(session);
    const msg = await sendReviewEmbed(message.channel as any, session);
    session.reviewMessageId = msg.id;
    updateSession(session);
  } else {
    session.currentQuestionIndex = next;
    updateSession(session);
    const q = questions[next]!;
    const msgOut = await askQuestion(message.channel as any, q, next, questions.length, session);
    if (!session.questionMessageIds) session.questionMessageIds = {};
    session.questionMessageIds[q.id] = msgOut.id;
    updateSession(session);
  }
}
