// A10 Settings & admins (spec §5): website settings, your own profile and
// security, and the two admin accounts. A server page that loads everything,
// then hands each part to a small client form.
import type { Metadata } from "next";
import Link from "next/link";

import Tabs from "@/components/admin/Tabs";
import { formatDateTime } from "@/lib/format";
import { mediaOptions } from "@/lib/media-options";
import { apiGet, requireAdmin } from "@/lib/server-api";
import type { AdminAccount, Media, Page, Profile, SiteSettings } from "@/lib/types";

import AdminsPanel from "./AdminsPanel";
import { MfaChange, PasswordForm, ProfileForm, RecoveryCodes } from "./ProfileForms";
import SiteSettingsForm from "./SiteSettingsForm";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireAdmin();
  const [site, profile, admins, media] = await Promise.all([
    apiGet<SiteSettings>("/admin/settings"),
    apiGet<Profile>("/admin/profile"),
    apiGet<AdminAccount[]>("/admin/admins"),
    apiGet<Page<Media>>("/admin/media?page_size=100"),
  ]);
  if (!site.data || !profile.data || !admins.data) {
    return (
      <p className="alert alert-error" role="alert">
        The settings could not be loaded.
      </p>
    );
  }
  const me = profile.data;

  return (
    <>
      <div className="page-header">
        <h1>Settings</h1>
        <Link className="button button-secondary" href="/admin/audit">
          Audit log
        </Link>
      </div>

      {me.notices.length > 0 && (
        <div className="alert alert-warning" role="alert">
          <strong>Changes to your account by the other admin:</strong>
          <ul style={{ margin: 0 }}>
            {me.notices.map((notice) => (
              <li key={notice.at}>
                {notice.by} reset your password on {formatDateTime(notice.at)}. If you didn&apos;t agree to
                this, change your password now and talk to them.
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <Tabs
          label="Settings sections"
          tabs={[
            {
              id: "website",
              label: "Website",
              content: (
                <SiteSettingsForm
                  key={site.data.version}
                  settings={site.data}
                  media={mediaOptions(media.data?.items ?? [], site.data.logo ? [site.data.logo] : [])}
                />
              ),
            },
            {
              id: "profile",
              label: "My profile",
              content: <ProfileForm key={`${me.display_name}|${me.email}`} profile={me} />,
            },
            {
              id: "security",
              label: "Password & sign-in",
              content: (
                <div style={{ display: "grid", gap: "var(--space-6)" }}>
                  <PasswordForm />
                  <MfaChange pending={me.mfa_setup_pending} />
                  <RecoveryCodes left={me.recovery_codes_left} />
                </div>
              ),
            },
            {
              id: "admins",
              label: "Admins",
              content: <AdminsPanel admins={admins.data} />,
            },
          ]}
        />
      </div>
    </>
  );
}
