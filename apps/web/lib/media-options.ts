// Media library images as choices for a <select>, with a readable label.
import type { Media, MediaSummary } from "./types";

export type MediaOption = MediaSummary & { label: string };

/**
 * "Gins/Hernö › Hernö bottle 1 — Bottle on a wooden bar": folder and name make
 * a photo easy to find; the description tells similar photos apart.
 */
export function mediaLabel(m: Pick<Media, "id" | "name" | "folder" | "alt" | "original_filename">): string {
  const name = m.name ?? m.alt ?? m.original_filename ?? m.id.slice(0, 8);
  const label = [m.folder, name].filter(Boolean).join(" › ");
  return m.alt && m.alt !== name ? `${label} — ${m.alt}` : label;
}

export function mediaOptions(items: Media[], alsoInclude: MediaSummary[] = []): MediaOption[] {
  const options: MediaOption[] = items.map((m) => ({
    id: m.id,
    url: m.url,
    alt: m.alt,
    width: m.width,
    height: m.height,
    label: mediaLabel(m),
  }));
  // Keep already-chosen images selectable even if they aren't in the first page.
  for (const chosen of alsoInclude) {
    if (!options.some((o) => o.id === chosen.id)) {
      options.push({ ...chosen, label: chosen.alt ?? "Current photo" });
    }
  }
  return options;
}
