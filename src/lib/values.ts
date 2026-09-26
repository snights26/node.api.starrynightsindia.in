export type JsonObject = Record<string, unknown>;

export const stringValue = (value: unknown): string => typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();

export const firstString = (body: JsonObject, ...keys: string[]): string => {
  for (const key of keys) {
    const value = stringValue(body[key]);
    if (value) return value;
  }
  return "";
};

export const optionalString = (body: JsonObject, ...keys: string[]): string | null => {
  const value = firstString(body, ...keys);
  return value || null;
};

export const integerValue = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  const parsed = Number.parseInt(stringValue(value), 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export const booleanValue = (value: unknown, fallback = false): boolean => {
  if (typeof value === "boolean") return value;
  const normalized = stringValue(value).toLowerCase();
  return normalized ? normalized === "true" : fallback;
};

export const stringList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean);
  if (typeof value === "string") {
    try {
      return stringList(JSON.parse(value) as unknown);
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
};

export const objectList = (value: unknown): JsonObject[] =>
  Array.isArray(value) ? value.filter((item): item is JsonObject => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];

export const parseJsonList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    return stringList(JSON.parse(value) as unknown);
  } catch {
    return [];
  }
};

export const isoDate = (value: unknown): string => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
};

export const money = (value: unknown): string | number => {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : String(value);
};
