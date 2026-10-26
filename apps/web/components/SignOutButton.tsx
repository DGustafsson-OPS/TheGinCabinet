"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { apiFetch } from "@/lib/api-client";

export default function SignOutButton({ csrfToken }: { csrfToken: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      // Logging out changes state, so it carries the CSRF token (spec §9).
      await apiFetch("/auth/logout", { method: "POST", csrfToken });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <button type="button" className="button button-secondary" onClick={signOut} disabled={busy}>
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
