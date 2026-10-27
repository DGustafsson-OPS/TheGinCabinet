// The Gin guide's front page: the editable introduction (Admin → Page texts)
// and a card for every published guide page, in the order the editors chose.
import type { Metadata } from "next";

import FormattedText from "@/components/FormattedText";
import { GuideGrid } from "@/components/GuideArticle";
import { getSite, publicGet, siteText } from "@/lib/public-api";
import type { PublicGuideCard } from "@/lib/types";

import styles from "../tonics/tonics.module.css";

export const metadata: Metadata = {
  title: "Gin guide",
  description: "Gin styles, history, glassware, garnishes and how to make the perfect gin and tonic.",
  alternates: { canonical: "/guide" },
};

export default async function GuidePage() {
  const [site, pages] = await Promise.all([getSite(), publicGet<PublicGuideCard[]>("/guide")]);

  return (
    <div className={styles.page}>
      <header style={{ marginBottom: "var(--space-6)" }}>
        <h1 className={styles.title}>Gin guide</h1>
        <FormattedText text={siteText(site, "guide.intro")} />
      </header>
      {pages === null ? (
        <p className="alert alert-error" role="alert">
          The guide could not be loaded. Please try again in a moment.
        </p>
      ) : pages.length === 0 ? (
        <p className="empty-state">The first guide pages are being written.</p>
      ) : (
        <GuideGrid pages={pages} />
      )}
    </div>
  );
}
