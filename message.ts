import { type Message, ChannelType } from "discord.js";
import { getSession, updateSession } from "./data.js";
import { getQuestionsForRoles } from "./questions.js";
import { askQuestion, sendReviewEmbed, sendPortfolioAddMorePrompt, updateQuestionToAnswered, updateReferenceEmbed, updateAssetEmbed, buildCloseConfirmPayload } from "./flows.js";

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
  // Reference and asset upload questions accept free-sent messages (no reply needed)
  const isFreeUploadQuestion = currentQ.id === "reference" || currentQ.id === "assetFiles";
  const expectedMsgId = session.questionMessageIds?.[currentQ.id];
  if (!isFreeUploadQuestion && expectedMsgId && message.reference?.messageId !== expectedMsgId) return;

  // Only handle text/image/media/link type questions via message
  const kind = currentQ.answerType.kind;
  if (kind !== "text" && kind !== "image" && kind !== "media" && kind !== "link") return;

  // ── Reference question: dedicated multi-file upload flow ──────────────────
  if (currentQ.id === "reference") {
    const MAX_REF = 5;
    const ALLOWED_IMAGE_TYPES = /^image\//;
    const ALLOWED_VIDEO_TYPES = /^video\//;

    const isDoneKeyword = /^\s*done\s*$/i.test(message.content.trim());

    // Collect valid attachments (images + videos only — no links)
    const attachments = [...message.attachments.values()];
    const validAttachments = attachments.filter((a) => {
      const ct = a.contentType ?? "";
      return ALLOWED_IMAGE_TYPES.test(ct) || ALLOWED_VIDEO_TYPES.test(ct);
    });

    const hasInvalidAttachments = attachments.length > 0 && validAttachments.length < attachments.length;
    const hasBareUrl = !attachments.length && /^https?:\/\//i.test(message.content.trim()) && !isDoneKeyword;

    // Reject bare URLs or non-image/video files
    if (hasBareUrl || hasInvalidAttachments) {
      await message.reply({
        content: "⚠️ Only image or video file uploads are accepted for references — no links or other file types. Please upload a file directly.",
      }).catch(() => {});
      return;
    }

    // If no attachments and not "done", ignore silently (stray text)
    if (!validAttachments.length && !isDoneKeyword) return;

    // Load existing files
    const existing = session.answers["reference"] ? session.answers["reference"].split("\n").filter(Boolean) : [];

    // Accumulate new files (respect cap)
    let combined = existing;
    if (validAttachments.length > 0) {
      const newUrls = validAttachments.map((a) => a.url);
      combined = [...existing, ...newUrls].slice(0, MAX_REF);
    }

    // Handle "done" — require at least one file
    if (isDoneKeyword) {
      if (combined.length === 0) {
        await message.reply({
          content: "⚠️ At least one reference image or video is required. Please upload a file before typing **done**.",
        }).catch(() => {});
        return;
      }
      // Advance: mark answered, move to next question
      session.answers["reference"] = combined.join("\n");
      const msgId = session.questionMessageIds?.["reference"];
      if (msgId) {
        await updateQuestionToAnswered(
          message.channel as any,
          msgId,
          currentQ,
          `${combined.length} file${combined.length === 1 ? "" : "s"} uploaded`,
          currentIndex,
          questions.length
        );
      }
      if (isEditing) {
        session.step = "review";
        session.editingQuestionId = undefined;
        updateSession(session);
        const msg = await sendReviewEmbed(message.channel as any, session);
        session.reviewMessageId = msg.id;
        updateSession(session);
      } else {
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
      return;
    }

    // New files uploaded — save and update the embed
    session.answers["reference"] = combined.join("\n");
    updateSession(session);

    const msgId = session.questionMessageIds?.["reference"];
    if (msgId) {
      await updateReferenceEmbed(message.channel as any, msgId, currentIndex, questions.length, combined.length);
    }

    // Auto-advance if cap reached
    if (combined.length >= MAX_REF) {
      session.answers["reference"] = combined.join("\n");
      if (msgId) {
        await updateQuestionToAnswered(
          message.channel as any,
          msgId,
          currentQ,
          `${combined.length} files uploaded`,
          currentIndex,
          questions.length
        );
      }
      if (isEditing) {
        session.step = "review";
        session.editingQuestionId = undefined;
        updateSession(session);
        const msg = await sendReviewEmbed(message.channel as any, session);
        session.reviewMessageId = msg.id;
        updateSession(session);
      } else {
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
    }
    return;
  }

  // ── Asset upload question: dedicated multi-file flow ──────────────────────
  if (currentQ.id === "assetFiles") {
    const MAX_ASSETS = 5;
    const ALLOWED_IMAGE_TYPES = /^image\//;
    const ALLOWED_VIDEO_TYPES = /^video\//;

    const trimmed = message.content.trim();
    const isDoneKeyword = /^\s*done\s*$/i.test(trimmed);
    const isSkipKeyword = /^\s*skip\s*$/i.test(trimmed);

    // Collect valid attachments (images + videos only)
    const attachments = [...message.attachments.values()];
    const validAttachments = attachments.filter((a) => {
      const ct = a.contentType ?? "";
      return ALLOWED_IMAGE_TYPES.test(ct) || ALLOWED_VIDEO_TYPES.test(ct);
    });

    const hasInvalidAttachments = attachments.length > 0 && validAttachments.length < attachments.length;
    const hasBareUrl = !attachments.length && /^https?:\/\//i.test(trimmed) && !isDoneKeyword && !isSkipKeyword;

    // Reject bare URLs or invalid file types
    if (hasBareUrl || hasInvalidAttachments) {
      await message.reply({
        content: "⚠️ Only image or video file uploads are accepted — no links or other file types. Please upload a file directly, or type **skip** to continue.",
      }).catch(() => {});
      return;
    }

    // Ignore stray text (not a keyword, no attachments)
    if (!validAttachments.length && !isDoneKeyword && !isSkipKeyword) return;

    const existing = session.answers["assetFiles"] ? session.answers["assetFiles"].split("\n").filter(Boolean) : [];

    let combined = existing;
    if (validAttachments.length > 0) {
      const newUrls = validAttachments.map((a) => a.url);
      combined = [...existing, ...newUrls].slice(0, MAX_ASSETS);
    }

    // Helper: advance to the next question after assetFiles
    const advanceFromAssets = async () => {
      if (isEditing) {
        session.step = "review";
        session.editingQuestionId = undefined;
        updateSession(session);
        const msg = await sendReviewEmbed(message.channel as any, session);
        session.reviewMessageId = msg.id;
        updateSession(session);
      } else {
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
    };

    // skip keyword — optional, advance with no files
    if (isSkipKeyword) {
      session.answers["assetFiles"] = "N/A";
      const msgId = session.questionMessageIds?.["assetFiles"];
      if (msgId) {
        await updateQuestionToAnswered(message.channel as any, msgId, currentQ, "Skipped", currentIndex, questions.length);
      }
      updateSession(session);
      await advanceFromAssets();
      return;
    }

    // done keyword — require at least one file
    if (isDoneKeyword) {
      if (combined.length === 0) {
        await message.reply({
          content: "⚠️ You haven't uploaded any assets yet. Upload at least one file, or type **skip** to continue without assets.",
        }).catch(() => {});
        return;
      }
      session.answers["assetFiles"] = combined.join("\n");
      const msgId = session.questionMessageIds?.["assetFiles"];
      if (msgId) {
        await updateQuestionToAnswered(
          message.channel as any,
          msgId,
          currentQ,
          `${combined.length} file${combined.length === 1 ? "" : "s"} uploaded`,
          currentIndex,
          questions.length
        );
      }
      updateSession(session);
      await advanceFromAssets();
      return;
    }

    // New valid files — save and update embed
    session.answers["assetFiles"] = combined.join("\n");
    updateSession(session);

    const msgId = session.questionMessageIds?.["assetFiles"];
    if (msgId) {
      await updateAssetEmbed(message.channel as any, msgId, currentIndex, questions.length, combined.length);
    }

    // Auto-advance at cap
    if (combined.length >= MAX_ASSETS) {
      if (msgId) {
        await updateQuestionToAnswered(
          message.channel as any,
          msgId,
          currentQ,
          `${combined.length} files uploaded`,
          currentIndex,
          questions.length
        );
      }
      updateSession(session);
      await advanceFromAssets();
    }
    return;
  }

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
