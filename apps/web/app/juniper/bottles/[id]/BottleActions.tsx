"use client";
// The life-cycle buttons for one bottle (spec §6 "Consume bottle"):
//   sealed → open → empty, or → gifted / disposed at any point.
// Final steps ask for confirmation first (spec §2).

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import type { BottleDetail, BottleStatus } from "@/lib/types";

export default function BottleActions({ bottle }: { bottle: BottleDetail }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [level, setLevel] = useState(String(bottle.remaining_ml ?? bottle.size_ml));
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      toast(success);
    } catch (err) {
      if (err instanceof ApiError && err.code === "version_conflict") {
        toast("Someone else just changed this bottle. The page has been reloaded.", "error");
      } else {
        toast(errorMessage(err), "error");
      }
    } finally {
      setBusy(false);
      router.refresh(); // fetch the bottle again, with its new history entry
    }
  }

  const setStatus = (status: BottleStatus, success: string) =>
    run(() => call(`/admin/bottles/${bottle.id}/status`, "POST", { version: bottle.version, status }), success);

  if (bottle.status === "empty" || bottle.status === "gifted" || bottle.status === "disposed") {
    return (
      <p>
        This bottle left the cabinet on {formatDate(bottle.finished_at)}. Its record and history
        are kept.
      </p>
    );
  }

  return (
    <div>
      {bottle.status === "open" && (
        <form
          className="form-actions"
          style={{ alignItems: "flex-end" }}
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () =>
                call(`/admin/bottles/${bottle.id}`, "PATCH", {
                  version: bottle.version,
                  remaining_ml: Number(level),
                }),
              "Level updated.",
            );
          }}
        >
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="level">About how much is left (ml)</label>
            <input
              id="level"
              type="number"
              min={0}
              max={bottle.size_ml}
              value={level}
              onChange={(event) => setLevel(event.target.value)}
            />
          </div>
          <button className="button button-secondary" type="submit" disabled={busy}>
            Update level
          </button>
        </form>
      )}

      <div className="form-actions">
        {bottle.status === "sealed" && (
          <button
            type="button"
            className="button button-primary"
            disabled={busy}
            onClick={() => setStatus("open", "Bottle opened. Cheers!")}
          >
            Open bottle
          </button>
        )}
        {bottle.status === "open" && (
          <ConfirmButton
            label="Mark as empty"
            title="Mark this bottle as empty?"
            description="It will leave the cabinet. Its history is kept, but it can't be reopened."
            confirmLabel="Mark as empty"
            onConfirm={() => setStatus("empty", "Marked as empty.")}
            disabled={busy}
          />
        )}
        <ConfirmButton
          label="Gifted away"
          title="Record this bottle as given away?"
          description="It will leave the cabinet. Its history is kept."
          confirmLabel="Yes, it was gifted"
          onConfirm={() => setStatus("gifted", "Recorded as gifted.")}
          disabled={busy}
        />
        <ConfirmButton
          label="Dispose"
          title="Dispose of this bottle?"
          description="Use this for broken or spoiled bottles. Its history is kept."
          confirmLabel="Dispose"
          danger
          onConfirm={() => setStatus("disposed", "Recorded as disposed.")}
          disabled={busy}
        />
      </div>
    </div>
  );
}
