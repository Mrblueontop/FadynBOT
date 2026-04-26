import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActivityType,
  type Guild,
} from "discord.js";

export const config = {
  applicationChannelId: process.env.APPLICATION_CHANNEL_ID ?? "",
  logChannelId: process.env.LOG_CHANNEL_ID ?? "",
  moderationLogChannelId: "1490248802177913022",
  robloxGroupId: parseInt(process.env.ROBLOX_GROUP_ID ?? "0"),
  robloxGroupUrl: process.env.ROBLOX_GROUP_URL ?? "https://www.roblox.com/groups/",
  ownerId: process.env.OWNER_ID ?? "1466945309258289468",
  blacklistRoleId: process.env.BLACKLIST_ROLE_ID ?? "1490909687569317918",
  developerRoleId: process.env.DEVELOPER_ROLE_ID ?? "",
  ticketCategoryName: process.env.TICKET_CATEGORY_NAME ?? "Commissions",
  /**
   * The Discord category ID under which commission ticket channels are created.
   * Set TICKET_CATEGORY_ID in your .env.
   * If left blank the ticket channel will be created at the top level.
   */
  ticketCategoryId: process.env.TICKET_CATEGORY_ID ?? "",
  unverifiedRoleId: process.env.UNVERIFIED_ROLE ?? "",
  verifiedRoleId: process.env.VERIFIED_ROLE_ID ?? "",
  safeRoles: (process.env.SAFE_ROLES ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  verificationChannelId: process.env.VERIFICATION_CHANNEL_ID ?? "",
};

export interface StatusEntry {
  name: string;
  type: ActivityType;
}

const roleStatuses: StatusEntry[] = [
  { name: "Assigning dev tasks…", type: ActivityType.Watching },
  { name: "Cooking new features 🍳", type: ActivityType.Watching },
  { name: "Smashing bugs (maybe) 🐛", type: ActivityType.Playing },
  { name: "Minecraft models in Roblox? 🤔🧱", type: ActivityType.Watching },
  { name: "Tag you're it", type: ActivityType.Playing },
];

const generalStatuses: StatusEntry[] = [
  { name: "Glowtag is coming… 👀", type: ActivityType.Watching },
  { name: "500 players on release? 🤨", type: ActivityType.Watching },
  { name: "The glow is REAL ✨", type: ActivityType.Playing },
  { name: "Building the future of Glowtag 🔧", type: ActivityType.Playing },
  { name: "This game gonna go CRAZY 🔥", type: ActivityType.Playing },
  { name: "You ready for Glowtag? 😂", type: ActivityType.Watching },
  { name: "glow tagging again…", type: ActivityType.Playing },
  { name: "bro just got tagged 💀", type: ActivityType.Watching },
  { name: "who turned off the lights 😭", type: ActivityType.Watching },
  { name: "stop hiding I see you", type: ActivityType.Watching },
  { name: "still better than your aim 🤭", type: ActivityType.Playing },
  { name: "glowing > skill", type: ActivityType.Playing },
  { name: "Apply to be a tester soon 👇", type: ActivityType.Watching },
  { name: "Glowtag releasing soon…", type: ActivityType.Watching },
  { name: "Don't miss release 🚨", type: ActivityType.Watching },
  { name: "Join before it blows up 💥", type: ActivityType.Watching },
  { name: "Early testers = OG 👑", type: ActivityType.Watching },
  { name: "You in or what?", type: ActivityType.Watching },
];

export const ALL_STATUSES: StatusEntry[] = [...roleStatuses, ...generalStatuses];

export function getShuffledStatuses(): StatusEntry[] {
  const arr = [...ALL_STATUSES];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export interface RoleEntry {
  discordRoleId: string;
  max: number;
  label: string;
}

export const ROLE_CONFIG: Record<string, RoleEntry> = {
  scripter:   { discordRoleId: "1490909683509100656", max: 2, label: "Scripter" },
  builder:    { discordRoleId: "1490909684176257044", max: 2, label: "Builder" },
  modeler:    { discordRoleId: "1490909685002276975", max: 1, label: "Modeler" },
  vfxArtist:  { discordRoleId: "1490909685555920956", max: 1, label: "VFX Artist" },
  uiImporter: { discordRoleId: "1490909686118092820", max: 1, label: "UI Importer" },
  r6Animator: { discordRoleId: "1490909686914875422", max: 1, label: "R6 Animator" },
};

export interface RoleCounts {
  [roleKey: string]: { current: number; max: number; label: string; full: boolean };
}

export async function fetchRoleCounts(guild: Guild): Promise<RoleCounts> {
  try {
    await guild.members.fetch();
  } catch {}

  const counts: RoleCounts = {};
  for (const [key, entry] of Object.entries(ROLE_CONFIG)) {
    const role = guild.roles.cache.get(entry.discordRoleId);
    const current = role?.members.size ?? 0;
    counts[key] = {
      current,
      max: entry.max,
      label: entry.label,
      full: current >= entry.max,
    };
  }
  return counts;
}

export function buildApplicationEmbedPayload(_counts: RoleCounts) {
  const embed = new EmbedBuilder()
    .setTitle("🎨 UI Commission Requests — Open!")
    .setDescription(
      [
        "## 📋 What We Offer",
        "Professional Roblox UI design and implementation — HUDs, menus, shops, scoreboards, and more.",
        "",
        "## 📝 How to Request",
        "Hit the button below — the bot will DM you a short form to fill out.",
        "",
        "## ⚠️ Notes",
        "Please have **reference images or a clear vision** ready before applying. All requests are reviewed before work begins.",
      ].join("\n")
    )
    .setColor(0x9b59b6)
    .setFooter({ text: "UI Commissions • Click below to get started" })
    .setTimestamp();

  const button = new ButtonBuilder()
    .setCustomId("apply_start")
    .setLabel("Request a Commission")
    .setStyle(ButtonStyle.Success)
    .setEmoji("📩");

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);
  return { embeds: [embed], components: [row] };
}

export async function buildApplicationEmbed(guild: Guild) {
  const counts = await fetchRoleCounts(guild);
  return buildApplicationEmbedPayload(counts);
}
