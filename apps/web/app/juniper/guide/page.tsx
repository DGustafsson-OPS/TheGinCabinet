// Gin guide: every guide page in the order visitors see them. Add a page,
// change the order, and open a page to edit it.
import type { Metadata } from "next";
import Link from "next/link";

import { apiGet, requireStaff } from "@/lib/server-api";
import type { GuidePage } from "@/lib/types";

import GuideList from "./GuideList";

export const metadata: Metadata = { title: "Gin guide" };

export default async function GuideAdminPage() {
  await requireStaff();
  const { data } = await apiGet<GuidePage[]>("/admin/guide");

  return (
    <>
      <div className="page-header">
        <h1>Gin guide</h1>
        <Link className="button button-secondary" href="/guide">
          View the guide
        </Link>
      </div>
      <p className="field-hint">
        Lasting pages about gin (styles, history, glassware…), shown under &quot;Gin guide&quot; on the website in this
        order. The menu link appears once at least one page is published. The guide&apos;s introduction is under{" "}
        <Link href="/juniper/pages">Page texts</Link>.
      </p>
      {!data ? (
        <p className="alert alert-error" role="alert">
          The guide pages could not be loaded.
        </p>
      ) : (
        // `key`: after a change the server sends a new list; start from it.
        <GuideList key={data.map((p) => `${p.id}:${p.version}`).join()} pages={data} />
      )}
    </>
  );
}
