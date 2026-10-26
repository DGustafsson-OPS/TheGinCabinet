"use client";
// The article table (spec A11), with checkboxes for "archive selected" and a
// per-row duplicate action. Archiving asks for confirmation first.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import MediaImage from "@/components/MediaImage";
import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import PostStatusBadge from "@/components/admin/PostStatusBadge";
import { formatDateTime } from "@/lib/format";
import type { Post } from "@/lib/types";

type BulkResult = { archived: number; skipped: string[] };

export default function PostTable({ posts }: { posts: Post[] }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = posts.length > 0 && posts.every((p) => selected.has(p.id));

  async function archiveSelected() {
    const items = posts.filter((p) => selected.has(p.id)).map((p) => ({ id: p.id, version: p.version }));
    try {
      const result = await call<BulkResult>("/admin/blog/bulk-archive", "POST", { items });
      const skipped = result.skipped.length
        ? ` Skipped because someone changed them meanwhile: ${result.skipped.join(", ")}.`
        : "";
      toast(`Archived ${result.archived} article${result.archived === 1 ? "" : "s"}.${skipped}`);
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      toast(errorMessage(err));
    }
  }

  async function duplicate(post: Post) {
    setBusy(true);
    try {
      const copy = await call<Post>(`/admin/blog/${post.id}/duplicate`, "POST");
      toast("Copied into a new draft.");
      router.push(`/juniper/blog/${copy.id}/edit`);
    } catch (err) {
      toast(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <div className="form-actions" style={{ marginTop: 0, marginBottom: "var(--space-3)" }}>
        <ConfirmButton
          label={`Archive selected (${selected.size})`}
          title={`Archive ${selected.size} article${selected.size === 1 ? "" : "s"}?`}
          description="Archived articles leave the public website. You can restore each one to draft later."
          confirmLabel="Archive"
          danger
          disabled={selected.size === 0}
          onConfirm={archiveSelected}
        />
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">
                <input
                  type="checkbox"
                  aria-label="Select all articles on this page"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(posts.map((p) => p.id)))}
                />
              </th>
              <th scope="col">
                <span className="visually-hidden">Image</span>
              </th>
              <th scope="col">Title</th>
              <th scope="col">Category</th>
              <th scope="col">Author</th>
              <th scope="col">Status</th>
              <th scope="col">Published / scheduled</th>
              <th scope="col">Last change</th>
              <th scope="col">
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {posts.map((post) => (
              <tr key={post.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${post.title}`}
                    checked={selected.has(post.id)}
                    onChange={() => toggle(post.id)}
                  />
                </td>
                <td>
                  {post.hero_image ? (
                    <MediaImage media={{ ...post.hero_image, alt: "" }} sizes="64px" className="photo-thumb" />
                  ) : null}
                </td>
                <td>
                  <Link href={`/juniper/blog/${post.id}/edit`}>{post.title}</Link>
                </td>
                <td>{post.category?.name ?? "–"}</td>
                <td>{post.author.display_name}</td>
                <td>
                  <PostStatusBadge post={post} />
                </td>
                <td>
                  {post.status === "scheduled" && post.scheduled_at
                    ? formatDateTime(post.scheduled_at)
                    : post.published_at
                      ? formatDateTime(post.published_at)
                      : "–"}
                </td>
                <td>
                  {formatDateTime(post.updated_at)}
                  {post.edited_by && <div className="field-hint">by {post.edited_by.display_name}</div>}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <Link href={`/juniper/blog/${post.id}/preview`}>
                    Preview<span className="visually-hidden"> {post.title}</span>
                  </Link>{" "}
                  ·{" "}
                  <button type="button" className="link-button" disabled={busy} onClick={() => duplicate(post)}>
                    Duplicate<span className="visually-hidden"> {post.title}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
