// B03 Tag page (spec §10A): /blog/tag/[slug]
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { param } from "@/lib/format";
import { publicGet } from "@/lib/public-api";
import type { PublicTag } from "@/lib/types";

import JournalListing from "../../JournalListing";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const loadTag = (slug: string) => publicGet<PublicTag>(`/blog/tags/${encodeURIComponent(slug)}`);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const tag = await loadTag((await params).slug);
  if (!tag) return { title: "Tag not found" };
  return {
    title: `#${tag.name} · The Gin Journal`,
    description: `Stories tagged “${tag.name}” from The Gin Cabinet.`,
    alternates: { canonical: `/blog/tag/${tag.slug}` },
  };
}

export default async function TagPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const tag = await loadTag((await params).slug);
  if (!tag) notFound();
  const raw = await searchParams;
  return (
    <JournalListing
      heading={`Stories tagged “${tag.name}”`}
      intro={null}
      basePath={`/blog/tag/${tag.slug}`}
      page={param(raw.page) ?? "1"}
      search={param(raw.search)?.trim() || undefined}
      tag={tag.slug}
    />
  );
}
