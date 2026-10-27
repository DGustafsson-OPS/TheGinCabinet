// One distillery: edit its details. The gins it makes are listed under Gins.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { apiGet, requireAdmin } from "@/lib/server-api";
import type { Distillery } from "@/lib/types";

import DistilleryEditForm from "./DistilleryEditForm";

export const metadata: Metadata = { title: "Edit distillery" };

type Params = Promise<{ id: string }>;

export default async function DistilleryPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const { data: distillery } = await apiGet<Distillery>(`/admin/distilleries/${id}`);
  if (!distillery) notFound();

  return (
    <>
      <Link className="back-link" href="/juniper/distilleries">
        ← All distilleries
      </Link>
      <div className="page-header">
        <h1>{distillery.name}</h1>
        <Link className="button button-secondary" href={`/juniper/gins?distillery=${distillery.id}`}>
          Its gins ({distillery.gin_count})
        </Link>
      </div>
      {/* `key`: after each save the page reloads and the form starts fresh. */}
      <DistilleryEditForm key={distillery.version} distillery={distillery} />
    </>
  );
}
