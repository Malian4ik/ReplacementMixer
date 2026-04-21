import type { Client } from "discord.js";
import { prisma } from "@/lib/prisma";
import { log } from "@/bot/utils/logger";

/**
 * Checks if a string looks like a Discord numeric snowflake ID.
 */
export function isNumericId(id: string): boolean {
  return /^\d{17,20}$/.test(id);
}

/**
 * Resolves a Discord identifier (username or numeric ID) to a numeric user ID.
 *
 * - If `rawId` is already numeric → returns as-is.
 * - If `rawId` is a username → searches guild members, returns numeric ID.
 * - On success, updates the Player DB record with the numeric ID (one-time migration).
 *
 * Returns null if resolution fails.
 */
export async function resolveToNumericId(
  rawId: string,
  playerId: string | null,
  client: Client
): Promise<string | null> {
  if (!rawId) return null;

  // Already a numeric snowflake — use directly
  if (isNumericId(rawId)) return rawId;

  // Search guild by username
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) {
    log.warn("DISCORD_GUILD_ID not set — cannot resolve Discord username");
    return null;
  }

  try {
    const guild = await client.guilds.fetch(guildId);
    const members = await guild.members.search({ query: rawId, limit: 10 });

    // Find exact match by username or display name (case-insensitive)
    const match = members.find(
      (m) =>
        m.user.username.toLowerCase() === rawId.toLowerCase() ||
        (m.user.globalName ?? "").toLowerCase() === rawId.toLowerCase() ||
        m.displayName.toLowerCase() === rawId.toLowerCase()
    );

    if (!match) {
      log.debug(`Discord username "${rawId}" not found in guild`);
      return null;
    }

    const numericId = match.user.id;
    log.info(`Resolved Discord username "${rawId}" → ${numericId}`);

    // Update DB so future lookups use numeric ID
    if (playerId) {
      await prisma.player
        .update({ where: { id: playerId }, data: { discordId: numericId } })
        .catch((err) => log.warn(`Failed to update discordId for player ${playerId}`, err));
    }

    return numericId;
  } catch (err) {
    log.warn(`Error resolving Discord username "${rawId}"`, err);
    return null;
  }
}
