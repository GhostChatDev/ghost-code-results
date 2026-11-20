import { HttpError } from "../core/types";
import { adminClient } from "./db";
import { isMock } from "./env";

/** Returns the id of the signed-in user, from the `Authorization: Bearer <token>` header. Throws 401 otherwise. */
export async function authenticate(req: Request): Promise<string> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Sign in required");
  if (isMock()) {
    // MOCK mode only (no Supabase configured): the token is "mock:<email>". Never active when Supabase is configured.
    if (!/^mock:[a-z0-9._%+@-]{3,80}$/i.test(token)) throw new HttpError(401, "Sign in required");
    return "mock-" + token.slice(5).toLowerCase();
  }
  const client = adminClient();
  const { data, error } = await client!.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Sign in required");
  return data.user.id;
}

/** Removes the Supabase auth user (service role). The data rows are removed by deleteAccountData. */
export async function deleteAuthUser(userId: string): Promise<void> {
  const client = adminClient();
  if (!client) return; // mock mode: nothing to remove
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) throw new HttpError(500, "Could not remove the sign-in account");
}
