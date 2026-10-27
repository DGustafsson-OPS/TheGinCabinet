// One distillery and its public gins (spec P08).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import GinGrid from "@/components/GinGrid";
import { publicGet } from "@/lib/public-api";
import type { PublicDistillery } from "@/lib/types";

import styles from "../distilleries.module.css";

type Params = Promise<{ slug: string }>;

async function load(slug: string) {
  return publicGet<PublicDistillery>(`/distilleries/${encodeURIComponent(slug)}`);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const distillery = await load((await params).slug);
  if (!distillery) return { title: "Distillery not found" };
  return {
    title: distillery.name,
    description: distillery.description?.slice(0, 160) ?? `Gins from ${distillery.name}.`,
    alternates: { canonical: `/distilleries/${distillery.slug}` },
  };
}

export default async function DistilleryPage({ params }: { params: Params }) {
  const distillery = await load((await params).slug);
  if (!distillery) notFound();

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{distillery.name}</h1>
      <p className="field-hint">{[distillery.region, distillery.country].filter(Boolean).join(", ")}</p>
      {distillery.description && <p className={styles.description}>{distillery.description}</p>}
      {distillery.website && (
        <p>
          {/* External links are clearly marked (spec P08). */}
          <a href={distillery.website} target="_blank" rel="noopener noreferrer">
            Visit the distillery&apos;s website ↗<span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        </p>
      )}
      <h2 className={styles.subtitle}>Their gins in the collection</h2>
      <GinGrid gins={distillery.gins} />
      <p style={{ marginTop: "var(--space-6)" }}>
        <Link href="/distilleries">← All distilleries</Link>
      </p>
    </div>
  );
}
