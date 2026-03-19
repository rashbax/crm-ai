const BUSINESS_TIME_ZONE =
  process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE ||
  process.env.BUSINESS_TIME_ZONE ||
  "Asia/Tashkent";

export function getBusinessTimeZone(): string {
  return BUSINESS_TIME_ZONE;
}

export function toIsoDayInTimeZone(input: Date | string | number, timeZone: string = BUSINESS_TIME_ZONE): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

export function getBusinessIsoDay(input: Date | string | number = new Date()): string {
  return toIsoDayInTimeZone(input, BUSINESS_TIME_ZONE);
}

function parseIsoDayParts(isoDay: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDay);
  if (!match) return null;

  const [, yearRaw, monthRaw, dayRaw] = match;
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  return { year, month, day };
}

function getTimeZoneOffsetSuffix(input: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
    hour: "2-digit",
  }).formatToParts(input);

  const zone = parts.find((part) => part.type === "timeZoneName")?.value || "";
  const match = /GMT([+-]\d{2}:\d{2})/.exec(zone);
  return match?.[1] || "Z";
}

export function addDaysToIsoDay(isoDay: string, days: number): string {
  const parts = parseIsoDayParts(isoDay);
  if (!parts) return isoDay;

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (Number.isNaN(date.getTime())) return isoDay;

  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function diffIsoDays(startIsoDay: string, endIsoDay: string): number {
  const start = parseIsoDayParts(startIsoDay);
  const end = parseIsoDayParts(endIsoDay);
  if (!start || !end) return 0;

  const startMs = Date.UTC(start.year, start.month - 1, start.day);
  const endMs = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
}

export function formatIsoDayForLocale(
  isoDay: string,
  locale: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  const parts = parseIsoDayParts(isoDay);
  if (!parts) return isoDay;

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  return new Intl.DateTimeFormat(locale, {
    timeZone: BUSINESS_TIME_ZONE,
    ...options,
  }).format(date);
}

export function toIsoDayBoundaryInTimeZone(
  isoDay: string,
  timeZone: string = BUSINESS_TIME_ZONE,
  endOfDay: boolean = false
): string {
  const parts = parseIsoDayParts(isoDay);
  if (!parts) return `${isoDay}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`;

  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  const offset = getTimeZoneOffsetSuffix(probe, timeZone);
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  return `${isoDay}T${time}${offset}`;
}

export function toBusinessDayBoundaryIso(isoDay: string, endOfDay: boolean = false): string {
  return toIsoDayBoundaryInTimeZone(isoDay, BUSINESS_TIME_ZONE, endOfDay);
}
