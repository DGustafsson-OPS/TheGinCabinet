// A09 Media library: upload, browse by folder, and change many images at once.
//
// Addresses: /juniper/media (all images, newest first), ?folder=Gins/Hernö
// (one folder), ?folder=/ (images not in any folder), ?search=… (everywhere).
import type { Metadata } from "next";
import Link from "next/link";

import Pagination from "@/components/admin/Pagination";
import SearchBox from "@/components/admin/SearchBox";
import { param } from "@/lib/format";
import { apiGet, requireStaff } from "@/lib/server-api";
import type { Media, MediaFolder, Page } from "@/lib/types";

import FolderActions from "./FolderActions";
import MediaBrowser from "./MediaBrowser";
import UploadDropzone from "./UploadDropzone";
import styles from "./media.module.css";

export const metadata: Metadata = { title: "Media" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const folderHref = (path: string) => `/juniper/media?folder=${encodeURIComponent(path)}`;

export default async function MediaPage({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();
  const raw = await searchParams;
  const search = param(raw.search);
  const folder = param(raw.folder); // undefined = all, "/" = not filed, else a path
  const query = new URLSearchParams({ page: param(raw.page) ?? "1", page_size: "48" });
  if (search) query.set("search", search);
  if (folder) query.set("folder", folder);
  const [{ data }, folders] = await Promise.all([
    apiGet<Page<Media>>(`/admin/media?${query}`),
    apiGet<MediaFolder[]>("/admin/media/folders"),
  ]);
  const allFolders = folders.data ?? [];
  const inFolder = folder && folder !== "/" ? folder : undefined;
  // Direct subfolders of the folder being viewed, shown as tiles above the images.
  const children = allFolders.filter((f) =>
    inFolder ? f.path.startsWith(`${inFolder}/`) && !f.path.slice(inFolder.length + 1).includes("/") : !f.path.includes("/"),
  );
  const crumbs = inFolder ? inFolder.split("/").map((part, i, parts) => ({ part, path: parts.slice(0, i + 1).join("/") })) : [];

  return (
    <>
      <div className="page-header">
        <h1>Media</h1>
      </div>

      <div className={styles.library}>
        <nav aria-label="Folders" className={styles.folders}>
          <ul>
            <li>
              <Link href="/juniper/media" aria-current={!folder ? "page" : undefined}>
                All images
              </Link>
            </li>
            <li>
              <Link href={folderHref("/")} aria-current={folder === "/" ? "page" : undefined}>
                Not in a folder
              </Link>
            </li>
            {allFolders.map((f) => (
              <li key={f.path} style={{ paddingLeft: `${(f.path.split("/").length - 1) * 0.9}rem` }}>
                <Link href={folderHref(f.path)} aria-current={folder === f.path ? "page" : undefined}>
                  {f.path.split("/").at(-1)}
                </Link>{" "}
                <span className="field-hint">{f.count}</span>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          {inFolder && (
            <div className={styles.folderHead}>
              <nav aria-label="Breadcrumb">
                <Link href="/juniper/media">All images</Link>
                {crumbs.map((c) => (
                  <span key={c.path}>
                    {" / "}
                    {c.path === inFolder ? <strong>{c.part}</strong> : <Link href={folderHref(c.path)}>{c.part}</Link>}
                  </span>
                ))}
              </nav>
              <FolderActions folder={inFolder} />
            </div>
          )}

          <UploadDropzone folder={inFolder} />

          {!search && children.length > 0 && (
            <ul className={styles.subfolders} aria-label="Subfolders">
              {children.map((f) => (
                <li key={f.path}>
                  <Link href={folderHref(f.path)}>📁 {f.path.split("/").at(-1)}</Link>
                </li>
              ))}
            </ul>
          )}

          <div className="toolbar" style={{ marginTop: "var(--space-5)" }}>
            <SearchBox label="Search" placeholder="Name, folder, alt text, file name or credit" />
          </div>

          {!data ? (
            <p className="alert alert-error" role="alert">
              The media library could not be loaded.
            </p>
          ) : data.items.length === 0 ? (
            <p className="table-wrap empty-state">No images {search ? "match" : folder ? "in this folder" : "yet"}.</p>
          ) : (
            <>
              {/* `key`: a fresh selection whenever the folder, search or page changes. */}
              <MediaBrowser key={`${folder}|${search}|${data.meta.page}`} items={data.items} folders={allFolders.map((f) => f.path)} />
              <Pagination meta={data.meta} basePath="/juniper/media" params={{ search, folder }} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
