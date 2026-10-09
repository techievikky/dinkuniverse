// Common IANA zones offered in the profile timezone picker, plus a
// "device default" option that defers to the browser's own timezone.
export const TIMEZONE_OPTIONS = [
  { value: "", label: "Use device timezone" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "America/Los_Angeles", label: "Pacific Time (US & Canada)" },
  { value: "America/Denver", label: "Mountain Time (US & Canada)" },
  { value: "America/Chicago", label: "Central Time (US & Canada)" },
  { value: "America/New_York", label: "Eastern Time (US & Canada)" },
  { value: "America/Sao_Paulo", label: "Brasilia" },
  { value: "UTC", label: "UTC" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris / Berlin / Madrid" },
  { value: "Africa/Cairo", label: "Cairo" },
  { value: "Asia/Kolkata", label: "India" },
  { value: "Asia/Dubai", label: "Dubai" },
  { value: "Asia/Bangkok", label: "Bangkok" },
  { value: "Asia/Shanghai", label: "China" },
  { value: "Asia/Tokyo", label: "Tokyo" },
  { value: "Australia/Sydney", label: "Sydney" },
  { value: "Pacific/Auckland", label: "Auckland" },
];

export const getUserTimeZone = (user) => user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

// A play/event stores date as a plain "YYYY-MM-DD" calendar day with no
// timezone attached. Parsing that string directly (or via `new Date(dateStr)`)
// reads it as UTC midnight, which renders as the previous day once formatted
// in any timezone behind UTC. Anchoring to noon UTC keeps the calendar date
// stable across every timezone before formatting it in the user's chosen zone.
export function formatDateInTimeZone(dateStr, timeZone, options = {}) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-").map(Number);
  const anchored = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 12));
  return anchored.toLocaleDateString(undefined, { ...options, timeZone: timeZone || undefined });
}
