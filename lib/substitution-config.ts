/** Shared configuration for the substitution search system. */

/** Total session duration: 20 minutes. Players are pinged at t=0; auto-assign fires at t=20. */
export const SESSION_DURATION_MS = 20 * 60 * 1000;

/** Alias kept for backward compatibility (wave.service.ts createWave uses this for endsAt). */
export const WAVE_DURATION_MS = SESSION_DURATION_MS;

/** Re-ping interval: every 5 minutes within the session. */
export const PING_INTERVAL_MS = 5 * 60 * 1000;
