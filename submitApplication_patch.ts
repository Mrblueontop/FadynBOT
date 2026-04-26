// ─────────────────────────────────────────────────────────────────────────────
// PATCH: Replace the `submitApplication` export in flows.ts with this version.
//
// Changes from the original:
//   1. Instead of posting to a log channel, creates a private ticket channel
//      under TICKET_CATEGORY_ID.
//   2. The ticket channel is visible only to the applicant + roles with
//      ADMINISTRATOR permission.
//   3. The ticket embed contains every question + answer.
//   4. A "Close Ticket" button is added so staff can delete the channel.
//   5. The applicant receives a DM confirmation as before.
// ─────────────────────────────────────────────────────────────────────────────

import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  type Client,
  type TextChannel,
} from "discord.js";
import { updateSession, type SavedApplication } from "./applicationSession.js";
import { getQuestionsForRoles } from "./questions.js";
import { getUserHeadshot } from "./roblox.js";
import { config } from "./config.js";

// Add TICKET_CATEGORY_ID to your .env / config.  Falls back to no category.
// Add ADMIN_ROLE_ID  to your .env / config if you want a specific role pinged.

export async function submitApplication(
  session: SavedApplication,
  client: Client
): Promise<void> {
  session.step = "submitted";
  updateSession(session);

  const guild = client.guilds.cache.first();
  if (!guild) return;

  // ── Fetch applicant user ──────────────────────────────────────────────────
  const applicantUser = await client.users.fetch(session.userId).catch(() => null);
  const headshotUrl = session.robloxId ? await getUserHeadshot(session.robloxId) : null;
  const questions = getQuestionsForRoles(session.roles);
  const now = Math.floor(Date.now() / 1000);

  // ── Build the application embed ───────────────────────────────────────────
  const embed = new EmbedBuilder()
    .setTitle("📋 Commission Request")
    .setColor(0x9b59b6)
    .setTimestamp();

  if (headshotUrl) {
    embed.setThumbnail(headshotUrl);
  }

  embed.setAuthor({
    name: applicantUser?.tag ?? session.userId,
    iconURL: applicantUser?.displayAvatarURL() ?? undefined,
  });

  for (const q of questions) {
    const answer = session.answers[q.id] ?? "*No answer*";
    embed.addFields({
      name: q.prompt.length > 256 ? q.prompt.slice(0, 253) + "…" : q.prompt,
      value: answer.length > 1024 ? answer.slice(0, 1021) + "…" : answer,
    });
  }

  embed.addFields(
    { name: "Applicant", value: `<@${session.userId}>`, inline: true },
    { name: "Submitted", value: `<t:${now}:F>`, inline: true }
  );

  // ── Close ticket button ───────────────────────────────────────────────────
  const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket:close:${session.userId}`)
      .setLabel("Close Ticket")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("🔒")
  );

  // ── Create the ticket channel ─────────────────────────────────────────────
  try {
    await guild.members.fetch();
  } catch {}

  // Determine admin roles (any role with Administrator permission)
  const adminRoleIds = guild.roles.cache
    .filter((r) => r.permissions.has(PermissionFlagsBits.Administrator))
    .map((r) => r.id);

  // Specific admin role from env (optional, for pinging)
  const pingRoleId: string | undefined = (config as any).adminRoleId ?? process.env.ADMIN_ROLE_ID;

  const channelName = `commission-${(applicantUser?.username ?? session.userId).toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 20)}-${session.userId.slice(-4)}`;

  const permissionOverwrites: any[] = [
    // Deny everyone by default
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    // Allow the applicant
    {
      id: session.userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];

  // Allow each admin role
  for (const roleId of adminRoleIds) {
    permissionOverwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  const categoryId: string | undefined = (config as any).ticketCategoryId ?? process.env.TICKET_CATEGORY_ID;

  const ticketChannel = (await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    ...(categoryId ? { parent: categoryId } : {}),
    permissionOverwrites,
    topic: `Commission request from <@${session.userId}> • Submitted <t:${now}:F>`,
  }).catch((err) => {
    console.error("[submitApplication] Failed to create ticket channel:", err);
    return null;
  })) as TextChannel | null;

  if (!ticketChannel) {
    // Fallback: DM the applicant and bail
    if (applicantUser) {
      const dm = await applicantUser.createDM().catch(() => null);
      if (dm) {
        await dm.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("Application Submitted ✅")
              .setDescription(
                "Your commission request has been received! We ran into a small issue creating your ticket channel, but a staff member will reach out to you shortly."
              )
              .setColor(0x2ecc71),
          ],
        }).catch(() => {});
      }
    }
    return;
  }

  // ── Send the application embed into the ticket ───────────────────────────
  const openingMessage = [
    `Welcome <@${session.userId}>! Your commission request has been received.`,
    "",
    pingRoleId ? `<@&${pingRoleId}> — new commission request!` : "A staff member will review your request shortly.",
    "",
    "📋 **Your application details are below.** Staff will get back to you in this channel.",
  ].join("\n");

  await ticketChannel.send({
    content: openingMessage,
    embeds: [embed],
    components: [closeRow],
  }).catch(() => {});

  // Store ticket channel ID on the session
  session.logThreadId = ticketChannel.id;
  updateSession(session);

  // ── DM the applicant ──────────────────────────────────────────────────────
  if (applicantUser) {
    const dm = await applicantUser.createDM().catch(() => null);
    if (dm) {
      await dm.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("Commission Request Submitted ✅")
            .setDescription(
              [
                "Your commission request has been received!",
                "",
                `A private ticket channel has been created for you: <#${ticketChannel.id}>`,
                "",
                "Head there to chat with the team about your commission. We'll be in touch shortly!",
              ].join("\n")
            )
            .setColor(0x2ecc71),
        ],
      }).catch(() => {});
    }
  }
}
