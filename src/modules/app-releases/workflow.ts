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
 * Database activation happens only after the replacement object has been
 * verified. Previous releases are retained as inactive history so a storage
 * migration never destroys the last known-good release or its metadata.
 */
export const publishAfterUpload = async <T>(input: {
  activate: () => Promise<{ active: T; previous?: ReleaseCleanupTarget }>;
  discardNewAsset: () => Promise<void>;
}): Promise<{ active: T; previous?: ReleaseCleanupTarget }> => {
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
  return { active: activation.active, previous: activation.previous };
};
