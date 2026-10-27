import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { apiGet, requireStaff } from "@/lib/server-api";
import { mediaOptions } from "@/lib/media-options";
import type { Cocktail, Gin, Media, Page } from "@/lib/types";

import CocktailEditor from "./CocktailEditor";

export const metadata: Metadata = { title: "Edit recipe" };

type Params = Promise<{ id: string }>;

export default async function CocktailPage({ params }: { params: Params }) {
  await requireStaff();
  const { id } = await params;
  const [{ data: cocktail }, gins, media, ingredients] = await Promise.all([
    apiGet<Cocktail>(`/admin/cocktails/${id}`),
    apiGet<Page<Gin>>("/admin/gins?page_size=100"),
    apiGet<Page<Media>>("/admin/media?page_size=100"),
    apiGet<{ name: string }[]>("/admin/ingredients"),
  ]);
  if (!cocktail) notFound();

  const options = mediaOptions(media.data?.items ?? [], cocktail.cover_image ? [cocktail.cover_image] : []);

  return (
    <>
      <Link className="back-link" href="/juniper/cocktails">
        ← All recipes
      </Link>
      <div className="page-header">
        <h1>{cocktail.title}</h1>
      </div>
      {/* No `key={version}` here: the editor tracks saves itself, so it keeps
          the open tab. `key={id}` gives a fresh editor for a different recipe. */}
      <CocktailEditor
        key={cocktail.id}
        cocktail={cocktail}
        gins={(gins.data?.items ?? []).map((g) => ({ id: g.id, slug: g.slug, display_name: g.display_name }))}
        media={options}
        knownIngredients={(ingredients.data ?? []).map((i) => i.name)}
      />
    </>
  );
}
