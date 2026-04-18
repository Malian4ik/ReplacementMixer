import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { prisma } from "@/lib/prisma";
import { log } from "@/bot/utils/logger";

export const data = new SlashCommandBuilder()
  .setName("unlink-player")
  .setDescription("Отвязать Discord аккаунт от профиля игрока")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((o) =>
    o.setName("user").setDescription("Discord пользователь для отвязки").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const targetUser = interaction.options.getUser("user", true);

  const player = await prisma.player.findFirst({
    where: { discordId: targetUser.id },
  });
  if (!player) {
    await interaction.editReply(
      `ℹ️ <@${targetUser.id}> не привязан ни к одному игроку.`
    );
    return;
  }

  await prisma.player.update({
    where: { id: player.id },
    data: { discordId: null },
  });

  log.info(`Discord link removed`, {
    discordId: targetUser.id,
    playerId: player.id,
    nick: player.nick,
    by: interaction.user.tag,
  });

  await interaction.editReply(
    `✅ <@${targetUser.id}> отвязан от игрока **${player.nick}**.`
  );
}
