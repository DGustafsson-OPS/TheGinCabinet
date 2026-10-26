// One image: preview, alt text, credit and where it is used (spec A09).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import MediaImage from "@/components/MediaImage";
import { formatDateTime } from "@/lib/format";
import { adminNames, apiGet, requireAdmin } from "@/lib/server-api";
import type { Media } from "@/lib/types";

import MediaEditForm from "./MediaEditForm";
import styles from "../media.module.css";

export const metadata: Metadata = { title: "Image" };

type Params = Promise<{ id: string }>;

export default async function MediaItemPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const [{ data: media }, names] = await Promise.all([apiGet<Media>(`/admin/media/${id}`), adminNames()]);
  if (!media) notFound();

  return (
    <>
      <Link className="back-link" href="/juniper/media">
        ← Media library
      </Link>
      <div className="page-header">
        <h1>{media.original_filename ?? "Image"}</h1>
      </div>
      <div className={styles.layout}>
        <div className="card">
          <MediaImage media={media} className={styles.preview} sizes="(min-width: 1000px) 50vw, 100vw" />
          <p className="field-hint">
            {media.width} × {media.height} px · {media.mime} · {Math.round(media.size_bytes / 1024)} KB
            <br />
            Uploaded {formatDateTime(media.created_at)}
            {media.uploaded_by_id && names.get(media.uploaded_by_id) && ` by ${names.get(media.uploaded_by_id)}`}
          </p>
          <h2 style={{ fontSize: "var(--font-size-h3)" }}>Used in</h2>
          {media.used_by.length === 0 ? (
            <p>Not used anywhere yet.</p>
          ) : (
            <ul>
              {media.used_by.map((use) => (
                <li key={use}>{use}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <MediaEditForm key={media.version} media={media} />
        </div>
      </div>
    </>
  );
}
