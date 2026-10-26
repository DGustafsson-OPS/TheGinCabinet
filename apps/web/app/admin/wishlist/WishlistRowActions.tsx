"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import type { WishlistItem } from "@/lib/types";

export default function WishlistRowActions({ item }: { item: WishlistItem }) {
  const router = useRouter();
  const { call, toast } = useAdmin();

  async function drop() {
    try {
      await call(`/admin/wishlist/${item.id}`, "PATCH", { version: item.version, status: "dropped" });
      toast("Removed from the wishlist.");
    } catch (err) {
      toast(errorMessage(err), "error");
    }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
      <Link className="button button-primary" href={`/admin/wishlist/${item.id}/convert`}>
        Bought it
      </Link>
      <ConfirmButton
        label="Drop"
        title={`Drop "${item.text}"?`}
        description="It moves to the Dropped list, with its notes kept."
        confirmLabel="Drop it"
        onConfirm={drop}
      />
    </div>
  );
}
