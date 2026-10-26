// A09 Media library: upload and browse images (spec §5).
import type { Metadata } from "next";
import Link from "next/link";

import MediaImage from "@/components/MediaImage";
import Pagination from "@/components/admin/Pagination";
import SearchBox from "@/components/admin/SearchBox";
import { param } from "@/lib/format";
import { apiGet, requireAdmin } from "@/lib/server-api";
import type { Media, Page } from "@/lib/types";

import UploadDropzone from "./UploadDropzone";
import styles from "./media.module.css";

export const metadata: Metadata = { title: "Media" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MediaPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const raw = await searchParams;
  const search = param(raw.search);
  const query = new URLSearchParams({ page: param(raw.page) ?? "1", page_size: "24" });
  if (search) query.set("search", search);
  const { data } = await apiGet<Page<Media>>(`/admin/media?${query}`);

  return (
    <>
      <div className="page-header">
        <h1>Media</h1>
      </div>

      <UploadDropzone />

      <div className="toolbar" style={{ marginTop: "var(--space-5)" }}>
        <SearchBox label="Search" placeholder="Alt text, file name or credit" />
      </div>

      {!data ? (
        <p className="alert alert-error" role="alert">
          The media library could not be loaded.
        </p>
      ) : data.items.length === 0 ? (
        <p className="table-wrap empty-state">No images {search ? "match" : "yet"}.</p>
      ) : (
        <>
          <ul className={styles.grid}>
            {data.items.map((item) => (
              <li key={item.id} className={styles.tile}>
                <Link href={`/admin/media/${item.id}`} className={styles.tileLink}>
                  <MediaImage media={item} className={styles.thumb} sizes="240px" />
                  <span className={styles.caption}>
                    {item.alt ?? (item.decorative ? "Decorative" : "⚠ No alt text")}
                  </span>
                  {item.used_by.length > 0 && (
                    <span className={styles.used}>Used in {item.used_by.length}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
          <Pagination meta={data.meta} basePath="/admin/media" params={{ search }} />
        </>
      )}
    </>
  );
}
