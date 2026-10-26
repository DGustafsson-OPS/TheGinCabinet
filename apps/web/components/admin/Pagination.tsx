// "Page 2 of 5 · Previous · Next" links that keep the current filters.
import Link from "next/link";

import type { PageMeta } from "@/lib/types";

type Props = {
  meta: PageMeta;
  basePath: string;
  params: Record<string, string | undefined>;
};

export default function Pagination({ meta, basePath, params }: Props) {
  if (meta.pages <= 1) return null;

  const hrefFor = (page: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }
    query.set("page", String(page));
    return `${basePath}?${query.toString()}`;
  };

  return (
    <nav aria-label="Pages" className="pagination">
      {meta.page > 1 ? (
        <Link className="button button-secondary" href={hrefFor(meta.page - 1)}>
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span>
        Page {meta.page} of {meta.pages} · {meta.total} in total
      </span>
      {meta.page < meta.pages ? (
        <Link className="button button-secondary" href={hrefFor(meta.page + 1)}>
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
