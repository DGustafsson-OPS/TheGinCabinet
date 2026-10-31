// Messages sent with the public contact form (admins only: they hold
// visitors' names and email addresses). New messages arrive in the Inbox;
// they can be moved into folders (Ideas, Dennis, …), marked as spam (deleted
// 90 days later) and given notes. Everything is deleted after a year.
//
// Addresses: /juniper/messages (Inbox), ?folder=<id>, ?box=spam, and
// &show=unread for new messages only.
import type { Metadata } from "next";
import Link from "next/link";

import Pagination from "@/components/admin/Pagination";
import { param } from "@/lib/format";
import { apiGet, requireAdmin } from "@/lib/server-api";
import type { ContactMessage, MessageBoxes, Page } from "@/lib/types";

import FolderManager from "./FolderManager";
import MessageCard from "./MessageCard";
import styles from "./messages.module.css";

export const metadata: Metadata = { title: "Messages" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MessagesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const raw = await searchParams;
  const unread = param(raw.show) === "unread";
  const spam = param(raw.box) === "spam";
  const folderId = spam ? undefined : param(raw.folder);

  const query = new URLSearchParams({ page: param(raw.page) ?? "1", page_size: "25" });
  query.set("view", spam ? "spam" : folderId ? "folder" : "inbox");
  if (folderId) query.set("folder_id", folderId);
  if (unread) query.set("unread", "true");
  const [{ data }, { data: boxes }] = await Promise.all([
    apiGet<Page<ContactMessage>>(`/admin/messages?${query}`),
    apiGet<MessageBoxes>("/admin/messages/boxes"),
  ]);
  const folders = boxes?.folders ?? [];
  const current = folders.find((f) => f.id === folderId);
  const boxName = spam ? "Spam" : (current?.name ?? "Inbox");

  // Links keep "unread only" switched on or off as it is.
  const href = (target: { folder?: string; box?: string }, onlyUnread = unread) => {
    const p = new URLSearchParams();
    if (target.folder) p.set("folder", target.folder);
    if (target.box) p.set("box", target.box);
    if (onlyUnread) p.set("show", "unread");
    const q = p.toString();
    return `/juniper/messages${q ? `?${q}` : ""}`;
  };
  const here = { folder: folderId, box: spam ? "spam" : undefined };
  const count = (n: number) => (n > 0 ? <span className={styles.badge}>{n}</span> : null);

  return (
    <>
      <div className="page-header">
        <h1>Messages</h1>
        <Link className="button button-secondary" href={href(here, !unread)}>
          {unread ? "Show all" : "Show unread only"}
        </Link>
      </div>
      <p className="field-hint">
        From the contact form on the website. Reply from your own email and keep a copy as a note. Messages are deleted
        automatically after a year, and spam 90 days after it was marked.
      </p>

      <div className={styles.layout}>
        <nav aria-label="Message folders" className={styles.boxes}>
          <ul>
            <li>
              <Link href={href({})} aria-current={!spam && !folderId ? "page" : undefined}>
                Inbox {count(boxes?.inbox_unread ?? 0)}
              </Link>
            </li>
            {folders.map((f) => (
              <li key={f.id}>
                <Link href={href({ folder: f.id })} aria-current={folderId === f.id ? "page" : undefined}>
                  {f.name} {count(f.unread)}
                </Link>
              </li>
            ))}
            <li>
              <Link href={href({ box: "spam" })} aria-current={spam ? "page" : undefined}>
                Spam <span className="field-hint">{boxes?.spam_count ?? 0}</span>
              </Link>
            </li>
          </ul>
          <FolderManager folders={folders} />
        </nav>

        <div>
          <h2 className={styles.boxTitle}>
            {boxName}
            {unread && <span className="field-hint"> · unread only</span>}
          </h2>
          {spam && <p className="field-hint">Spam is deleted automatically 90 days after it was marked.</p>}
          {!data ? (
            <p className="alert alert-error" role="alert">
              The messages could not be loaded.
            </p>
          ) : data.items.length === 0 ? (
            <p className="empty-state">{unread ? "No unread messages here." : "No messages here."}</p>
          ) : (
            <>
              <ul className={styles.list}>
                {data.items.map((message) => (
                  <li key={message.id}>
                    <MessageCard message={message} folders={folders} />
                  </li>
                ))}
              </ul>
              <Pagination
                meta={data.meta}
                basePath="/juniper/messages"
                params={{ show: unread ? "unread" : undefined, folder: folderId, box: spam ? "spam" : undefined }}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
