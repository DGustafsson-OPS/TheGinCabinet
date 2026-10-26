// /blog/rss.xml: an RSS feed of the latest published articles (spec §10A
// "syndication"). Feed readers poll this address for new stories.
import { SITE_URL, publicGet } from "@/lib/public-api";
import type { Page, PublicPostCard } from "@/lib/types";

export const dynamic = "force-dynamic"; // always build from live data

/** Make text safe inside XML: & < > " ' have special meanings there. */
function xml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function GET() {
  const data = await publicGet<Page<PublicPostCard>>("/blog?page_size=30");
  const items = (data?.items ?? [])
    .map((post) => {
      const url = `${SITE_URL}/blog/${post.slug}`;
      return [
        "<item>",
        `<title>${xml(post.title)}</title>`,
        `<link>${xml(url)}</link>`,
        `<guid isPermaLink="true">${xml(url)}</guid>`,
        post.published_at ? `<pubDate>${new Date(post.published_at).toUTCString()}</pubDate>` : "",
        post.category ? `<category>${xml(post.category.name)}</category>` : "",
        post.excerpt ? `<description>${xml(post.excerpt)}</description>` : "",
        "</item>",
      ].join("");
    })
    .join("\n");

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>The Gin Journal</title>
<link>${xml(`${SITE_URL}/blog`)}</link>
<atom:link href="${xml(`${SITE_URL}/blog/rss.xml`)}" rel="self" type="application/rss+xml" />
<description>Stories, distillery visits, guides and cocktail culture from The Gin Cabinet.</description>
<language>en</language>
${items}
</channel>
</rss>
`;
  return new Response(body, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}
