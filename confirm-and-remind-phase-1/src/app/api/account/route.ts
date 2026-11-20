import { api } from "@/lib/server/api";
import { deleteAccountData } from "@/lib/core/service";
import { deleteAuthUser } from "@/lib/server/auth";
import { HttpError } from "@/lib/core/types";

/** Deletes all of the caller's data and the sign-in account. Requires { confirm: "DELETE" } in the body (sent as POST). */
export const POST = api("account.delete", 3, async (c) => {
  if (c.body.confirm !== "DELETE") throw new HttpError(400, "Type DELETE to confirm");
  await deleteAccountData(c.db, c.userId);
  await deleteAuthUser(c.userId);
  return { ok: true };
});
