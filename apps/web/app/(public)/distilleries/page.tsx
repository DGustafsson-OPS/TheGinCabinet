// P08 Distilleries (spec §4): producers with at least one public gin.
import type { Metadata } from "next";
import Link from "next/link";

import { publicGet } from "@/lib/public-api";
import type { PublicDistilleryCard } from "@/lib/types";

import styles from "./distilleries.module.css";

export const metadata: Metadata = {
  title: "Distilleries",
  description: "The distilleries behind the gins in The Gin Cabinet.",
  alternates: { canonical: "/distilleries" },
};

export default async function DistilleriesPage() {
  const distilleries = await publicGet<PublicDistilleryCard[]>("/distilleries");

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Distilleries</h1>
      <p>The makers behind the bottles.</p>
      {!distilleries ? (
        <p className="alert alert-error" role="alert">
          The distilleries could not be loaded right now.
        </p>
      ) : distilleries.length === 0 ? (
        <p className="empty-state">No distilleries to show yet.</p>
      ) : (
        <ul className={styles.list}>
          {distilleries.map((d) => (
            <li key={d.slug} className="card">
              <h2 className={styles.name}>
                <Link href={`/distilleries/${d.slug}`}>{d.name}</Link>
              </h2>
              <p className="field-hint">
                {[d.region, d.country].filter(Boolean).join(", ") || "Origin unknown"} · {d.gin_count} gin
                {d.gin_count === 1 ? "" : "s"} in the collection
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
