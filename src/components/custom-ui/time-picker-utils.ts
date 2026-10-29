export type TimePickerType = "minutes" | "12hours";
export type Period = "AM" | "PM";

export function display12HourValue(hours: number) {
  const value = hours % 12 || 12;
  return String(value).padStart(2, "0");
}

export function getDateByType(date: Date, type: TimePickerType) {
  return type === "minutes"
    ? String(date.getMinutes()).padStart(2, "0")
    : display12HourValue(date.getHours());
}

export function getValidNumber(value: string, max: number, min = 0) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return String(min).padStart(2, "0");
  return String(Math.min(max, Math.max(min, number))).padStart(2, "0");
}

export function getValidArrowNumber(
  value: string,
  min: number,
  max: number,
  step: number,
) {
  const current = Number.parseInt(value, 10);
  const size = max - min + 1;
  const next =
    (((Number.isNaN(current) ? min : current) - min + step) % size + size) %
      size +
    min;
  return String(next).padStart(2, "0");
}

export function setDateByType(
  date: Date,
  value: string,
  type: TimePickerType,
  period?: Period,
) {
  if (type === "minutes") {
    date.setMinutes(Number(getValidNumber(value, 59)));
  } else {
    const hours = Number(getValidNumber(value, 12, 1)) % 12;
    date.setHours(hours + (period === "PM" ? 12 : 0));
  }
  return date;
}
