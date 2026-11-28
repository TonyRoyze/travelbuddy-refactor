export function normalizeNicNumber(value: string) {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

const nicCalendar = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function previewNic(value: string) {
  const number = normalizeNicNumber(value);
  const oldFormat = /^\d{9}[VX]$/.test(number);
  if (!oldFormat && !/^\d{12}$/.test(number)) return null;

  const yearLength = oldFormat ? 2 : 4;
  const year = Number(number.slice(0, yearLength)) + (oldFormat ? 1900 : 0);
  const code = Number(number.slice(yearLength, yearLength + 3));
  const gender = code >= 501 ? "female" : "male";
  let day = code - (gender === "female" ? 500 : 0);
  if (year < 1900 || day < 1 || day > 366) return null;

  let month = 0;
  while (day > nicCalendar[month]) day -= nicCalendar[month++];
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCMonth() !== month) return null;

  return { birthDate: date.toISOString().slice(0, 10), gender };
}
