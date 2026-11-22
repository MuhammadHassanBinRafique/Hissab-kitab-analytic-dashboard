import type { SessionUser } from "@insights/contracts";
import { AuthServiceError } from "./errors";

export interface CredentialVerifier {
  /** Returns the user if the email/password are right, null if not. Throws AuthServiceError only when Supabase itself fails. */
  verify(email: string, password: string): Promise<SessionUser | null>;
}

/** The password was right, but the user never clicked the confirmation link from sign-up. */
export class EmailNotConfirmedError extends Error {}

/** Checks the SAME credentials the portal uses, against Supabase Auth. */
export function supabaseVerifier(url: string, anonKey: string, fetchImpl: typeof fetch = fetch): CredentialVerifier {
  return {
    async verify(email, password) {
      let res: Response;
      try {
        res = await fetchImpl(`${url}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { apikey: anonKey, "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
          signal: AbortSignal.timeout(8000), // never hang a sign-in on a slow provider
        });
      } catch {
        throw new AuthServiceError("Supabase Auth unreachable");
      }
      if ([400, 401, 422].includes(res.status)) {
        // Supabase checks the password first and reports this only when it was correct, so it reveals nothing to a guesser.
        const err = (await res.json().catch(() => null)) as { error_code?: string } | null;
        if (err?.error_code === "email_not_confirmed") throw new EmailNotConfirmedError();
        return null; // wrong email or password
      }
      if (!res.ok) throw new AuthServiceError(`Supabase Auth responded ${res.status}`); // 429, 5xx, bad key...
      const body = (await res.json()) as { access_token: string; user: { id: string; email?: string } };
      // Sign-in created a Supabase session; revoke only THIS one (scope=local) so the
      // user's portal session is not logged out. We only needed the yes/no.
      void fetchImpl(`${url}/auth/v1/logout?scope=local`, {
        method: "POST", headers: { apikey: anonKey, Authorization: `Bearer ${body.access_token}` },
      }).catch(() => {});
      return { id: body.user.id, email: body.user.email ?? email };
    },
  };
}
