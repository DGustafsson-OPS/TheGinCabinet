"use client";
// Website settings (spec A10): the name, tagline and search-engine description,
// contact details and the default visibility of new gins. (The logo is part of
// the site itself: components/CabinetMark.tsx and app/icon.svg.)

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import { ApiError } from "@/lib/api-client";
import type { SiteSettings } from "@/lib/types";

type Values = {
  site_name: string; tagline: string; meta_description: string; contact_email: string;
  default_gin_public: boolean;
};

const toValues = (s: SiteSettings): Values => ({
  site_name: s.site_name,
  tagline: s.tagline ?? "",
  meta_description: s.meta_description ?? "",
  contact_email: s.contact_email ?? "",
  default_gin_public: s.default_gin_public,
});

export default function SiteSettingsForm({ settings }: { settings: SiteSettings }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [values, setValues] = useState<Values>(() => toValues(settings));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set =
    (field: keyof Values) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const target = event.target;
      const value = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value;
      setValues((v) => ({ ...v, [field]: value }));
    };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const text = (v: string) => v.trim() || null;
    try {
      await call("/admin/settings", "PATCH", {
        version: settings.version,
        site_name: values.site_name.trim(),
        tagline: text(values.tagline),
        meta_description: text(values.meta_description),
        contact_email: text(values.contact_email),
        default_gin_public: values.default_gin_public,
      });
      toast("Website settings saved.");
      router.refresh(); // the page reloads; `key` then starts this form fresh
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "version_conflict"
          ? "The other admin changed these settings meanwhile. Reload the page to see their version."
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="site_name">Website name</label>
          <input id="site_name" value={values.site_name} onChange={set("site_name")} required maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="tagline">Tagline</label>
          <input id="tagline" value={values.tagline} onChange={set("tagline")} maxLength={200} aria-describedby="tagline-hint" />
          <span id="tagline-hint" className="field-hint">
            Shown above the title on the home page. Empty: &quot;Tasted, reviewed, shared&quot;.
          </span>
        </div>
        <div className="field span-2">
          <label htmlFor="meta_description">Description for search engines</label>
          <textarea
            id="meta_description"
            value={values.meta_description}
            onChange={set("meta_description")}
            maxLength={170}
            aria-describedby="description-hint"
          />
          <span id="description-hint" className="field-hint">
            {values.meta_description.length} / 170 characters. The text under the home page in Google, and for any page
            without a description of its own. About 120–160 characters; say what makes the site yours.
          </span>
        </div>
        <div className="field">
          <label htmlFor="contact_email">Public contact email</label>
          <input id="contact_email" type="email" value={values.contact_email} onChange={set("contact_email")} aria-describedby="contact-hint" />
          <span id="contact-hint" className="field-hint">
            Shown on the About page. Use a shared address, not your sign-in email.
          </span>
        </div>
        <p className="field-hint span-2">
          The rest of the wording on the home and About pages, including the home page&apos;s title in Google, is
          edited under <Link href="/juniper/pages">Page texts</Link>.
        </p>
        <div className="field-checkbox span-2">
          <input id="default_gin_public" type="checkbox" checked={values.default_gin_public} onChange={set("default_gin_public")} />
          <label htmlFor="default_gin_public">New gins are public by default</label>
        </div>
      </div>
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save website settings"}
        </button>
      </div>
    </form>
  );
}
