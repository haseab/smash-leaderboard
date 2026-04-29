export const isDateInputValue = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value);

export const getValidDateQueryValue = (value: string | null) =>
  value && isDateInputValue(value) ? value : "";

export const formatDateValue = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString();

export const formatDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

export const shiftDateByDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

export const shiftDateByYears = (date: Date, years: number) => {
  const next = new Date(date);
  next.setFullYear(next.getFullYear() + years);
  return next;
};

export const getDateRangeFilterError = (
  startDate: string,
  endDate: string
) =>
  startDate && endDate && startDate > endDate
    ? "Start date must be on or before the end date."
    : null;

export const getOpenDateRangeLabel = (
  startDate: string,
  endDate: string,
  emptyLabel = "All Dates"
) => {
  if (startDate && endDate) {
    return `${formatDateValue(startDate)} - ${formatDateValue(endDate)}`;
  }

  if (startDate) {
    return `From ${formatDateValue(startDate)}`;
  }

  if (endDate) {
    return `Through ${formatDateValue(endDate)}`;
  }

  return emptyLabel;
};

export const parseUtcDate = (value: string | null) => {
  if (!value || !isDateInputValue(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed;
};

export const addUtcDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};
