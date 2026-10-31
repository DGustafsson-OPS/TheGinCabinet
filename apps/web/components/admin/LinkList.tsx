"use client";
// A short, ordered list of links to other things: the tonics for a cocktail,
// or the gins a tonic suits. Pick one from a menu, add an optional note, move
// it up or down, or remove it. Nothing is saved until the form's Save button.

import { useId, useRef } from "react";

export type LinkRow = { key: string; id: string; note: string };

type Props = {
  rows: LinkRow[];
  onChange: (rows: LinkRow[]) => void;
  options: { id: string; label: string }[];
  noun: string; // "tonic" or "gin", used in labels: "Tonic 1", "Add a tonic"
  privateIds?: string[]; // chosen items visitors can't see: shown with a warning
  notePlaceholder?: string;
};

/** Turn saved links into rows on screen; `tag` keeps React keys unique. */
export function toLinkRows(links: { id: string; note: string | null }[], tag = "init"): LinkRow[] {
  return links.map((l, i) => ({ key: `${tag}-${i}`, id: l.id, note: l.note ?? "" }));
}

/** Rows on screen → what the API expects, skipping rows with nothing picked. */
export function linkPayload<K extends string>(rows: LinkRow[], idField: K) {
  return rows
    .filter((r) => r.id)
    .map((r) => ({ [idField]: r.id, pairing_note: r.note.trim() || null }) as Record<K, string> & { pairing_note: string | null });
}

export default function LinkList({ rows, onChange, options, noun, privateIds = [], notePlaceholder }: Props) {
  const formId = useId();
  const counter = useRef(0);
  const Noun = noun[0].toUpperCase() + noun.slice(1);

  const update = (key: string, patch: Partial<LinkRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, by: -1 | 1) => {
    const copy = [...rows];
    [copy[index], copy[index + by]] = [copy[index + by], copy[index]];
    onChange(copy);
  };

  return (
    <>
      {rows.length === 0 && <p className="empty-state">None yet.</p>}
      <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rows.map((row, index) => {
          const n = index + 1;
          // Each item can be linked once: items picked in other rows are greyed out.
          const takenElsewhere = new Set(rows.filter((r) => r.key !== row.key).map((r) => r.id));
          return (
            <li key={row.key} className="card" style={{ marginBottom: "var(--space-3)" }}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor={`${formId}-item-${row.key}`}>
                    {Noun} {n}
                  </label>
                  <select id={`${formId}-item-${row.key}`} value={row.id} onChange={(e) => update(row.key, { id: e.target.value })} required>
                    <option value="" disabled>
                      Choose a {noun}…
                    </option>
                    {options.map((o) => (
                      <option key={o.id} value={o.id} disabled={takenElsewhere.has(o.id)}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {privateIds.includes(row.id) && (
                    <span className="field-hint">⚠ This {noun} is private, so visitors won&apos;t see the link.</span>
                  )}
                </div>
                <div className="field">
                  <label htmlFor={`${formId}-note-${row.key}`}>
                    Note<span className="visually-hidden"> for {noun} {n}</span> (optional)
                  </label>
                  <input
                    id={`${formId}-note-${row.key}`}
                    value={row.note}
                    maxLength={300}
                    placeholder={notePlaceholder}
                    onChange={(e) => update(row.key, { note: e.target.value })}
                  />
                </div>
              </div>
              <div className="form-actions" style={{ marginTop: 0 }}>
                <button type="button" className="button button-secondary" disabled={index === 0} onClick={() => move(index, -1)}>
                  Move up<span className="visually-hidden"> {noun} {n}</span>
                </button>
                <button type="button" className="button button-secondary" disabled={index === rows.length - 1} onClick={() => move(index, 1)}>
                  Move down<span className="visually-hidden"> {noun} {n}</span>
                </button>
                <button type="button" className="link-button" onClick={() => onChange(rows.filter((r) => r.key !== row.key))}>
                  Remove<span className="visually-hidden"> {noun} {n}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="button button-secondary"
        onClick={() => {
          counter.current += 1;
          onChange([...rows, { key: `new-${counter.current}`, id: "", note: "" }]);
        }}
      >
        Add a {noun}
      </button>
    </>
  );
}
