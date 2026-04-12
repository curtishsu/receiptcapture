export function normalizeKeyPart(value: string | null | undefined): string {
  return (value ?? "")
    .toUpperCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeItemName(value: string | null | undefined): string {
  return normalizeKeyPart(value);
}

export function toTitleCaseText(value: string | null | undefined): string | null {
  const nextValue = value?.trim();
  if (!nextValue) {
    return null;
  }

  return nextValue
    .toLowerCase()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function safeInteger(value: unknown, fallback = 1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.round(parsed);
}
