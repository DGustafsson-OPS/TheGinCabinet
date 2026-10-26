"use client";
// Shown when the API answers 409 version_conflict (spec §6 "Two-person edit
// conflict"): someone else saved this record after you opened it. We show both
// versions of each field you changed and let you choose deliberately.

import { humanize } from "@/lib/format";

type Props = {
  diff: Record<string, { yours: unknown; current: unknown }>;
  onKeepMine: () => void;
  onTakeTheirs: () => void;
  busy?: boolean;
};

// Friendlier names for API field names; anything else is "humanized".
const FIELD_LABELS: Record<string, string> = {
  abv: "ABV",
  slug: "URL name",
  public_visible: "Public",
  distillery_id: "Distillery",
  remaining_ml: "Remaining (ml)",
  acquired_on: "Date acquired",
};

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "(empty)";
  if (Array.isArray(value)) return value.join(", ") || "(empty)";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export default function ConflictPanel({ diff, onKeepMine, onTakeTheirs, busy }: Props) {
  const fields = Object.entries(diff);
  return (
    <section className="alert alert-warning" role="alert" aria-labelledby="conflict-title">
      <h2 id="conflict-title" style={{ fontSize: "var(--font-size-h3)" }}>
        Someone else saved this in the meantime
      </h2>
      {fields.length === 0 ? (
        <p>Their changes don&apos;t touch the fields you edited, but your copy is out of date.</p>
      ) : (
        <div className="table-wrap" style={{ margin: "var(--space-3) 0" }}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Your version</th>
                <th scope="col">Saved version</th>
              </tr>
            </thead>
            <tbody>
              {fields.map(([field, values]) => (
                <tr key={field}>
                  <th scope="row">{FIELD_LABELS[field] ?? humanize(field)}</th>
                  <td>{show(values.yours)}</td>
                  <td>{show(values.current)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="button button-primary" onClick={onKeepMine} disabled={busy}>
          Keep my version
        </button>
        <button type="button" className="button button-secondary" onClick={onTakeTheirs} disabled={busy}>
          Discard mine and load theirs
        </button>
      </div>
    </section>
  );
}
