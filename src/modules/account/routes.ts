import { Router } from "express";
import { z } from "zod";
import { transaction } from "../../db/pool.js";
import { asyncRoute, forbidden, message, notFound, validateBody } from "../../lib/api.js";
import { authenticate } from "../../lib/auth.js";
import { isPrivateStorageReference, storageService } from "../../services/blob-storage.js";
import { cloudinaryPublicIdFromUrl, deleteImage } from "../../services/storage.js";

export const accountRouter = Router();

/** The exact phrase prevents an accidental destructive click from deleting an account. */
export const accountDeletionSchema = z.object({ confirmation: z.literal("DELETE") }).strict();

type AccountRow = {
  id: string;
  email: string;
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
  profile_image_url: string | null;
};

type ReferenceRow = { reference: string | null };

const managedReferences = (values: Array<string | null | undefined>): string[] => [...new Set(values
  .filter((value): value is string => Boolean(value?.trim()))
  .map((value) => value.trim())
  .filter((value) => isPrivateStorageReference(value) || Boolean(cloudinaryPublicIdFromUrl(value))))];

const deleteManagedReference = async (reference: string): Promise<void> => {
  if (isPrivateStorageReference(reference)) {
    await storageService.deleteObject(reference, "private");
    return;
  }
  await deleteImage(cloudinaryPublicIdFromUrl(reference));
};

/**
 * Deletes only storage objects demonstrably owned by the current account. This
 * happens before the database transaction so an unavailable storage provider
 * cannot leave a deleted account with a still-addressable private asset.
 */
const ownedStorageReferences = async (userId: string): Promise<string[]> => transaction(async (client) => {
  const account = await client.query<AccountRow>(
    "SELECT id, email, role, profile_image_url FROM app_users WHERE id = $1 AND deleted = FALSE AND enabled = TRUE",
    [userId],
  );
  const user = account.rows[0];
  if (!user) throw notFound("Account not found");
  if (user.role !== "USER") throw forbidden("Only customer accounts can be deleted here");

  const [gallery, careers, bookingDocuments] = await Promise.all([
    client.query<ReferenceRow>("SELECT url AS reference FROM gallery_images WHERE user_id = $1", [userId]),
    client.query<ReferenceRow>("SELECT resume_url AS reference FROM career_applications WHERE LOWER(COALESCE(email, '')) = LOWER($1)", [user.email]),
    client.query<ReferenceRow>("SELECT d.file_url AS reference FROM booking_documents d JOIN tour_bookings t ON t.id = d.tour_id WHERE t.user_id = $1", [userId]),
  ]);

  return managedReferences([
    user.profile_image_url,
    ...gallery.rows.map((row) => row.reference),
    ...careers.rows.map((row) => row.reference),
    ...bookingDocuments.rows.map((row) => row.reference),
  ]);
});

/**
 * The account record and all account-specific state are permanently removed.
 * Booking/payment rows are retained for operational reconciliation only, with
 * their account link and personal fields removed in the same transaction.
 */
export const deleteOwnAccount = async (userId: string): Promise<void> => {
  const references = await ownedStorageReferences(userId);
  await Promise.all(references.map(deleteManagedReference));

  await transaction(async (client) => {
    const account = await client.query<AccountRow>(
      "SELECT id, email, role, profile_image_url FROM app_users WHERE id = $1 AND deleted = FALSE AND enabled = TRUE FOR UPDATE",
      [userId],
    );
    const user = account.rows[0];
    if (!user) throw notFound("Account not found");
    if (user.role !== "USER") throw forbidden("Only customer accounts can be deleted here");

    // Booking documents contain customer-provided identity/travel material and
    // are not needed once the user asks us to remove their account data.
    await client.query("DELETE FROM booking_documents WHERE tour_id IN (SELECT id FROM tour_bookings WHERE user_id = $1)", [user.id]);
    await client.query("DELETE FROM refresh_tokens WHERE user_id = $1", [user.id]);
    await client.query("DELETE FROM user_bucket_list WHERE user_id = $1", [user.id]);
    await client.query("DELETE FROM package_view_histories WHERE user_id = $1", [user.id]);
    await client.query("DELETE FROM notifications WHERE target_user_id = $1", [user.id]);
    await client.query("DELETE FROM gallery_images WHERE user_id = $1", [user.id]);

    // Preserve financial/booking reconciliation while severing the account
    // relationship and removing customer-provided personal fields.
    await client.query(
      `UPDATE tour_bookings
         SET user_id = NULL, full_name = NULL, mobile = NULL, id_type = NULL,
             id_number = NULL, emergency_contact = NULL, pickup_location = NULL,
             drop_location = NULL, updated_at = NOW()
       WHERE user_id = $1`,
      [user.id],
    );

    // These historic submissions do not have an account foreign key. Match the
    // account's unique email and retain only non-personal operational metadata.
    await client.query(
      `UPDATE enquiries
         SET name = 'Deleted account', contact = 'Deleted account', email = NULL,
             pickup_city = NULL, destination = NULL, start_date = NULL, end_date = NULL,
             persons = NULL, adult = NULL, child = NULL, rooms = NULL, message = NULL,
             contact_time = NULL, updated_at = NOW()
       WHERE LOWER(COALESCE(email, '')) = LOWER($1)`,
      [user.email],
    );
    await client.query(
      `UPDATE contact_messages
         SET name = 'Deleted account', email = NULL, phone = NULL, message = NULL,
             updated_at = NOW()
       WHERE LOWER(COALESCE(email, '')) = LOWER($1)`,
      [user.email],
    );
    await client.query(
      `UPDATE career_applications
         SET name = 'Deleted account', email = NULL, phone = NULL, about = NULL,
             resume_url = NULL, updated_at = NOW()
       WHERE LOWER(COALESCE(email, '')) = LOWER($1)`,
      [user.email],
    );

    await client.query("DELETE FROM app_users WHERE id = $1", [user.id]);
  });
};

accountRouter.delete("/account", authenticate, validateBody(accountDeletionSchema), asyncRoute(async (request, response) => {
  if (request.auth!.role !== "USER") throw forbidden("Only customer accounts can be deleted here");
  await deleteOwnAccount(request.auth!.id);
  response.json(message("Account deleted"));
}));
