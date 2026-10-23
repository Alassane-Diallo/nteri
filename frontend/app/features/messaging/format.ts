const clockFormatter = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

const weekdayFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
});

const shortDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
});

const longDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const MILLISECONDS_PER_DAY = 86_400_000;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function daysFromToday(date: Date): number {
  return Math.round(
    (startOfDay(new Date()) - startOfDay(date)) / MILLISECONDS_PER_DAY,
  );
}

export function formatTime(isoDate: string): string {
  return clockFormatter.format(new Date(isoDate));
}

export function dayKey(isoDate: string): string {
  const date = new Date(isoDate);

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function formatDayLabel(isoDate: string): string {
  const date = new Date(isoDate);
  const difference = daysFromToday(date);

  if (difference === 0) return "Aujourd’hui";
  if (difference === 1) return "Hier";

  return longDateFormatter.format(date);
}

export function formatListTime(isoDate: string): string {
  const date = new Date(isoDate);
  const difference = daysFromToday(date);

  if (difference === 0) return clockFormatter.format(date);
  if (difference === 1) return "Hier";
  if (difference > 1 && difference < 7) return weekdayFormatter.format(date);

  return shortDateFormatter.format(date);
}

export function formatMemberCount(count: number): string {
  return `${count} membre${count > 1 ? "s" : ""}`;
}

export function formatUnreadCount(count: number): string {
  return count > 99 ? "99+" : String(count);
}
