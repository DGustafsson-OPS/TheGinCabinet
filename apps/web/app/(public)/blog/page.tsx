// B01 Journal landing (spec §10A): /blog
import type { Metadata } from "next";

import { param } from "@/lib/format";

import JournalListing from "./JournalListing";

export const metadata: Metadata = {
  title: "The Gin Journal",
  description: "Stories, distillery visits, guides and cocktail culture from The Gin Cabinet.",
  alternates: {
    canonical: "/blog",
    types: { "application/rss+xml": [{ url: "/blog/rss.xml", title: "The Gin Journal" }] },
  },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BlogPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  return (
    <JournalListing
      heading="Stories from the cabinet"
      intro="Distillery visits, gin guides, cocktail culture and notes from our collection."
      basePath="/blog"
      page={param(raw.page) ?? "1"}
      search={param(raw.search)?.trim() || undefined}
      showFeatured
    />
  );
}
