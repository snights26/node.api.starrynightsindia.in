import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLocation, resolveLocation } from "../modules/chatbot/location-resolver.js";
import type { CategoryRow } from "../modules/catalog/types.js";

const categories: CategoryRow[] = [
  { id: "1", code: "DOM-HP", name: "Himachal Pradesh", sub_category: true, parent_id: "dom", parent_code: "DOM", parent_name: "Domestic", thumbnail_url: null },
  { id: "2", code: "PICKUP-SHIMLA", name: "Shimla", sub_category: true, parent_id: "pickup", parent_code: "PICKUP", parent_name: "Pickup city", thumbnail_url: null },
  { id: "3", code: "PICKUP-MANALI", name: "Manali", sub_category: true, parent_id: "pickup", parent_code: "PICKUP", parent_name: "Pickup city", thumbnail_url: null },
  { id: "4", code: "PICKUP-DHARAMSHALA", name: "Dharamshala", sub_category: true, parent_id: "pickup", parent_code: "PICKUP", parent_name: "Pickup city", thumbnail_url: null },
  { id: "5", code: "DOM-UK", name: "Uttarakhand", sub_category: true, parent_id: "dom", parent_code: "DOM", parent_name: "Domestic", thumbnail_url: null },
];

test("location normalization handles case, spacing, and punctuation", () => {
  assert.equal(normalizeLocation("  HIMACHAL--PRADESH "), "himachal pradesh");
});

test("taxonomy resolves state and city queries without a hardcoded place list", () => {
  for (const [query, code] of [["Himachal", "DOM-HP"], ["Himachal Pradesh", "DOM-HP"], ["Shimla", "PICKUP-SHIMLA"], ["Uttarakhand", "DOM-UK"], ["manali", "PICKUP-MANALI"], ["  DHARAMSHALA  ", "PICKUP-DHARAMSHALA"]] as const) {
    const result = resolveLocation(query, categories);
    assert.equal(result?.kind, "resolved");
    if (result?.kind === "resolved") assert.equal(result.category.code, code);
  }
});

test("taxonomy uses conservative partial matching and rejects unknown locations", () => {
  const partial = resolveLocation("uttarak", categories);
  assert.equal(partial?.kind, "resolved");
  if (partial?.kind === "resolved") assert.equal(partial.category.code, "DOM-UK");
  assert.equal(resolveLocation("Atlantis", categories), undefined);
});

test("taxonomy requests clarification for an ambiguous location", () => {
  const duplicated = [...categories,
    { id: "6", code: "A", name: "Springfield", sub_category: true, parent_id: null, parent_code: null, parent_name: null, thumbnail_url: null },
    { id: "7", code: "B", name: "Springfield", sub_category: true, parent_id: null, parent_code: null, parent_name: null, thumbnail_url: null },
  ];
  assert.equal(resolveLocation("Springfield", duplicated)?.kind, "ambiguous");
});
