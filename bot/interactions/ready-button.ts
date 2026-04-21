import type { ButtonInteraction } from "discord.js";
import { recordReadyResponse } from "@/services/wave.service";
import { log } from "@/bot/utils/logger";
import { READY_BUTTON_PREFIX } from "@/bot/constants";

/**
 * Returns true if the interaction is a "Готов" button click we should handle.
 */
export function isReadyButton(customId: string): boolean {
  return customId.startsWith(`${READY_BUTTON_PREFIX}:`);
}

/**
 * Handles a "Готов" button click.
 * - Resolves Discord user → platform player via discordId.
 * - Records the response (idempotent: second click is silently ignored).
 * - Replies ephemerally so other users don't see individual confirmations.
 */
export async function handleReadyButton(interaction: ButtonInteraction): Promise<void> {
  // Defer the reply immediately to avoid the 3-second timeout
  await interaction.deferReply({ ephemeral: true });

  const waveId = interaction.customId.split(":")[1];
  const discordId = interaction.user.id;

  log.debug(`Ready button pressed`, { waveId, discordId, user: interaction.user.tag });

  try {
    await recordReadyResponse(waveId, discordId, interaction.user.username);
    await interaction.editReply({
      content: "✅ **Ваш отклик принят!** Результат будет объявлен по окончании таймера.",
    });
    log.info(`Response recorded`, { waveId, discordId });
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : String(err);
    const reply = errorToUserMessage(code);

    // Already responded is not an error worth logging at warn level
    if (code === "ALREADY_RESPONDED") {
      log.debug(`Duplicate click ignored`, { waveId, discordId });
    } else {
      log.warn(`Ready button error: ${code}`, { waveId, discordId });
    }

    await interaction.editReply({ content: reply });
  }
}

function errorToUserMessage(code: string): string {
  switch (code) {
    case "PLAYER_NOT_LINKED":
      return "❌ Ваш Discord аккаунт не привязан к профилю игрока. Обратитесь к администратору.";
    case "WAVE_NOT_ACTIVE":
      return "⏰ Время для этой волны уже истекло.";
    case "CANDIDATE_NOT_IN_WAVE":
      return "❌ Вас нет в списке кандидатов этой волны.";
    case "PLAYER_NOT_IN_POOL":
      return "❌ Вы больше не находитесь в активном пуле замен.";
    default:
      // "ALREADY_RESPONDED" is handled silently or shown as:
      if (code === "ALREADY_RESPONDED") {
        return "ℹ️ Ваш отклик уже был принят ранее.";
      }
      return "⚠️ Произошла ошибка. Попробуйте позже или обратитесь к администратору.";
  }
}
