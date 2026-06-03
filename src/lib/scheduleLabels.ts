const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

function localTimeFromUtcCron(hour: number, minute: number) {
  const date = new Date(Date.UTC(2026, 0, 1, hour, minute));
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function describeCronSchedule(cron?: string | null, nextRunAt?: string | null) {
  const fallback = nextRunAt
    ? `Recurring · next ${new Date(nextRunAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
    : "Recurring schedule";

  if (!cron) return fallback;
  const [minute, hour, dayOfMonth, month, dayOfWeek] = cron.trim().split(/\s+/);
  if (!dayOfWeek) return fallback;

  if (cron === "* * * * *") return "Every minute";
  const minuteInterval = minute.match(/^\*\/(\d+)$/)?.[1];
  if (minuteInterval && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return `Every ${minuteInterval} minutes`;
  }

  if (minute === "0" && hour === "*" && dayOfMonth === "*" && month === "*" && dayOfWeek === "*") {
    return "Every hour";
  }

  const numericMinute = Number(minute);
  const numericHour = Number(hour);
  if (!Number.isInteger(numericMinute) || !Number.isInteger(numericHour)) return fallback;

  const time = localTimeFromUtcCron(numericHour, numericMinute);
  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "*") return `Daily at ${time}`;
  if (dayOfMonth === "*" && month === "*" && dayOfWeek === "1-5") return `Weekdays at ${time}`;
  if (dayOfMonth === "*" && month === "*" && /^\d$/.test(dayOfWeek)) {
    return `${WEEKDAYS[Number(dayOfWeek)] ?? "Weekly"} at ${time}`;
  }
  if (/^\d{1,2}$/.test(dayOfMonth) && month === "*" && dayOfWeek === "*") {
    return `Monthly on day ${dayOfMonth} at ${time}`;
  }

  return fallback;
}