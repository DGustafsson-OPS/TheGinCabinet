// A01 Dashboard (spec §5): four stat tiles, public numbers kept separate from
// private ones, and recent activity from the audit log.
//
// This is a Server Component: it fetches the numbers on the server, using the
// visitor's own session, and sends finished HTML to the browser.
import type { Metadata } from "next";

import { apiGet, requireAdmin } from "@/lib/server-api";
import type { AuditEvent, Dashboard, InventoryValue } from "@/lib/types";

import styles from "./dashboard.module.css";

export const metadata: Metadata = { title: "Dashboard" };

// Readable wording for audit actions. Unknown ones fall back to the raw code.
const ACTION_LABELS: Record<string, string> = {
  "auth.login": "signed in",
  "auth.logout": "signed out",
  "gin.create": "added a gin",
  "gin.update": "edited a gin",
  "distillery.create": "added a distillery",
  "distillery.update": "edited a distillery",
  "bottle.create": "added bottles",
  "bottle.update": "updated a bottle",
  "bottle.status": "changed a bottle's status",
  "purchase.create": "recorded a purchase",
  "purchase.update": "edited a purchase",
  "wishlist.create": "added to the wishlist",
  "wishlist.update": "edited the wishlist",
  "wishlist.convert": "bought a wishlist item",
  "import.gins": "imported gins",
  "export.full": "exported all data",
  "export.gins_csv": "exported the gin list",
  "user.create": "created an admin account",
};

function formatMoney(value: InventoryValue): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: value.currency }).format(
    Number(value.amount),
  );
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC", // stored in UTC (spec §7); shown as such until settings add a timezone
  }).format(new Date(iso));
}

function describe(event: AuditEvent): string {
  if (event.action === "auth.login_failed") {
    const username = event.summary.username;
    return typeof username === "string"
      ? `Failed sign-in attempt (${username})`
      : "Failed sign-in attempt";
  }
  const who = event.actor_name ?? "Someone";
  return `${who} ${ACTION_LABELS[event.action] ?? event.action}`;
}

export default async function DashboardPage() {
  const session = await requireAdmin();
  const { data } = await apiGet<Dashboard>("/admin/dashboard");

  return (
    <>
      <header className={styles.header}>
        <h1>Dashboard</h1>
        <p className={styles.welcome}>Welcome back, {session.user.display_name}.</p>
      </header>

      {!data ? (
        <p className="alert alert-error" role="alert">
          The dashboard could not be loaded. Please refresh the page.
        </p>
      ) : (
        <>
          <section aria-labelledby="private-title">
            <h2 id="private-title" className={styles.sectionTitle}>
              Private inventory
            </h2>
            <div className={styles.tiles}>
              <Tile label="Unique gins" value={data.unique_gins} />
              <Tile label="Bottles in the cabinet" value={data.physical_bottles} />
              <Tile label="Open bottles" value={data.open_bottles} />
              <div className={`card ${styles.tile}`}>
                <p className={styles.tileLabel}>Inventory value</p>
                {data.inventory_value.length === 0 ? (
                  <p className={styles.tileValue}>–</p>
                ) : (
                  data.inventory_value.map((value) => (
                    <p key={value.currency} className={styles.tileValue}>
                      {formatMoney(value)}
                    </p>
                  ))
                )}
                {/* Spec A01: unknown costs are excluded *and* shown. */}
                {data.bottles_without_cost > 0 && (
                  <p className={styles.tileNote}>
                    Excludes {data.bottles_without_cost} bottle
                    {data.bottles_without_cost === 1 ? "" : "s"} with unknown cost
                  </p>
                )}
              </div>
            </div>
          </section>

          <div className={styles.columns}>
            <section aria-labelledby="activity-title" className="card">
              <h2 id="activity-title" className={styles.sectionTitle}>
                Recent activity
              </h2>
              {data.recent_activity.length === 0 ? (
                <p className={styles.empty}>Nothing has happened yet.</p>
              ) : (
                <ol className={styles.activity}>
                  {data.recent_activity.map((event) => (
                    <li key={event.id}>
                      <span>{describe(event)}</span>
                      <time dateTime={event.occurred_at} className={styles.when}>
                        {formatWhen(event.occurred_at)} UTC
                      </time>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section aria-labelledby="public-title" className="card">
              <h2 id="public-title" className={styles.sectionTitle}>
                Public site
              </h2>
              <dl className={styles.facts}>
                <dt>Gins visible to the public</dt>
                <dd>{data.public_gins}</dd>
                <dt>Wishlist (private)</dt>
                <dd>{data.wishlist_wanted} wanted</dd>
              </dl>
            </section>
          </div>
        </>
      )}
    </>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className={`card ${styles.tile}`}>
      <p className={styles.tileLabel}>{label}</p>
      <p className={styles.tileValue}>{value}</p>
    </div>
  );
}
