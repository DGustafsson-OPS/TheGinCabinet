// A10 Settings (spec §5): website settings, your own profile and security,
// and the people who can sign in. A server page that loads everything, then
// hands each part to a small client form. Editors see only their own profile
// and security tabs.
import type { Metadata } from "next";
import Link from "next/link";

import Tabs from "@/components/admin/Tabs";
import { formatDateTime } from "@/lib/format";
import { mediaOptions } from "@/lib/media-options";
import { apiGet, requireStaff } from "@/lib/server-api";
import type { AdminAccount, ConsentStats, Media, Page, Profile, SiteSettings } from "@/lib/types";

import AdminsPanel from "./AdminsPanel";
import { MfaChange, PasswordForm, ProfileForm, RecoveryCodes } from "./ProfileForms";
import SiteSettingsForm from "./SiteSettingsForm";

export const metadata: Metadata = { title: "Settings" };

/** How visitors answered the cookie banner (one count per browser, latest answer). */
function ConsentPanel({ stats }: { stats: ConsentStats | null }) {
  if (!stats) return <p className="alert alert-error">The consent figures could not be loaded.</p>;
  const share = stats.total ? Math.round((stats.analytics_allowed / stats.total) * 100) : 0;
  const labels: Record<string, string> = { accept_all: "Accept all", reject_all: "Reject all", custom: "Chose per category" };
  return (
    <div>
      <p>
        Answers to the cookie banner in the last {stats.days} days, counting each browser&apos;s latest answer.
        Every answer is stored as proof of consent (a random ID, the choice and the time; no personal data)
        and deleted after 3 years.
      </p>
      {stats.total === 0 ? (
        <p className="empty-state">No answers yet. The banner only appears when GA_MEASUREMENT_ID is set.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <tbody>
              <tr>
                <th scope="row">Browsers that answered</th>
                <td className="num">{stats.total}</td>
              </tr>
              <tr>
                <th scope="row">Allowed analytics</th>
                <td className="num">
                  {stats.analytics_allowed} ({share} %)
                </td>
              </tr>
              <tr>
                <th scope="row">Refused analytics</th>
                <td className="num">{stats.analytics_refused}</td>
              </tr>
              {Object.entries(stats.by_action).map(([action, count]) => (
                <tr key={action}>
                  <th scope="row">… of which “{labels[action] ?? action}”</th>
                  <td className="num">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="field-hint">
        Google Analytics only counts visitors who allowed it, so its figures are lower than the real number of
        visits.
      </p>
    </div>
  );
}

const NOTICE_TEXT: Record<string, string> = {
  "user.password_reset_by_admin": "reset your password",
  "user.updated_by_admin": "changed your account details",
};

export default async function SettingsPage() {
  const session = await requireStaff();
  const isAdmin = session.user.role === "admin";
  const none = { data: null };
  // The admin-only parts are only asked for when you're an admin.
  const [site, profile, admins, media, consent] = await Promise.all([
    isAdmin ? apiGet<SiteSettings>("/admin/settings") : none,
    apiGet<Profile>("/admin/profile"),
    isAdmin ? apiGet<AdminAccount[]>("/admin/admins") : none,
    isAdmin ? apiGet<Page<Media>>("/admin/media?page_size=100") : none,
    isAdmin ? apiGet<ConsentStats>("/admin/consent/stats?days=30") : none,
  ]);
  if (!profile.data || (isAdmin && (!site.data || !admins.data))) {
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
        {isAdmin && (
          <Link className="button button-secondary" href="/juniper/audit">
            Audit log
          </Link>
        )}
      </div>

      {me.notices.length > 0 && (
        <div className="alert alert-warning" role="alert">
          <strong>Changes to your account by an admin:</strong>
          <ul style={{ margin: 0 }}>
            {me.notices.map((notice) => (
              <li key={notice.at}>
                {notice.by} {NOTICE_TEXT[notice.action] ?? "changed your account"} on {formatDateTime(notice.at)}. If
                you didn&apos;t agree to this, talk to them (and change your password if it was reset).
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <Tabs
          label="Settings sections"
          tabs={[
            ...(isAdmin && site.data
              ? [
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
                ]
              : []),
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
            ...(isAdmin && admins.data
              ? [
                  { id: "people", label: "People", content: <AdminsPanel admins={admins.data} /> },
                  { id: "consent", label: "Cookie consent", content: <ConsentPanel stats={consent.data} /> },
                ]
              : []),
          ]}
        />
      </div>
    </>
  );
}
