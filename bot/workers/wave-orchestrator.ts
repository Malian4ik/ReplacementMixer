import type { Client, TextChannel } from "discord.js";
import { prisma } from "@/lib/prisma";
import { log } from "@/bot/utils/logger";
import {
  claimWaveForProcessing,
  getAllEligiblePlayers,
  createWave,
  setWaveMessageId,
  selectBestNResponders,
  markWaveNoResponse,
  getActiveWavesForRecovery,
} from "@/services/wave.service";
import {
  markSessionCompleted,
  markSessionExhausted,
} from "@/services/search-session.service";
import { assignSubstitution } from "@/services/substitution.service";
import {
  buildSearchEmbed,
  buildReadyButton,
  buildDisabledReadyButton,
  buildRePingEmbed,
  buildCompletionEmbed,
  buildExhaustedEmbed,
  type CompletionWinner,
} from "@/bot/utils/embeds";
import { resolveToNumericId } from "@/bot/utils/discord-resolve";
import { PING_INTERVAL_MS } from "@/lib/substitution-config";

// ── Timer registries ──────────────────────────────────────────────────────────

/** waveId → completion setTimeout handle (fires at t=20 min). */
const completionTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** waveId → array of re-ping setTimeout handles (fires at t=5/10/15 min). */
const rePingTimers = new Map<string, ReturnType<typeof setTimeout>[]>();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Called once on bot startup to resume any waves that were interrupted by a restart.
 */
export async function recoverActiveWaves(client: Client): Promise<void> {
  const waves = await getActiveWavesForRecovery();
  if (waves.length === 0) return;

  log.info(`Recovering ${waves.length} active wave(s) from DB.`);
  for (const wave of waves) {
    const remainingMs = Math.max(0, wave.endsAt.getTime() - Date.now());
    log.info(`  Wave ${wave.id} (session ${wave.sessionId}): ${Math.round(remainingMs / 1000)}s remaining`);
    scheduleCompletionTimer(wave.id, remainingMs, client);

    // Re-schedule any re-pings that haven't fired yet
    const sessionStartMs = wave.startsAt.getTime();
    const totalDurationMs = wave.endsAt.getTime() - sessionStartMs;
    const elapsed = Date.now() - sessionStartMs;

    const numRePings = Math.floor(totalDurationMs / PING_INTERVAL_MS) - 1; // t=5,10,15 (not t=20)
    for (let i = 1; i <= numRePings; i++) {
      const rePingMs = i * PING_INTERVAL_MS - elapsed;
      const minutesLeft = Math.round((totalDurationMs - i * PING_INTERVAL_MS) / 60_000);
      if (rePingMs > 0) {
        scheduleRePing(wave.id, wave.sessionId, rePingMs, minutesLeft, client);
      }
    }
  }
}

/**
 * Starts a new substitution search session:
 * - Pings ALL reserve players at once
 * - Schedules re-pings at +5, +10, +15 min
 * - Schedules auto-assign at +20 min
 * Returns false if queue is empty.
 */
export async function startWave(sessionId: string, client: Client): Promise<boolean> {
  const session = await prisma.substitutionSearchSession.findUnique({
    where: { id: sessionId },
    include: { slots: true },
  });
  if (!session || session.status !== "Active") return false;

  const allPlayers = await getAllEligiblePlayers();

  if (allPlayers.length === 0) {
    await markSessionExhausted(sessionId);
    await postExhaustedMessage(session, client);
    return false;
  }

  const waveNumber = session.currentWave + 1;

  const wave = await createWave({
    sessionId,
    waveNumber,
    channelId: session.channelId,
    candidates: allPlayers.map((e, i) => ({
      poolEntryId: e.id,
      playerId: e.playerId,
      discordId: (e.player as { discordId?: string | null }).discordId ?? null,
      queuePosition: i, // 0-based; scoring converts to 1-based
    })),
  });

  // Collect needed roles from slots (or fall back to session.neededRole)
  const neededRoles =
    session.slots.length > 0
      ? session.slots.map((s) => s.neededRole)
      : [session.neededRole];

  // Post initial Discord message
  const messageId = await postInitialMessage(session, wave, allPlayers, neededRoles, client);
  if (messageId) await setWaveMessageId(wave.id, messageId);

  // Schedule re-pings at t+5, t+10, t+15 min
  const numRePings = Math.floor(wave.endsAt.getTime() - Date.now()) > 3 * PING_INTERVAL_MS ? 3 : 0;
  for (let i = 1; i <= 3; i++) {
    const delay = i * PING_INTERVAL_MS;
    const minutesLeft = Math.round((wave.endsAt.getTime() - Date.now() - delay) / 60_000);
    if (minutesLeft > 0) {
      scheduleRePing(wave.id, sessionId, delay, minutesLeft, client);
    }
  }

  // Schedule completion at wave.endsAt
  scheduleCompletionTimer(wave.id, wave.endsAt.getTime() - Date.now(), client);

  return true;
}

// ── Internal: timers ──────────────────────────────────────────────────────────

function scheduleCompletionTimer(waveId: string, delayMs: number, client: Client): void {
  if (completionTimers.has(waveId)) return;
  const timer = setTimeout(() => processWaveCompletion(waveId, client), Math.max(0, delayMs));
  completionTimers.set(waveId, timer);
}

function scheduleRePing(
  waveId: string,
  sessionId: string,
  delayMs: number,
  minutesLeft: number,
  client: Client
): void {
  const timer = setTimeout(() => sendRePing(waveId, sessionId, minutesLeft, client), delayMs);
  const existing = rePingTimers.get(waveId) ?? [];
  existing.push(timer);
  rePingTimers.set(waveId, existing);
}

async function sendRePing(
  waveId: string,
  sessionId: string,
  minutesLeft: number,
  client: Client
): Promise<void> {
  const session = await prisma.substitutionSearchSession.findUnique({
    where: { id: sessionId },
  });
  if (!session || session.status !== "Active") return;

  // Find players who have NOT yet responded
  const wave = await prisma.substitutionWave.findUnique({
    where: { id: waveId },
    include: {
      candidates: { include: { player: true } },
      responses: true,
    },
  });
  if (!wave || wave.status !== "Active") return;

  const respondedIds = new Set(wave.responses.map((r) => r.playerId));
  const notYet = wave.candidates.filter((c) => !respondedIds.has(c.playerId));

  if (notYet.length === 0) return; // everyone already responded

  const channel = await getTextChannel(session.channelId, client);
  if (!channel) return;

  // Resolve Discord IDs
  const resolvedIds = await Promise.all(
    notYet.map((c) => {
      const rawId = (c.player as { discordId?: string | null }).discordId;
      if (!rawId) return Promise.resolve(null);
      return resolveToNumericId(rawId, c.playerId, client);
    })
  );

  const mentions = resolvedIds.filter(Boolean).map((id) => `<@${id}>`).join(" ");

  const embed = buildRePingEmbed({
    teamName: session.teamName,
    slotsNeeded: session.slotsNeeded,
    minutesLeft,
    notYetResponded: notYet.length,
  });

  try {
    await channel.send({ content: mentions || undefined, embeds: [embed] });
  } catch (err) {
    log.error("Failed to send re-ping message", err);
  }
}

// ── Internal: completion ──────────────────────────────────────────────────────

async function processWaveCompletion(waveId: string, client: Client): Promise<void> {
  completionTimers.delete(waveId);
  cancelRePingTimers(waveId);

  let wave: Awaited<ReturnType<typeof claimWaveForProcessing>>;
  try {
    wave = await claimWaveForProcessing(waveId);
  } catch (err) {
    log.error(`Failed to claim wave ${waveId}`, err);
    return;
  }

  if (!wave) {
    log.debug(`Wave ${waveId} already processed — skipping.`);
    return;
  }

  const { session } = wave;

  // Session may have been manually completed via website
  if (session.status !== "Active") {
    if (session.status === "Completed" && session.selectedPlayerId) {
      const winner = await prisma.player.findUnique({ where: { id: session.selectedPlayerId } });
      if (winner) {
        await postSingleWinnerMessage(session, {
          nick: winner.nick,
          mmr: winner.mmr,
          subScore: 0,
          roleFit: 0,
          poolEntryId: session.selectedPoolEntryId ?? "",
          playerId: winner.id,
          discordId: winner.discordId ?? null,
        }, client);
      }
      await deleteWaveMessage(wave, client);
    }
    return;
  }

  await disableWaveButton(wave, client);

  if (wave.responses.length === 0) {
    log.info(`Wave ${waveId}: no responses. Marking exhausted.`);
    await markWaveNoResponse(waveId);
    await markSessionExhausted(session.id);
    await postExhaustedMessage(session, client);
    await deleteWaveMessage(wave, client);
    return;
  }

  // Load slots to know how many players to assign
  const slots = await prisma.substitutionSlot.findMany({
    where: { sessionId: session.id },
    orderBy: { slotIndex: "asc" },
  });
  const n = Math.max(session.slotsNeeded, 1);

  log.info(`Wave ${waveId}: ${wave.responses.length} response(s). Auto-assigning top ${n}.`);

  const winners = await selectBestNResponders(wave, session, n);

  if (winners.length === 0) {
    log.warn(`Wave ${waveId}: all responders ineligible. Marking exhausted.`);
    await markSessionExhausted(session.id);
    await postExhaustedMessage(session, client);
    await deleteWaveMessage(wave, client);
    return;
  }

  // Assign each winner to a corresponding slot
  const assignedWinners: CompletionWinner[] = [];

  for (let i = 0; i < winners.length; i++) {
    const winner = winners[i];
    const slot = slots[i];

    try {
      await assignSubstitution(winner.poolEntryId, {
        teamId: session.teamId,
        teamName: session.teamName,
        neededRole: slot?.neededRole ?? session.neededRole,
        replacedPlayerId: slot?.replacedPlayerId ?? session.replacedPlayerId ?? undefined,
        replacedPlayerNick: slot?.replacedPlayerNick ?? session.replacedPlayerNick ?? undefined,
        replacedPlayerMmr: session.replacedPlayerMmr ?? undefined,
        targetAvgMmr: session.targetAvgMmr,
        maxDeviation: session.maxDeviation,
        judgeName: "bot",
        comment: `Авто-назначен по итогам 20-минутного поиска (слот ${i})`,
      });

      if (slot) {
        await prisma.substitutionSlot.update({
          where: { id: slot.id },
          data: {
            assignedPlayerId: winner.playerId,
            assignedPoolEntryId: winner.poolEntryId,
            assignedAt: new Date(),
          },
        });
      }
    } catch (err) {
      log.error(`assignSubstitution failed for ${winner.nick} (slot ${i})`, err);
    }

    const resolved = winner.discordId
      ? await resolveToNumericId(winner.discordId, winner.playerId, client)
      : null;

    assignedWinners.push({
      nick: winner.nick,
      mmr: winner.mmr,
      subScore: winner.subScore,
      discordId: winner.discordId,
      resolvedMention: resolved ? `<@${resolved}>` : `**${winner.nick}**`,
    });
  }

  // Mark session completed (use first winner as "selected" for backward compat)
  await markSessionCompleted(session.id, winners[0].playerId, winners[0].poolEntryId);

  await deleteWaveMessage(wave, client);
  await postCompletionMessage(session, assignedWinners, client);

  log.info(
    `Session ${session.id} completed. Winners: ${assignedWinners.map((w) => w.nick).join(", ")}`
  );
}

// ── Discord helpers ───────────────────────────────────────────────────────────

async function getTextChannel(channelId: string, client: Client): Promise<TextChannel | null> {
  try {
    const ch = await client.channels.fetch(channelId);
    if (ch?.isTextBased() && "send" in ch) return ch as TextChannel;
  } catch (err) {
    log.error(`Cannot fetch channel ${channelId}`, err);
  }
  return null;
}

async function postInitialMessage(
  session: { channelId: string; teamName: string; slotsNeeded: number; activeMatchId: string | null },
  wave: { id: string; endsAt: Date; waveNumber: number },
  allPlayers: Array<{ playerId: string; player: { discordId?: string | null; nick: string } }>,
  neededRoles: number[],
  client: Client
): Promise<string | null> {
  const channel = await getTextChannel(session.channelId, client);
  if (!channel) return null;

  const resolvedIds = await Promise.all(
    allPlayers.map((e) => {
      const rawId = (e.player as { discordId?: string | null }).discordId;
      if (!rawId) return Promise.resolve(null);
      return resolveToNumericId(rawId, e.playerId, client);
    })
  );

  const mentions = resolvedIds.filter(Boolean).map((id) => `<@${id}>`).join(" ");
  const unlinked = resolvedIds.filter((id) => !id).length;

  const embed = buildSearchEmbed({
    teamName: session.teamName,
    neededRoles,
    totalPinged: allPlayers.length,
    waveId: wave.id,
    endsAt: wave.endsAt,
    matchInfo: session.activeMatchId ? `Матч ID: ${session.activeMatchId}` : undefined,
  });

  const row = buildReadyButton(wave.id);

  try {
    const content = [
      mentions,
      unlinked > 0 ? `*(${unlinked} игроков без привязки Discord)*` : "",
    ].filter(Boolean).join("\n");

    const msg = await channel.send({ content, embeds: [embed], components: [row] });
    return msg.id;
  } catch (err) {
    log.error("Failed to send initial search message", err);
    return null;
  }
}

async function postCompletionMessage(
  session: { channelId: string; teamName: string },
  winners: CompletionWinner[],
  client: Client
): Promise<void> {
  const channel = await getTextChannel(session.channelId, client);
  if (!channel) return;

  const embed = buildCompletionEmbed({ teamName: session.teamName, winners });
  const allMentions = winners.map((w) => w.resolvedMention).join(" ");

  try {
    await channel.send({ content: `${allMentions} — GL HF! 🎮`, embeds: [embed] });
  } catch (err) {
    log.error("Failed to send completion message", err);
  }
}

async function postSingleWinnerMessage(
  session: { channelId: string; teamName: string },
  winner: { nick: string; mmr: number; subScore: number; roleFit: number; poolEntryId: string; playerId: string; discordId: string | null },
  client: Client
): Promise<void> {
  const channel = await getTextChannel(session.channelId, client);
  if (!channel) return;

  const resolved = winner.discordId
    ? await resolveToNumericId(winner.discordId, winner.playerId, client)
    : null;
  const mention = resolved ? `<@${resolved}>` : `**${winner.nick}**`;

  const embed = buildCompletionEmbed({
    teamName: session.teamName,
    winners: [{
      nick: winner.nick,
      mmr: winner.mmr,
      subScore: winner.subScore,
      discordId: winner.discordId,
      resolvedMention: mention,
    }],
  });

  try {
    await channel.send({ content: `${mention} — GL HF! 🎮`, embeds: [embed] });
  } catch (err) {
    log.error("Failed to send single winner message", err);
  }
}

async function postExhaustedMessage(
  session: { channelId: string; teamName: string },
  client: Client
): Promise<void> {
  const channel = await getTextChannel(session.channelId, client);
  if (!channel) return;
  try {
    await channel.send({ embeds: [buildExhaustedEmbed(session.teamName)] });
  } catch (err) {
    log.error("Failed to send exhausted message", err);
  }
}

async function deleteWaveMessage(
  wave: { messageId: string | null; channelId: string },
  client: Client
): Promise<void> {
  if (!wave.messageId) return;
  const channel = await getTextChannel(wave.channelId, client);
  if (!channel) return;
  try {
    const msg = await channel.messages.fetch(wave.messageId);
    await msg.delete();
  } catch {
    log.debug(`Could not delete wave message ${wave.messageId}`);
  }
}

async function disableWaveButton(
  wave: { messageId: string | null; channelId: string },
  client: Client
): Promise<void> {
  if (!wave.messageId) return;
  const channel = await getTextChannel(wave.channelId, client);
  if (!channel) return;
  try {
    const msg = await channel.messages.fetch(wave.messageId);
    await msg.edit({ components: [buildDisabledReadyButton()] });
  } catch {
    log.debug(`Could not disable button on message ${wave.messageId}`);
  }
}

function cancelRePingTimers(waveId: string): void {
  const timers = rePingTimers.get(waveId);
  if (timers) {
    for (const t of timers) clearTimeout(t);
    rePingTimers.delete(waveId);
  }
}

/** Cancels the in-memory completion timer for a wave (called when session is cancelled). */
export function cancelWaveTimer(waveId: string): void {
  const timer = completionTimers.get(waveId);
  if (timer) {
    clearTimeout(timer);
    completionTimers.delete(waveId);
  }
  cancelRePingTimers(waveId);
}

/**
 * Immediately processes a wave that was manually completed via the website.
 * Cancels any running timers and runs wave completion logic right away.
 */
export async function forceProcessWave(waveId: string, client: Client): Promise<void> {
  cancelWaveTimer(waveId);
  await processWaveCompletion(waveId, client);
}
