/** Build a deterministic, explicit Google OAuth audience allowlist. */
export const parseGoogleAllowedClientIds = (csv: string | undefined, legacyClientId: string | undefined): string[] =>
  [...new Set([
    ...(csv ?? "").split(",").map((value) => value.trim()).filter(Boolean),
    legacyClientId?.trim(),
  ].filter((value): value is string => Boolean(value)))];

/**
 * `verifyIdToken` verifies the signature, expiry and supplied audience. This
 * second check makes the accepted `aud` and optional OIDC `azp` policy
 * explicit and prevents a client from selecting an arbitrary audience.
 */
export const isAllowedGoogleAudience = (allowedClientIds: readonly string[], audience: string | undefined, authorizedParty: string | undefined): boolean =>
  Boolean(audience && allowedClientIds.includes(audience) && (!authorizedParty || allowedClientIds.includes(authorizedParty)));
