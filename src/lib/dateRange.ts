export const isDateInputValue = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value);

export const getValidDateQueryValue = (value: string | null) =>
  value && isDateInputValue(value) ? value : "";

const parseDateInputParts = (value: string | null) => {
  if (!value || !isDateInputValue(value)) {
    return null;
  }

  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
};

const parseLocalDateInput = (
  value: string | null,
  endExclusive = false
) => {
  const parts = parseDateInputParts(value);

  if (!parts) {
    return null;
  }

  return new Date(
    parts.year,
    parts.month - 1,
    parts.day + (endExclusive ? 1 : 0),
    0,
    0,
    0,
    0
  );
};

export const getLocalDateRangeBounds = (
  startDate: string,
  endDate: string
) => ({
  startDateTime: startDate ? parseLocalDateInput(startDate) : null,
  endDateTime: endDate ? parseLocalDateInput(endDate, true) : null,
});

export const appendLocalDateRangeBounds = (
  params: URLSearchParams,
  startDate: string,
  endDate: string
) => {
  const { startDateTime, endDateTime } = getLocalDateRangeBounds(
    startDate,
    endDate
  );

  if (startDateTime) {
    params.set("startDateTime", startDateTime.toISOString());
  }

  if (endDateTime) {
    params.set("endDateTime", endDateTime.toISOString());
  }
};

export const parseDateTimeQueryValue = (value: string | null) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const getDateRangeSearchParamBounds = (searchParams: URLSearchParams) => {
  const startDateInput = searchParams.get("startDate");
  const endDateInput = searchParams.get("endDate");
  const startDateTimeInput = searchParams.get("startDateTime");
  const endDateTimeInput = searchParams.get("endDateTime");
  const hasInvalidDateInput = Boolean(
    (startDateInput && !parseDateInputParts(startDateInput)) ||
      (endDateInput && !parseDateInputParts(endDateInput))
  );
  let startDateTime: Date | null = null;
  let endDateTime: Date | null = null;

  if (startDateTimeInput) {
    startDateTime = parseDateTimeQueryValue(startDateTimeInput);
  } else if (startDateInput) {
    startDateTime = parseLocalDateInput(startDateInput);
  }

  if (endDateTimeInput) {
    endDateTime = parseDateTimeQueryValue(endDateTimeInput);
  } else if (endDateInput) {
    endDateTime = parseLocalDateInput(endDateInput, true);
  }

  const hasInvalidDateTimeInput = Boolean(
    (startDateTimeInput && !startDateTime) || (endDateTimeInput && !endDateTime)
  );
  const hasInvertedDateInputRange = Boolean(
    startDateInput && endDateInput && startDateInput > endDateInput
  );
  const hasInvertedDateTimeRange = Boolean(
    startDateTime && endDateTime && startDateTime >= endDateTime
  );

  return {
    startDate: startDateTime,
    endDateExclusive: endDateTime,
    hasInvalidDateInput: hasInvalidDateInput || hasInvalidDateTimeInput,
    hasInvertedDateRange:
      hasInvertedDateInputRange || hasInvertedDateTimeRange,
  };
};

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
