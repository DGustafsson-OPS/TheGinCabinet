// Where editors land if they open an admin-only page (lib/server-api.ts).
import type { Metadata } from "next";
import Link from "next/link";

import { requireStaff } from "@/lib/server-api";

export const metadata: Metadata = { title: "For admins only" };

export default async function NotAllowedPage() {
  await requireStaff();
  return (
    <>
      <div className="page-header">
        <h1>For admins only</h1>
      </div>
      <p>
        This part of the admin area (inventory, prices, settings, messages and accounts) is for
        admins. As an editor you can write and publish the Journal, reviews, tastings, cocktails
        and tonics, manage photos and edit the page texts.
      </p>
      <p>
        <Link href="/juniper">Back to the dashboard</Link>
      </p>
    </>
  );
}
