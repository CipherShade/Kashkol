/**
 * Parent-notification preferences and the pure rules that give them meaning.
 *
 * Only values the outbox can actually honour are modelled here:
 *
 * - `enabled` stops new notifications from being enqueued and pauses delivery.
 * - `quietHours` defers delivery until the window ends in the workspace timezone.
 *
 * Provider configuration is never edited through this surface (see the
 * `integrations` permission boundary); it is reported read-only.
 */

export type NotificationPreferences = {
  enabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  quietHoursEnabled: false,
  quietHoursStart: null,
  quietHoursEnd: null,
};

const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parse `HH:MM` into minutes since local midnight, or null when invalid. */
export function parseClock(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = CLOCK_PATTERN.exec(value);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function localParts(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
  };
}

/**
 * Convert a wall-clock time in a named timezone to the matching UTC instant.
 * The offset is resolved by iteration, so DST transitions are handled the same
 * way the report date bounds are.
 */
function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const targetLocalAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let guess = targetLocalAsUtc;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).map(({ type, value }) => [type, value]),
    );
    const observedLocalAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    guess += targetLocalAsUtc - observedLocalAsUtc;
  }
  return new Date(guess);
}

/** True when `at` falls inside an active quiet-hours window. */
export function isQuietHoursActive(
  preferences: NotificationPreferences,
  at: Date,
  timezone: string,
): boolean {
  if (!preferences.quietHoursEnabled) return false;
  const start = parseClock(preferences.quietHoursStart);
  const end = parseClock(preferences.quietHoursEnd);
  if (start === null || end === null) return false;
  if (start === end) return false;

  const { hour, minute } = localParts(at, timezone);
  const now = hour * 60 + minute;
  if (start < end) return now >= start && now < end;
  return now >= start || now < end;
}

/**
 * The instant at which a message may be delivered. Outside quiet hours this is
 * `at`; inside, it is the next occurrence of the window's end.
 */
export function nextDeliveryAt(
  preferences: NotificationPreferences,
  at: Date,
  timezone: string,
): Date {
  if (!isQuietHoursActive(preferences, at, timezone)) return at;
  const start = parseClock(preferences.quietHoursStart);
  const end = parseClock(preferences.quietHoursEnd);
  if (start === null || end === null) return at;

  const local = localParts(at, timezone);
  const now = local.hour * 60 + local.minute;
  const endHour = Math.floor(end / 60);
  const endMinute = end % 60;
  const addDay = end <= now ? 1 : 0;

  const target = new Date(Date.UTC(local.year, local.month - 1, local.day + addDay));
  return zonedTimeToUtc(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    target.getUTCDate(),
    endHour,
    endMinute,
    timezone,
  );
}
