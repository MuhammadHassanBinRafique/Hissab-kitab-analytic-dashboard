import type { SessionUser } from "@insights/contracts";

/** The password was right, but the user never clicked the confirmation link from sign-up. */
export class EmailNotConfirmedError extends Error {}

export interface CredentialVerifier {
  /** Returns the user if the email/password are right, null if not. Throws only when Supabase itself fails. */
  verify(email: string, password: string): Promise<SessionUser | null>;
}

/** Checks the SAME credentials the portal uses, against Supabase Auth. */
export function supabaseVerifier(url: string, anonKey: string, fetchImpl: typeof fetch = fetch): CredentialVerifier {
  return {
    async verify(email, password) {
      const res = await fetchImpl(`${url}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: anonKey, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if ([400, 401, 422].includes(res.status)) {
        // Supabase checks the password first and reports this only when it was correct, so it reveals nothing to a guesser.
        const err = (await res.json().catch(() => null)) as { error_code?: string } | null;
        if (err?.error_code === "email_not_confirmed") throw new EmailNotConfirmedError();
        return null;
      }
      if (!res.ok) throw new Error(`Supabase Auth responded ${res.status}`);
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
