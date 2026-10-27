// Messages sent with the public contact form (admins only: they hold
// visitors' names and email addresses). Deleted automatically after a year.
import type { Metadata } from "next";
import Link from "next/link";

import Pagination from "@/components/admin/Pagination";
import { param } from "@/lib/format";
import { apiGet, requireAdmin } from "@/lib/server-api";
import type { ContactMessage, Page } from "@/lib/types";

import MessageCard from "./MessageCard";

export const metadata: Metadata = { title: "Messages" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function MessagesPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const raw = await searchParams;
  const unread = param(raw.show) === "unread";
  const query = new URLSearchParams({ page: param(raw.page) ?? "1", page_size: "25" });
  if (unread) query.set("unread", "true");
  const { data } = await apiGet<Page<ContactMessage>>(`/admin/messages?${query}`);

  return (
    <>
      <div className="page-header">
        <h1>Messages</h1>
        <Link className="button button-secondary" href={unread ? "/juniper/messages" : "/juniper/messages?show=unread"}>
          {unread ? "Show all" : "Show unread only"}
        </Link>
      </div>
      <p className="field-hint">
        From the contact form on the website. Reply from your own email; messages are deleted automatically after a
        year.
      </p>
      {!data ? (
        <p className="alert alert-error" role="alert">
          The messages could not be loaded.
        </p>
      ) : data.items.length === 0 ? (
        <p className="empty-state">{unread ? "No unread messages." : "No messages yet."}</p>
      ) : (
        <>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "var(--space-4)" }}>
            {data.items.map((message) => (
              <li key={message.id}>
                <MessageCard message={message} />
              </li>
            ))}
          </ul>
          <Pagination meta={data.meta} basePath="/juniper/messages" params={{ show: unread ? "unread" : undefined }} />
        </>
      )}
    </>
  );
}
