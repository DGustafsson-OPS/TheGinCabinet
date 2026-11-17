"use client";
// CSV import of gins, in two steps (spec §6 "Imports and export", §11):
//   1. "Preview": the API processes the whole file, then undoes everything,
//      and reports which rows would be added, skipped as duplicates or rejected.
//   2. "Import": the same file is sent again for real. The API runs the very
//      same code, so the result matches the preview (unless someone changed
//      the catalogue in between, which the final report would show).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import type { ImportIssue, ImportResult, ImportRow } from "@/lib/types";

const MAX_BYTES = 1_000_000; // the API refuses files over 1 MB

export default function ImportForm() {
  const { upload, toast } = useAdmin();
  const router = useRouter();
  const id = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);

  function chooseFile(chosen: File | null) {
    // A new file means any earlier preview no longer applies.
    setFile(chosen);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  async function send(dryRun: boolean): Promise<ImportResult | null> {
    if (!file) {
      setError("Choose a CSV file first.");
      return null;
    }
    if (file.size > MAX_BYTES) {
      setError("The file is larger than 1 MB.");
      return null;
    }
    const form = new FormData();
    form.append("file", file);
    setError(null);
    setBusy(dryRun ? "preview" : "import");
    try {
      return await upload<ImportResult>(`/admin/import/gins?dry_run=${dryRun}`, form);
    } catch (err) {
      setError(errorMessage(err));
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function runPreview() {
    const report = await send(true);
    if (report) setPreview(report);
  }

  async function runImport() {
    const report = await send(false);
    if (!report) return;
    setResult(report);
    setPreview(null);
    toast(`${report.created.length} ${report.created.length === 1 ? "gin" : "gins"} imported.`);
    router.refresh(); // so the gin and distillery lists show the new entries
  }

  return (
    <>
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>

      {!result && (
        <div className="card">
          <div className="field">
            <label htmlFor={`${id}-file`}>CSV file</label>
            <input
              id={`${id}-file`}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => chooseFile(e.target.files?.[0] ?? null)}
              aria-describedby={`${id}-hint`}
            />
            <span id={`${id}-hint`} className="field-hint">
              Columns: brand, name, edition, style, abv, country, distillery, botanicals,
              public_visible, description. Brand, name and abv are required. Separate botanicals
              with &quot;|&quot;. Saved from Excel with &quot;;&quot; between columns also works.
            </span>
          </div>
          <div className="form-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={runPreview}
              disabled={!file || busy !== null}
            >
              {busy === "preview" ? "Checking…" : "Preview import"}
            </button>
            {preview && (
              <button
                type="button"
                className="button button-primary"
                onClick={runImport}
                disabled={busy !== null || preview.created.length === 0}
              >
                {busy === "import"
                  ? "Importing…"
                  : `Import ${preview.created.length} ${preview.created.length === 1 ? "gin" : "gins"}`}
              </button>
            )}
          </div>
        </div>
      )}

      {preview && <Report report={preview} />}

      {result && (
        <>
          <Report report={result} />
          <div className="form-actions">
            <Link className="button button-primary" href="/juniper/gins">
              Go to gins
            </Link>
            <button type="button" className="button button-secondary" onClick={() => chooseFile(null)}>
              Import another file
            </button>
          </div>
        </>
      )}
    </>
  );
}

/** The importer's report: a summary line plus one table per outcome. */
function Report({ report }: { report: ImportResult }) {
  const { created, duplicates, rejected, new_distilleries: distilleries } = report;
  return (
    <section aria-label={report.dry_run ? "Import preview" : "Import result"}>
      <p className="alert alert-info">
        {report.dry_run ? "Preview, nothing saved yet: " : "Done: "}
        {report.total_rows} rows read. {created.length} {report.dry_run ? "would be added" : "added"},{" "}
        {duplicates.length} already in the catalogue, {rejected.length} rejected.
        {distilleries.length > 0 &&
          ` ${distilleries.length} new ${distilleries.length === 1 ? "distillery" : "distilleries"}.`}
      </p>
      {report.dry_run && created.length > 0 && (
        <p className="field-hint">
          Duplicates are found by brand + name + edition. Check the list below for gins you already
          have under a slightly different name.
        </p>
      )}

      <RowTable title={report.dry_run ? "Will be added" : "Added"} rows={created} />
      <RowTable title="Rejected" rows={rejected} />
      <RowTable title="Already in the catalogue (skipped)" rows={duplicates} />
      {distilleries.length > 0 && (
        <>
          <h2>New distilleries</h2>
          <p>{distilleries.join(", ")}</p>
        </>
      )}
    </section>
  );
}

function RowTable({ title, rows }: { title: string; rows: (ImportRow | ImportIssue)[] }) {
  if (rows.length === 0) return null;
  // Only duplicates and rejected rows carry reasons ("in" checks for the key).
  const withReasons = "reasons" in rows[0];
  return (
    <>
      <h2>
        {title} ({rows.length})
      </h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="num">Row</th>
              <th>Gin</th>
              {withReasons && <th>Reason</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.row}>
                <td className="num">{r.row}</td>
                <td>{r.name}</td>
                {withReasons && <td>{(r as ImportIssue).reasons.join("; ")}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
