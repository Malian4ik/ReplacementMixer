import { formatInTimeZone } from "date-fns-tz";

const TZ = "Europe/Moscow";

export function formatMoscow(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, TZ, "dd.MM.yyyy HH:mm:ss");
}
