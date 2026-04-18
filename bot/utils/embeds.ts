import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ColorResolvable,
} from "discord.js";
import { ROLE_NAMES, READY_BUTTON_PREFIX, WAVE_DURATION_MS } from "@/bot/constants";

// ── Wave announcement ─────────────────────────────────────────────────────────

export interface WaveEmbedOptions {
  teamName: string;
  neededRole: number;
  waveNumber: number;
  totalPinged: number;
  waveId: string;
  endsAt: Date;
}

export function buildWaveEmbed(opts: WaveEmbedOptions): EmbedBuilder {
  const roleName = ROLE_NAMES[opts.neededRole] ?? `Роль ${opts.neededRole}`;
  const durationMin = Math.round(WAVE_DURATION_MS / 60_000);

  return new EmbedBuilder()
    .setColor(0x1976d2)
    .setTitle("🔄 Поиск замены")
    .addFields(
      { name: "Команда", value: opts.teamName, inline: true },
      { name: "Нужная роль", value: roleName, inline: true },
      { name: "Волна", value: `#${opts.waveNumber}`, inline: true },
      { name: "Откликов ждём от", value: `${opts.totalPinged} игроков`, inline: true },
      {
        name: "Время на ответ",
        value: `<t:${Math.floor(opts.endsAt.getTime() / 1000)}:R> (${durationMin} мин)`,
        inline: true,
      }
    )
    .setFooter({ text: "Нажмите «Готов», если вы можете сыграть за эту команду." })
    .setTimestamp();
}

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

// ── Wave result ───────────────────────────────────────────────────────────────

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
  const subScoreDisplay = opts.subScore.toFixed(3);
  const playerMention = opts.discordId ? `<@${opts.discordId}>` : `**${opts.nick}**`;

  return new EmbedBuilder()
    .setColor(0x388e3c as ColorResolvable)
    .setTitle("✅ Замена найдена")
    .setDescription(
      `${playerMention} теперь новый игрок команды **${opts.teamName}**. GLHF! 🎮`
    )
    .addFields(
      { name: "MMR", value: String(opts.mmr), inline: true },
      { name: "SubScore", value: subScoreDisplay, inline: true },
      { name: "Фит по роли", value: `${roleFitPct}%`, inline: true },
      { name: "Pool Entry ID", value: `\`${opts.poolEntryId}\``, inline: false }
    )
    .setFooter({ text: "Подтвердите замену через admin-панель или /assign." })
    .setTimestamp();
}

export function buildNoResponseEmbed(teamName: string, waveNumber: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0xf57c00 as ColorResolvable)
    .setTitle("⏳ Нет ответов")
    .setDescription(
      `Никто не откликнулся в волне #${waveNumber} для команды **${teamName}**.\nПереходим к следующей волне…`
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
