// Article status. "Live on the site" appears only when visitors can really
// read the article right now (spec A11: a status badge must never be mistaken
// for a live-public indicator). A scheduled article says so plainly.
import { formatDateTime } from "@/lib/format";
import type { Post } from "@/lib/types";

type Props = { post: Pick<Post, "status" | "is_live" | "scheduled_at"> };

export default function PostStatusBadge({ post }: Props) {
  if (post.is_live) return <span className="badge badge-public">Live on the site</span>;
  if (post.status === "scheduled" && post.scheduled_at) {
    return <span className="badge badge-open">Scheduled · not live until {formatDateTime(post.scheduled_at)}</span>;
  }
  if (post.status === "published") return <span className="badge badge-open">Published · not live yet</span>;
  const labels = { draft: "Draft · not public", archived: "Archived · not public" } as const;
  return <span className="badge badge-private">{labels[post.status as "draft" | "archived"]}</span>;
}
