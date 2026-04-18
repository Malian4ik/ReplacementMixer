import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { prisma } from "@/lib/prisma";
import { cancelSession } from "@/services/search-session.service";
import { cancelWaveTimer } from "@/bot/workers/wave-orchestrator";
import { buildCancelledEmbed } from "@/bot/utils/embeds";
import { log } from "@/bot/utils/logger";

export const data = new SlashCommandBuilder()
  .setName("cancel-search")
  .setDescription("Отменить активный поиск замены для команды")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((o) =>
    o.setName("team").setDescription("Название команды").setRequired(true)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const teamName = interaction.options.getString("team", true).trim();

  const team = await prisma.team.findUnique({ where: { name: teamName } });
  if (!team) {
    await interaction.editReply(`❌ Команда **${teamName}** не найдена.`);
    return;
  }

  const session = await prisma.substitutionSearchSession.findFirst({
    where: { teamId: team.id, status: "Active" },
    include: {
      waves: { where: { status: "Active" }, select: { id: true } },
    },
  });

  if (!session) {
    await interaction.editReply(`ℹ️ Для команды **${teamName}** нет активного поиска.`);
    return;
  }

  // Cancel in-memory timers for active waves
  for (const wave of session.waves) {
    cancelWaveTimer(wave.id);
    await prisma.substitutionWave.update({
      where: { id: wave.id },
      data: { status: "Processing" }, // mark so orchestrator won't process it
    });
  }

  await cancelSession(session.id);

  log.info(`Search session cancelled`, {
    sessionId: session.id,
    teamName,
    by: interaction.user.tag,
  });

  // Announce in the replacements channel
  try {
    const ch = await interaction.client.channels.fetch(session.channelId);
    if (ch?.isTextBased() && "send" in ch) {
      await (ch as { send: (opts: unknown) => Promise<unknown> }).send({
        embeds: [buildCancelledEmbed(teamName)],
      });
    }
  } catch {
    // Not critical
  }

  await interaction.editReply(`✅ Поиск замены для **${teamName}** отменён.`);
}
