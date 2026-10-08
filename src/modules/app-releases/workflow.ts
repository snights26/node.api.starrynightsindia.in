import { badRequest, conflict } from "../../lib/api.js";

export type ReleaseCleanupTarget = { id: string; cloudinaryPublicId: string };

export const assertAndroidVersionCode = (value: number): void => {
  if (!Number.isSafeInteger(value) || value <= 0) throw badRequest("Version Code must be a positive integer");
};

export const assertGreaterVersionCode = (currentVersionCode: number | undefined, nextVersionCode: number): void => {
  assertAndroidVersionCode(nextVersionCode);
  if (currentVersionCode !== undefined && nextVersionCode <= currentVersionCode) {
    throw conflict(`Version Code must be greater than the current Version Code (${currentVersionCode})`);
  }
};

/**
 * Database activation happens before cleanup. A cleanup error deliberately
 * leaves the new release active and the old inactive row available for a safe
 * retry; it must never make the public download disappear.
 */
export const publishAfterUpload = async <T>(input: {
  activate: () => Promise<{ active: T; previous?: ReleaseCleanupTarget }>;
  discardNewAsset: () => Promise<void>;
  deleteOldAsset: (previous: ReleaseCleanupTarget) => Promise<void>;
  deleteOldRow: (previous: ReleaseCleanupTarget) => Promise<void>;
}): Promise<{ active: T; cleanupPending: boolean }> => {
  let activation: { active: T; previous?: ReleaseCleanupTarget };
  try {
    activation = await input.activate();
  } catch (error) {
    try {
      await input.discardNewAsset();
    } catch {
      // The error that prevented publication is the actionable result. An
      // administrator can remove a verified orphan separately if necessary.
    }
    throw error;
  }
  if (!activation.previous) return { active: activation.active, cleanupPending: false };
  try {
    await input.deleteOldAsset(activation.previous);
    await input.deleteOldRow(activation.previous);
    return { active: activation.active, cleanupPending: false };
  } catch {
    return { active: activation.active, cleanupPending: true };
  }
};
