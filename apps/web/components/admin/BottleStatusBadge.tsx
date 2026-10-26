// "Sealed", "Open · 450 ml", "Empty"... as a small label.
import type { Bottle } from "@/lib/types";

const LABELS = {
  sealed: "Sealed",
  open: "Open",
  empty: "Empty",
  gifted: "Gifted",
  disposed: "Disposed",
} as const;

export default function BottleStatusBadge({ bottle }: { bottle: Pick<Bottle, "status" | "remaining_ml"> }) {
  const variant =
    bottle.status === "sealed" ? "badge-sealed" : bottle.status === "open" ? "badge-open" : "badge-done";
  return (
    <span className={`badge ${variant}`}>
      {LABELS[bottle.status]}
      {bottle.status === "open" && bottle.remaining_ml != null && ` · ${bottle.remaining_ml} ml`}
    </span>
  );
}
