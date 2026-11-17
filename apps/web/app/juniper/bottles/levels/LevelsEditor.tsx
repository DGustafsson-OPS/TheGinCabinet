"use client";
// The "Update levels" table. Nothing is saved until "Save all changes"; then
// every changed row goes to the API in one request (all or nothing).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import { ApiError } from "@/lib/api-client";
import type { Bottle } from "@/lib/types";

import styles from "./levels.module.css";

type State = "sealed" | "open" | "empty";
type Row = { status: State; level: number };

// What a bottle can become from here (sealed → opened → finished).
const CHOICES: Record<"sealed" | "open", { value: State; label: string }[]> = {
  sealed: [
    { value: "sealed", label: "Sealed" },
    { value: "open", label: "Opened" },
  ],
  open: [
    { value: "open", label: "Opened" },
    { value: "empty", label: "Finished" },
  ],
};

const start = (b: Bottle): Row => ({ status: b.status as State, level: b.remaining_ml ?? b.size_ml });

export default function LevelsEditor({ bottles }: { bottles: Bottle[] }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [rows, setRows] = useState<Record<string, Row>>(() => Object.fromEntries(bottles.map((b) => [b.id, start(b)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; bottleId?: string } | null>(null);

  const isChanged = (b: Bottle) => {
    const row = rows[b.id];
    return row.status !== b.status || (row.status === "open" && row.level !== (b.remaining_ml ?? b.size_ml));
  };
  const changed = bottles.filter(isChanged);
  const update = (id: string, patch: Partial<Row>) => setRows((now) => ({ ...now, [id]: { ...now[id], ...patch } }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const result = await call<{ changed: number }>("/admin/bottles/levels", "POST", {
        changes: changed.map((b) => {
          const row = rows[b.id];
          return {
            id: b.id,
            version: b.version,
            ...(row.status !== b.status && { status: row.status }),
            ...(row.status === "open" && { remaining_ml: row.level }),
          };
        }),
      });
      toast(`Saved: ${result.changed} bottle${result.changed === 1 ? "" : "s"} updated.`);
      router.refresh();
    } catch (err) {
      const bottleId = err instanceof ApiError ? (err.details as { bottle_id?: string } | null)?.bottle_id : undefined;
      setError({ message: `Nothing was saved. ${errorMessage(err)}`, bottleId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div role="alert">{error && <p className="alert alert-error">{error.message}</p>}</div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Bottle</th>
              <th scope="col">State</th>
              <th scope="col">How much is left</th>
            </tr>
          </thead>
          <tbody>
            {bottles.map((b) => {
              const row = rows[b.id];
              const name = `${b.gin.display_name}, ${b.size_ml} ml`;
              const percent = Math.round((row.level / b.size_ml) * 100);
              const rowClass = error?.bottleId === b.id ? styles.problem : isChanged(b) ? styles.changed : undefined;
              return (
                <tr key={b.id} className={rowClass}>
                  <td>
                    <Link href={`/juniper/bottles/${b.id}`}>{b.gin.display_name}</Link>
                    <div className="field-hint">
                      {b.size_ml} ml{b.shelf && ` · shelf ${b.shelf}`}
                    </div>
                  </td>
                  <td>
                    <select
                      className={styles.control}
                      aria-label={`State of ${name}`}
                      value={row.status}
                      onChange={(e) => {
                        const status = e.target.value as State;
                        // Opening a sealed bottle starts it full.
                        update(b.id, status === "open" && b.status === "sealed" ? { status, level: b.size_ml } : { status });
                      }}
                    >
                      {CHOICES[b.status as "sealed" | "open"].map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {row.status === "open" ? (
                      <div className={styles.level}>
                        <input
                          type="range"
                          min={0}
                          max={b.size_ml}
                          step={10}
                          value={row.level}
                          aria-label={`Level of ${name}`}
                          aria-valuetext={`${row.level} ml, ${percent} percent`}
                          onChange={(e) => update(b.id, { level: Number(e.target.value) })}
                        />
                        <input
                          type="number"
                          min={0}
                          max={b.size_ml}
                          value={row.level}
                          aria-label={`Millilitres left in ${name}`}
                          className={`${styles.control} ${styles.ml}`}
                          onChange={(e) => update(b.id, { level: Math.max(0, Number(e.target.value) || 0) })}
                        />
                        <span className="field-hint">ml · {percent} %</span>
                      </div>
                    ) : (
                      <span className="field-hint">{row.status === "sealed" ? "Full (sealed)" : "Finished: leaves the cabinet"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Stays at the bottom of the screen while scrolling a long list. */}
      <div className={styles.saveBar}>
        <span>{changed.length === 0 ? "No changes yet." : `${changed.length} bottle${changed.length === 1 ? "" : "s"} changed.`}</span>
        <button type="button" className="button button-primary" disabled={busy || changed.length === 0} onClick={save}>
          {busy ? "Saving…" : "Save all changes"}
        </button>
        <button
          type="button"
          className="link-button"
          disabled={busy || changed.length === 0}
          onClick={() => {
            setRows(Object.fromEntries(bottles.map((b) => [b.id, start(b)])));
            setError(null);
          }}
        >
          Undo changes
        </button>
      </div>
    </>
  );
}
