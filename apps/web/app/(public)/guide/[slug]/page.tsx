// One Gin guide page: /guide/[slug], with its own search-engine title,
// description and sharing image.
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import GuideArticle from "@/components/GuideArticle";
import { SITE_URL, publicGet } from "@/lib/public-api";
import type { PublicGuidePage } from "@/lib/types";

type Params = Promise<{ slug: string }>;

const load = (slug: string) => publicGet<PublicGuidePage>(`/guide/${encodeURIComponent(slug)}`);

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const page = await load((await params).slug);
  if (!page) return { title: "Page not found" };
  const description = page.seo_description ?? page.summary ?? undefined;
  return {
    title: page.seo_title ?? page.title,
    description,
    alternates: { canonical: `/guide/${page.slug}` },
    openGraph: {
      type: "article",
      title: page.title,
      description,
      url: `${SITE_URL}/guide/${page.slug}`,
      modifiedTime: page.updated_at,
      images: page.image ? [{ url: `${SITE_URL}${page.image.url}`, alt: page.image.alt ?? "" }] : undefined,
    },
  };
}

export default async function GuideSlugPage({ params }: { params: Params }) {
  const page = await load((await params).slug);
  if (!page) notFound();
  return <GuideArticle page={page} />;
}
