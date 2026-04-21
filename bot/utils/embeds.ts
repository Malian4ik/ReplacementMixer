import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ColorResolvable,
} from "discord.js";
import { ROLE_NAMES, READY_BUTTON_PREFIX, SESSION_DURATION_MS } from "@/bot/constants";

// ── Initial search announcement ───────────────────────────────────────────────

export interface SearchEmbedOptions {
  teamName: string;
  /** All role numbers needed (one per slot). */
  neededRoles: number[];
  totalPinged: number;
  waveId: string;
  endsAt: Date;
  /** Optional: "Team A vs Team B · Round N" */
  matchInfo?: string;
}

export function buildSearchEmbed(opts: SearchEmbedOptions): EmbedBuilder {
  const roleList = opts.neededRoles
    .map((r) => ROLE_NAMES[r] ?? `Роль ${r}`)
    .join(" · ");
  const durationMin = Math.round(SESSION_DURATION_MS / 60_000);
  const slotsLabel = opts.neededRoles.length === 1 ? "1 замена" : `${opts.neededRoles.length} замены`;

  const fields = [
    { name: "Команда", value: opts.teamName, inline: true },
    { name: "Нужно", value: slotsLabel, inline: true },
    { name: "Роли", value: roleList, inline: true },
    { name: "Пингуем", value: `${opts.totalPinged} игроков`, inline: true },
    {
      name: "Автоназначение через",
      value: `<t:${Math.floor(opts.endsAt.getTime() / 1000)}:R> (${durationMin} мин)`,
      inline: true,
    },
  ];

  if (opts.matchInfo) {
    fields.push({ name: "Матч", value: opts.matchInfo, inline: false });
  }

  return new EmbedBuilder()
    .setColor(0x1976d2)
    .setTitle("🔄 Поиск замены")
    .addFields(...fields)
    .setFooter({ text: "Нажмите «Готов», если вы можете сыграть за эту команду." })
    .setTimestamp();
}

// ── Backward-compat alias (old code passes WaveEmbedOptions) ─────────────────

export interface WaveEmbedOptions {
  teamName: string;
  neededRole: number;
  waveNumber: number;
  totalPinged: number;
  waveId: string;
  endsAt: Date;
  matchInfo?: string;
}

export function buildWaveEmbed(opts: WaveEmbedOptions): EmbedBuilder {
  return buildSearchEmbed({
    teamName: opts.teamName,
    neededRoles: [opts.neededRole],
    totalPinged: opts.totalPinged,
    waveId: opts.waveId,
    endsAt: opts.endsAt,
    matchInfo: opts.matchInfo,
  });
}

// ── Buttons ───────────────────────────────────────────────────────────────────

export function buildReadyButton(waveId: string): ActionRowBuilder<ButtonBuilder> {
  const button = new ButtonBuilder()
    .setCustomId(`${READY_BUTTON_PREFIX}:${waveId}`)
    .setLabel("Готов")
    .setStyle(ButtonStyle.Success)
    .setEmoji("✅");

  return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

export function buildDisabledReadyButton(): ActionRowBuilder<ButtonBuilder> {
  const button = new ButtonBuilder()
    .setCustomId("ready:expired")
    .setLabel("Готов")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("🔒")
    .setDisabled(true);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(button);
}

// ── Re-ping message ───────────────────────────────────────────────────────────

export interface RePingEmbedOptions {
  teamName: string;
  slotsNeeded: number;
  minutesLeft: number;
  notYetResponded: number;
}

export function buildRePingEmbed(opts: RePingEmbedOptions): EmbedBuilder {
  const slotsLabel = opts.slotsNeeded === 1 ? "1 замена" : `${opts.slotsNeeded} замены`;
  return new EmbedBuilder()
    .setColor(0xf57c00 as ColorResolvable)
    .setTitle(`🔔 Напоминание (${opts.minutesLeft} мин осталось)`)
    .setDescription(
      `Нужно **${slotsLabel}** в состав **${opts.teamName}**.\n` +
      `Ещё не откликнулись: **${opts.notYetResponded}** игроков.`
    )
    .setTimestamp();
}

// ── Completion message (multiple winners) ─────────────────────────────────────

export interface CompletionWinner {
  nick: string;
  mmr: number;
  subScore: number;
  discordId: string | null;
  resolvedMention: string;
}

export function buildCompletionEmbed(opts: {
  teamName: string;
  winners: CompletionWinner[];
}): EmbedBuilder {
  const lines = opts.winners.map(
    (w, i) =>
      `**${i + 1}.** ${w.resolvedMention} — MMR ${w.mmr} (score: ${w.subScore.toFixed(3)})`
  );

  return new EmbedBuilder()
    .setColor(0x388e3c as ColorResolvable)
    .setTitle("✅ Замены назначены")
    .setDescription(
      `Команда **${opts.teamName}** получает новых игроков:\n\n${lines.join("\n")}`
    )
    .setTimestamp();
}

// ── Single-winner embed (backward compat) ─────────────────────────────────────

export interface WinnerEmbedOptions {
  teamName: string;
  nick: string;
  mmr: number;
  subScore: number;
  roleFit: number;
  poolEntryId: string;
  discordId: string | null;
}

export function buildWinnerEmbed(opts: WinnerEmbedOptions): EmbedBuilder {
  const roleFitPct = Math.round(opts.roleFit * 100);
  const playerMention = opts.discordId ? `<@${opts.discordId}>` : `**${opts.nick}**`;

  return new EmbedBuilder()
    .setColor(0x388e3c as ColorResolvable)
    .setTitle("✅ Замена найдена")
    .setDescription(
      `${playerMention} теперь новый игрок команды **${opts.teamName}**. GLHF! 🎮`
    )
    .addFields(
      { name: "MMR", value: String(opts.mmr), inline: true },
      { name: "SubScore", value: opts.subScore.toFixed(3), inline: true },
      { name: "Фит по роли", value: `${roleFitPct}%`, inline: true },
      { name: "Pool Entry ID", value: `\`${opts.poolEntryId}\``, inline: false }
    )
    .setTimestamp();
}

// ── Status embeds ─────────────────────────────────────────────────────────────

export function buildNoResponseEmbed(teamName: string, waveNumber: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xf57c00 as ColorResolvable)
    .setTitle("⏳ Нет ответов")
    .setDescription(
      `Никто не откликнулся за 20 минут для команды **${teamName}** (сессия #${waveNumber}).`
    )
    .setTimestamp();
}

export function buildExhaustedEmbed(teamName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xc62828 as ColorResolvable)
    .setTitle("❌ Очередь исчерпана")
    .setDescription(
      `Не удалось найти замену для команды **${teamName}**.\nВсе доступные игроки в резерве были опрошены.`
    )
    .setTimestamp();
}

export function buildCancelledEmbed(teamName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x757575 as ColorResolvable)
    .setTitle("🚫 Поиск отменён")
    .setDescription(`Поиск замены для команды **${teamName}** был отменён администратором.`)
    .setTimestamp();
}
