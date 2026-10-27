// "Previous · Page 2 of 5 · Next" for public lists, keeping the current filters.
import Link from "next/link";

import type { PageMeta } from "@/lib/types";

type Props = { meta: PageMeta; basePath: string; params: Record<string, string | undefined> };

export default function PublicPagination({ meta, basePath, params }: Props) {
  if (meta.pages <= 1) return null;
  const href = (page: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
    if (page > 1) query.set("page", String(page));
    const text = query.toString();
    return text ? `${basePath}?${text}` : basePath;
  };
  return (
    <nav aria-label="Pages" className="pagination">
      {meta.page > 1 ? (
        <Link className="button button-secondary" href={href(meta.page - 1)}>
          Previous
        </Link>
      ) : (
        <span />
      )}
      <span>
        Page {meta.page} of {meta.pages}
      </span>
      {meta.page < meta.pages ? (
        <Link className="button button-secondary" href={href(meta.page + 1)}>
          Next
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
