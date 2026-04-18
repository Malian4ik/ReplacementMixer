import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { prisma } from "@/lib/prisma";
import { createSearchSession } from "@/services/search-session.service";
import { startWave } from "@/bot/workers/wave-orchestrator";
import { log } from "@/bot/utils/logger";
import { ROLE_NAMES } from "@/bot/constants";

export const data = new SlashCommandBuilder()
  .setName("search-substitution")
  .setDescription("Запустить поиск замены для команды")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption((o) =>
    o.setName("team").setDescription("Название команды").setRequired(true)
  )
  .addIntegerOption((o) =>
    o
      .setName("role")
      .setDescription("Нужная роль (1–5)")
      .setRequired(true)
      .addChoices(
        { name: "1 — Carry", value: 1 },
        { name: "2 — Mid", value: 2 },
        { name: "3 — Offlane", value: 3 },
        { name: "4 — Soft Support", value: 4 },
        { name: "5 — Hard Support", value: 5 }
      )
  )
  .addStringOption((o) =>
    o
      .setName("replaced-player")
      .setDescription("Ник заменяемого игрока (оставьте пустым для добавления в пустой слот)")
      .setRequired(false)
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply();

  const teamName = interaction.options.getString("team", true).trim();
  const neededRole = interaction.options.getInteger("role", true);
  const replacedNick = interaction.options.getString("replaced-player")?.trim() ?? null;

  // ── Look up team ──────────────────────────────────────────────────────────
  const team = await prisma.team.findUnique({ where: { name: teamName } });
  if (!team) {
    await interaction.editReply(`❌ Команда **${teamName}** не найдена в базе данных.`);
    return;
  }

  // ── Look up replaced player (if specified) ────────────────────────────────
  let replacedPlayer: { id: string; nick: string; mmr: number } | null = null;
  if (replacedNick) {
    replacedPlayer = await prisma.player.findUnique({
      where: { nick: replacedNick },
      select: { id: true, nick: true, mmr: true },
    });
    if (!replacedPlayer) {
      await interaction.editReply(`❌ Игрок **${replacedNick}** не найден в базе данных.`);
      return;
    }
  }

  // ── Calculate team MMR context ────────────────────────────────────────────
  const playerIds = [
    team.player1Id,
    team.player2Id,
    team.player3Id,
    team.player4Id,
    team.player5Id,
  ].filter((id): id is string => !!id);

  const players = await prisma.player.findMany({
    where: { id: { in: playerIds } },
    select: { mmr: true },
  });

  const currentPlayerCount = players.length;
  const currentTeamAvgMmr =
    currentPlayerCount > 0
      ? Math.round(players.reduce((s, p) => s + p.mmr, 0) / currentPlayerCount)
      : 0;

  // Global target avg MMR across all teams
  const allTeams = await prisma.team.findMany();
  const allPlayerIds = [
    ...new Set(
      allTeams.flatMap((t) =>
        [t.player1Id, t.player2Id, t.player3Id, t.player4Id, t.player5Id].filter(
          (id): id is string => !!id
        )
      )
    ),
  ];
  const allPlayers = await prisma.player.findMany({
    where: { id: { in: allPlayerIds } },
    select: { mmr: true },
  });
  const targetAvgMmr =
    allPlayers.length > 0
      ? Math.round(allPlayers.reduce((s, p) => s + p.mmr, 0) / allPlayers.length)
      : 9000;

  // ── Create session ────────────────────────────────────────────────────────
  let session: { id: string };
  try {
    session = await createSearchSession({
      teamId: team.id,
      teamName: team.name,
      neededRole,
      replacedPlayerId: replacedPlayer?.id,
      replacedPlayerNick: replacedPlayer?.nick,
      replacedPlayerMmr: replacedPlayer?.mmr,
      currentPlayerCount,
      currentTeamAvgMmr,
      targetAvgMmr,
      maxDeviation: 800,
      triggeredBy: interaction.user.id,
      guildId: interaction.guildId ?? "",
      channelId: interaction.channelId,
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === "DUPLICATE_SESSION") {
      await interaction.editReply(
        `⚠️ Для команды **${teamName}** уже запущен активный поиск замены. Отмените его через \`/cancel-search\`.`
      );
      return;
    }
    log.error("Failed to create search session", err);
    await interaction.editReply("❌ Не удалось создать сессию поиска. Проверьте логи.");
    return;
  }

  const roleName = ROLE_NAMES[neededRole] ?? `роль ${neededRole}`;
  const replacedInfo = replacedPlayer
    ? ` (заменяет **${replacedPlayer.nick}**, MMR ${replacedPlayer.mmr})`
    : " (заполнение пустого слота)";

  log.info("Search session created", {
    sessionId: session.id,
    teamName,
    neededRole,
    replacedPlayer: replacedPlayer?.nick,
    triggeredBy: interaction.user.tag,
  });

  await interaction.editReply(
    `🔍 Начинаю поиск замены для **${teamName}**\nРоль: **${roleName}**${replacedInfo}\nСессия: \`${session.id}\``
  );

  // ── Start first wave ──────────────────────────────────────────────────────
  const started = await startWave(session.id, interaction.client);
  if (!started) {
    await interaction.followUp({
      content: `❌ Нет доступных игроков в очереди замен для команды **${teamName}**.`,
    });
  }
}
