// Page texts: the wording on the home and About pages, the contact page and
// the footer, edited here instead of in the code. Admins and editors.
import type { Metadata } from "next";

import { apiGet, requireStaff } from "@/lib/server-api";
import type { PageText } from "@/lib/types";

import PageTextsEditor from "./PageTextsEditor";

export const metadata: Metadata = { title: "Page texts" };

export default async function PageTextsPage() {
  await requireStaff();
  const { data } = await apiGet<PageText[]>("/admin/page-texts");
  return (
    <>
      <div className="page-header">
        <h1>Page texts</h1>
      </div>
      <p className="field-hint">
        The fixed wording on the website. Each text shows the default until you change it, and you can always go back
        to the default. Changes appear on the site as soon as you save.
      </p>
      {data ? (
        <PageTextsEditor texts={data} />
      ) : (
        <p className="alert alert-error" role="alert">
          The page texts could not be loaded. Please refresh the page.
        </p>
      )}
    </>
  );
}
