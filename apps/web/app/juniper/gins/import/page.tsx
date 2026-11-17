// Import gins from a CSV file: preview first, then confirm (spec §6, §11).
import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/server-api";

import ImportForm from "./ImportForm";

export const metadata: Metadata = { title: "Import gins" };

export default async function ImportGinsPage() {
  await requireAdmin();

  return (
    <>
      <Link className="back-link" href="/juniper/gins">
        ← All gins
      </Link>
      <div className="page-header">
        <h1>Import gins</h1>
      </div>
      <p>
        Add many gins at once from a spreadsheet saved as CSV. You see a preview first; nothing is
        saved until you confirm. Gins already in the catalogue are skipped, and distilleries that
        don&apos;t exist yet are created.
      </p>
      <ImportForm />
    </>
  );
}
