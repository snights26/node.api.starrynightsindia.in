import assert from "node:assert/strict";
import test from "node:test";
import { accountDeletionSchema } from "../modules/account/routes.js";

test("account deletion requires the deliberate DELETE confirmation", () => {
  assert.equal(accountDeletionSchema.safeParse({ confirmation: "DELETE" }).success, true);
  assert.equal(accountDeletionSchema.safeParse({ confirmation: "delete" }).success, false);
  assert.equal(accountDeletionSchema.safeParse({ confirmation: "DELETE", userId: "another-user" }).success, false);
  assert.equal(accountDeletionSchema.safeParse({}).success, false);
});
