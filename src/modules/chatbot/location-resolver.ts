import type { CategoryRow } from "../catalog/types.js";

export type LocationResolution =
  | { kind: "resolved"; category: CategoryRow; parentContext?: string; descendants: string[] }
  | { kind: "ambiguous"; candidates: CategoryRow[] };

const ignoredWords = new Set([
  "show", "give", "tell", "need", "want", "please", "package", "packages", "tour", "tours", "trip", "trips", "travel", "available", "details", "about", "with", "from", "near", "best", "more", "some", "in", "for", "to",
]);

export const normalizeLocation = (value: string): string => value
  .toLowerCase()
  .replace(/[^a-z0-9\s-]/g, " ")
  .replace(/[-_]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const aliasesFor = (category: CategoryRow): string[] => {
  const canonical = normalizeLocation(category.name);
  const aliases = new Set([canonical]);
  // A short state name is a safe alias only when it is derived from an
  // existing server category (for example, Himachal → Himachal Pradesh).
  if (canonical.endsWith(" pradesh")) {
    const shortName = canonical.slice(0, -" pradesh".length).trim();
    if (shortName.length >= 4) aliases.add(shortName);
  }
  return [...aliases];
};

const phraseIsPresent = (message: string, phrase: string): boolean =>
  (` ${message} `).includes(` ${phrase} `);

const partialScore = (message: string, aliases: string[]): number => {
  const words = normalizeLocation(message).split(" ").filter((word) => word.length >= 5 && !ignoredWords.has(word));
  let score = 0;
  for (const word of words) {
    for (const alias of aliases) {
      if (alias.split(" ").some((part) => part.startsWith(word))) score = Math.max(score, 1_000 + word.length);
    }
  }
  return score;
};

/**
 * Matches a user query against the existing category hierarchy. It deliberately
 * has no geography dictionary: aliases and child relationships are derived from
 * server-backed taxonomy, so future Admin content remains the source of truth.
 */
export const resolveLocation = (message: string, categories: CategoryRow[]): LocationResolution | undefined => {
  const normalizedMessage = normalizeLocation(message);
  if (!normalizedMessage) return undefined;

  const matched = new Map<string, { category: CategoryRow; score: number }>();
  for (const category of categories) {
    const aliases = aliasesFor(category);
    let score = 0;
    for (const alias of aliases) {
      if (normalizedMessage === alias) score = Math.max(score, 10_000 + alias.length);
      else if (phraseIsPresent(normalizedMessage, alias)) score = Math.max(score, 9_000 + alias.length);
    }
    if (!score) score = partialScore(normalizedMessage, aliases);
    if (score) matched.set(category.code, { category, score });
  }
  if (!matched.size) return undefined;

  const all = [...matched.values()];
  const topScore = Math.max(...all.map((item) => item.score));
  const best = all.filter((item) => item.score === topScore).map((item) => item.category);
  if (best.length > 1) return { kind: "ambiguous", candidates: best };

  const category = best[0];
  const descendants = categories
    .filter((candidate) => candidate.parent_code?.toLowerCase() === category.code.toLowerCase())
    .map((candidate) => candidate.name)
    .filter((name, index, values) => values.indexOf(name) === index)
    .slice(0, 3);
  return {
    kind: "resolved",
    category,
    parentContext: category.parent_name ?? category.parent_code ?? undefined,
    descendants,
  };
};
