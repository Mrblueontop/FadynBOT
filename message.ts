import { type Message, ChannelType } from "discord.js";
import { getSession, updateSession } from "./data.js";
import { getQuestionsForRoles } from "./questions.js";
import { askQuestion, sendReviewEmbed, sendPortfolioAddMorePrompt } from "./flows.js";

export async function handleMessage(message: Message): Promise<void> {
  // Only handle DMs
  if (message.channel.type !== ChannelType.DM) return;

  const session = getSession(message.author.id);
  if (!session) return;
  if (session.step !== "answering" && session.step !== "editing_from_review") return;

  const questions = getQuestionsForRoles(session.roles, session.answers);

  const isEditing = session.step === "editing_from_review";
  const currentIndex = isEditing
    ? questions.findIndex((q) => q.id === session.editingQuestionId)
    : session.currentQuestionIndex;

  if (currentIndex < 0) return;
  const currentQ = questions[currentIndex];
  if (!currentQ) return;

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
      return;
    }
  }

  // Handle media collection (acceptMedia) — multi-upload flow
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

  session.answers[currentQ.id] = answer;

  if (isEditing) {
    session.step = "review";
    session.editingQuestionId = undefined;
    updateSession(session);
    const msg = await sendReviewEmbed(message.channel as any, session, !session.finalEditUsed);
    session.reviewMessageId = msg.id;
    updateSession(session);
    return;
  }

  const next = currentIndex + 1;
  if (next >= questions.length) {
    session.step = "review";
    updateSession(session);
    const msg = await sendReviewEmbed(message.channel as any, session, !session.finalEditUsed);
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
