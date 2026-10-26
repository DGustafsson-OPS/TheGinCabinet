// One physical bottle: details, life-cycle actions and its full history
// (spec §5 A03 "preserve history; status transitions recorded").
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import BottleStatusBadge from "@/components/admin/BottleStatusBadge";
import { formatDate, formatDateTime, humanize } from "@/lib/format";
import { adminNames, apiGet, requireAdmin } from "@/lib/server-api";
import type { BottleDetail, BottleEvent } from "@/lib/types";

import BottleActions from "./BottleActions";
import BottleEditForm from "./BottleEditForm";
import styles from "./bottle.module.css";

export const metadata: Metadata = { title: "Bottle" };

type Params = Promise<{ id: string }>;

const AUTOMATIC_NOTES = new Set(["Added to the cabinet", "Level updated"]);

function describeEvent(event: BottleEvent): string {
  if (event.from_status === null) return "Added to the cabinet";
  if (event.from_status === event.to_status) return `Level updated to ${event.remaining_ml} ml`;
  return `${humanize(event.from_status)} → ${humanize(event.to_status)}`;
}

export default async function BottlePage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const [{ data: bottle }, names] = await Promise.all([
    apiGet<BottleDetail>(`/admin/bottles/${id}`),
    adminNames(),
  ]);
  if (!bottle) notFound();

  return (
    <>
      <Link className="back-link" href="/admin/bottles">
        ← All bottles
      </Link>
      <div className="page-header">
        <h1>
          {bottle.gin.display_name}{" "}
          <span className={styles.bottleId}>#{bottle.id.slice(0, 8)}</span>
        </h1>
        <Link className="button button-secondary" href={`/admin/gins/${bottle.gin.id}`}>
          View gin
        </Link>
      </div>

      <div className={styles.layout}>
        <section className="card" aria-labelledby="state-title">
          <h2 id="state-title" className={styles.sectionTitle}>
            State
          </h2>
          <dl className={styles.facts}>
            <dt>Status</dt>
            <dd>
              <BottleStatusBadge bottle={bottle} />
            </dd>
            <dt>Size</dt>
            <dd>{bottle.size_ml} ml</dd>
            <dt>Opened</dt>
            <dd>{formatDate(bottle.opened_at)}</dd>
            <dt>Finished / left</dt>
            <dd>{formatDate(bottle.finished_at)}</dd>
            <dt>Acquired</dt>
            <dd>{formatDate(bottle.acquired_on)}</dd>
            <dt>From</dt>
            <dd>
              {bottle.purchase_line_id ? "A recorded purchase" : (bottle.source ?? "–")}
            </dd>
          </dl>
          {/* `key` resets the client component after each saved change. */}
          <BottleActions key={bottle.version} bottle={bottle} />
        </section>

        <section className="card" aria-labelledby="details-title">
          <h2 id="details-title" className={styles.sectionTitle}>
            Details
          </h2>
          <BottleEditForm key={bottle.version} bottle={bottle} />
        </section>
      </div>

      <section className="card" aria-labelledby="history-title" style={{ marginTop: "var(--space-4)" }}>
        <h2 id="history-title" className={styles.sectionTitle}>
          History
        </h2>
        <ol className={styles.timeline}>
          {[...bottle.events].reverse().map((event) => (
            <li key={event.id}>
              <strong>{describeEvent(event)}</strong>
              {/* Show notes people wrote, not the API's automatic ones. */}
              {event.note && !AUTOMATIC_NOTES.has(event.note) && <span> · {event.note}</span>}
              <div className={styles.when}>
                {formatDateTime(event.occurred_at)}
                {event.actor_id && names.get(event.actor_id) && ` · by ${names.get(event.actor_id)}`}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
