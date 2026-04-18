// Re-export shared config so bot code can import everything from one place
export { WAVE_DURATION_MS, WAVE_SIZE } from "@/lib/substitution-config";

/** Custom ID prefix for the "Готов" button. Full ID: `ready:${waveId}` */
export const READY_BUTTON_PREFIX = "ready";

/** Custom ID prefix for admin confirmation prompt. */
export const CONFIRM_SELECT_PREFIX = "confirm_select";

/** Roles by number — displayed in Discord messages. */
export const ROLE_NAMES: Record<number, string> = {
  1: "Carry (1)",
  2: "Mid (2)",
  3: "Offlane (3)",
  4: "Soft Support (4)",
  5: "Hard Support (5)",
};
