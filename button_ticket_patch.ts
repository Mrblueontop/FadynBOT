// ─────────────────────────────────────────────────────────────────────────────
// PATCH: Add this block inside handleButton() in button.ts, alongside the
//        other `if (prefix === "...")` blocks.
//
// Handles the "Close Ticket" button that appears inside commission ticket channels.
// When clicked, sends a closing embed and then deletes the channel after 5 seconds.
// Only admins (ManageChannels permission) can use this button.
// ─────────────────────────────────────────────────────────────────────────────

  if (prefix === "ticket") {
    const action = rest[0]; // "close"

    if (action === "close") {
      // Require ManageChannels (or Administrator) to close
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
        await interaction.reply({
          content: "Only staff can close tickets.",
          ephemeral: true,
        });
        return;
      }

      const targetUserId = rest[1]; // userId embedded in the customId

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔒 Ticket Closing")
            .setDescription(
              `This ticket is being closed by <@${interaction.user.id}>.\n\nThe channel will be deleted in **5 seconds**.`
            )
            .setColor(0xe74c3c),
        ],
      });

      // Optionally DM the applicant
      if (targetUserId) {
        try {
          const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
          if (targetUser) {
            const dm = await targetUser.createDM().catch(() => null);
            if (dm) {
              await dm.send({
                embeds: [
                  new EmbedBuilder()
                    .setTitle("Ticket Closed")
                    .setDescription(
                      "Your commission ticket has been closed by the team. If you have further questions, feel free to open a new commission request!"
                    )
                    .setColor(0xe67e22),
                ],
              }).catch(() => {});
            }
          }
        } catch {}
      }

      // Delete the channel after a short delay
      setTimeout(async () => {
        try {
          await interaction.channel?.delete("Ticket closed by staff");
        } catch (err) {
          console.error("[ticket:close] Failed to delete channel:", err);
        }
      }, 5000);

      return;
    }
  }

// ─────────────────────────────────────────────────────────────────────────────
// Don't forget to add PermissionFlagsBits to the discord.js import at the top
// of button.ts if it isn't already there:
//
//   import { ..., PermissionFlagsBits } from "discord.js";
// ─────────────────────────────────────────────────────────────────────────────
