import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { prisma } from "@/lib/prisma";
import { log } from "@/bot/utils/logger";

export const data = new SlashCommandBuilder()
  .setName("link-player")
  .setDescription("Привязать Discord пользователя к профилю игрока платформы")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((o) =>
    o.setName("user").setDescription("Discord пользователь").setRequired(true)
  )
  .addStringOption((o) =>
    o.setName("nick").setDescription("Ник игрока на платформе").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const targetUser = interaction.options.getUser("user", true);
  const nick = interaction.options.getString("nick", true).trim();

  // Check player exists
  const player = await prisma.player.findUnique({ where: { nick } });
  if (!player) {
    await interaction.editReply(`❌ Игрок с ником **${nick}** не найден.`);
    return;
  }

  // Check if this Discord user is already linked to someone else
  const existingByDiscord = await prisma.player.findFirst({
    where: { discordId: targetUser.id },
  });
  if (existingByDiscord && existingByDiscord.id !== player.id) {
    await interaction.editReply(
      `⚠️ Discord аккаунт <@${targetUser.id}> уже привязан к игроку **${existingByDiscord.nick}**. Сначала отвяжите его через \`/unlink-player\`.`
    );
    return;
  }

  // Check if this player is already linked to a different Discord user
  if (player.discordId && player.discordId !== targetUser.id) {
    await interaction.editReply(
      `⚠️ Игрок **${nick}** уже привязан к другому Discord аккаунту (<@${player.discordId}>). Сначала отвяжите его.`
    );
    return;
  }

  await prisma.player.update({
    where: { id: player.id },
    data: { discordId: targetUser.id },
  });

  log.info(`Discord link created`, {
    discordId: targetUser.id,
    tag: targetUser.tag,
    playerId: player.id,
    nick: player.nick,
    by: interaction.user.tag,
  });

  await interaction.editReply(
    `✅ <@${targetUser.id}> теперь привязан к игроку **${player.nick}** (MMR: ${player.mmr}).`
  );
}
