// P07 Cocktail detail (spec §4): photo, summary, tags, prep time, method,
// glassware, serving stepper, ingredients, garnish, steps, recommended gins.
//
// The serving stepper is made of plain links (?servings=3). The server returns
// the scaled amounts, so it works even before (or without) JavaScript.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import MediaImage from "@/components/MediaImage";
import { formatAmount, formatStrength, humanize, param } from "@/lib/format";
import { SITE_URL, publicGet } from "@/lib/public-api";
import type { PublicCocktail } from "@/lib/types";

import styles from "../cocktails.module.css";

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const MIN_SERVINGS = 1;
const MAX_SERVINGS = 12;

async function load(slug: string, servings?: number) {
  const query = servings ? `?servings=${servings}` : "";
  return publicGet<PublicCocktail>(`/cocktails/${encodeURIComponent(slug)}${query}`);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const recipe = await load((await params).slug);
  if (!recipe) return { title: "Cocktail not found" };
  const description = recipe.seo_description ?? recipe.teaser;
  return {
    title: recipe.seo_title ?? recipe.title,
    description,
    // One canonical address, whatever the ?servings= value.
    alternates: { canonical: `/cocktails/${recipe.slug}` },
    openGraph: {
      type: "article",
      title: recipe.title,
      description,
      url: `${SITE_URL}/cocktails/${recipe.slug}`,
      images: recipe.cover ? [{ url: `${SITE_URL}${recipe.cover.url}`, alt: recipe.cover.alt ?? "" }] : undefined,
    },
  };
}

export default async function CocktailPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { slug } = await params;
  const requested = Number(param((await searchParams).servings));
  const servings = Number.isInteger(requested) && requested >= MIN_SERVINGS && requested <= MAX_SERVINGS ? requested : undefined;
  const recipe = await load(slug, servings);
  if (!recipe) notFound();

  const stepHref = (n: number) => `/cocktails/${recipe.slug}?servings=${n}`;
  const lessDisabled = recipe.servings <= MIN_SERVINGS;
  const moreDisabled = recipe.servings >= MAX_SERVINGS;

  // Structured data for search engines (schema.org Recipe), escaped safely.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    description: recipe.teaser,
    recipeCategory: "Cocktail",
    recipeYield: `${recipe.servings_base} drink${recipe.servings_base === 1 ? "" : "s"}`,
    ...(recipe.prep_minutes != null && { totalTime: `PT${recipe.prep_minutes}M` }),
    ...(recipe.cover && { image: `${SITE_URL}${recipe.cover.url}` }),
    keywords: recipe.tags.join(", "),
    recipeIngredient: recipe.ingredients.map((i) =>
      i.unit === "top up" ? `${i.name}, to top up` : [formatAmount(i.quantity, i.unit), i.name].filter(Boolean).join(" "),
    ),
    recipeInstructions: recipe.steps.map((text) => ({ "@type": "HowToStep", text })),
  };

  return (
    <article className={styles.recipe}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      <div className={styles.recipeHeader}>
        {recipe.cover ? (
          <MediaImage media={recipe.cover} className={styles.recipeImage} sizes="(min-width: 900px) 400px, 100vw" priority />
        ) : (
          <div className={styles.recipeImage} style={{ background: "linear-gradient(160deg, var(--color-sage), var(--color-forest))" }} aria-hidden="true" />
        )}
        <div>
          <h1 className={styles.recipeTitle}>{recipe.title}</h1>
          {recipe.intro && <p>{recipe.intro}</p>}
          <ul className={styles.facts}>
            <li>
              <strong>Method</strong> {humanize(recipe.method)}
            </li>
            <li>
              <strong>Difficulty</strong> {humanize(recipe.difficulty)}
            </li>
            {recipe.prep_minutes != null && (
              <li>
                <strong>Time</strong> {recipe.prep_minutes} min
              </li>
            )}
            {recipe.glassware && (
              <li>
                <strong>Glass</strong> {recipe.glassware}
              </li>
            )}
          </ul>
          {recipe.tags.length > 0 && (
            <ul className={styles.tags} aria-label="Tags">
              {recipe.tags.map((tag) => (
                <li key={tag} className="badge badge-sealed">
                  {tag}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className={styles.body}>
        {/* Left column: ingredients, then "What you need". */}
        <div>
          <section aria-labelledby="ingredients-title">
            <h2 id="ingredients-title" className={styles.sectionTitle}>
              Ingredients
            </h2>
            <div className={styles.stepper}>
              <Link
                href={stepHref(recipe.servings - 1)}
                className={styles.stepButton}
                aria-label="One drink fewer"
                aria-disabled={lessDisabled}
                tabIndex={lessDisabled ? -1 : undefined}
                scroll={false}
              >
                −
              </Link>
              {/* aria-live: screen readers hear the new number after each change. */}
              <span aria-live="polite">
                <strong>{recipe.servings}</strong> drink{recipe.servings === 1 ? "" : "s"}
              </span>
              <Link
                href={stepHref(recipe.servings + 1)}
                className={styles.stepButton}
                aria-label="One drink more"
                aria-disabled={moreDisabled}
                tabIndex={moreDisabled ? -1 : undefined}
                scroll={false}
              >
                +
              </Link>
            </div>
            <ul className={styles.ingredients}>
              {recipe.ingredients.map((line, index) => (
                <li key={index}>
                  <span className={styles.amount}>{formatAmount(line.quantity, line.unit)}</span>
                  <span>
                    {line.name}
                    {line.note && `, ${line.note}`}
                    {line.optional && " (optional)"}
                  </span>
                </li>
              ))}
              {recipe.garnish && (
                <li>
                  <span className={styles.amount}>{recipe.garnish_quantity ?? "To garnish"}</span>
                  <span>{recipe.garnish}</span>
                </li>
              )}
            </ul>
          </section>

          {(recipe.glassware || recipe.equipment.length > 0) && (
            <section aria-labelledby="equipment-title" className={styles.equipment}>
              <h2 id="equipment-title" className={styles.sectionTitle}>
                What you need
              </h2>
              <ul className={styles.ingredients}>
                {recipe.glassware && <li>{recipe.glassware}</li>}
                {recipe.equipment.map((tool) => (
                  <li key={tool}>{tool}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <section aria-labelledby="method-title">
          <h2 id="method-title" className={styles.sectionTitle}>
            Method
          </h2>
          <ol className={styles.steps}>
            {recipe.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>

          {recipe.recommended_gins.length > 0 && (
            <>
              <h2 className={styles.sectionTitle}>Best with</h2>
              <ul className={styles.pairings}>
                {recipe.recommended_gins.map((gin) => (
                  <li key={gin.slug} className="card">
                    <strong>
                      <Link href={`/gins/${gin.slug}`}>{gin.display_name}</Link>
                    </strong>
                    <div className="field-hint">
                      {[gin.country, formatStrength(gin.abv)].filter(Boolean).join(" · ")}
                    </div>
                    {gin.pairing_note && <p style={{ margin: "var(--space-2) 0 0" }}>{gin.pairing_note}</p>}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
      <p>
        <Link href="/cocktails">← All cocktails</Link>
      </p>
    </article>
  );
}
