// B03 Category page (spec §10A): /blog/category/[slug]
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { param } from "@/lib/format";
import { publicGet } from "@/lib/public-api";
import type { PublicCategory } from "@/lib/types";

import JournalListing from "../../JournalListing";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function findCategory(slug: string) {
  const categories = await publicGet<PublicCategory[]>("/blog/categories");
  return categories?.find((c) => c.slug === slug) ?? null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const category = await findCategory((await params).slug);
  if (!category) return { title: "Category not found" };
  return {
    title: `${category.name} · The Gin Journal`,
    description: category.description ?? `${category.name}: stories from The Gin Cabinet.`,
    alternates: { canonical: `/blog/category/${category.slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const category = await findCategory((await params).slug);
  if (!category) notFound();
  const raw = await searchParams;
  return (
    <JournalListing
      heading={category.name}
      intro={category.description}
      basePath={`/blog/category/${category.slug}`}
      page={param(raw.page) ?? "1"}
      search={param(raw.search)?.trim() || undefined}
      category={category.slug}
    />
  );
}
