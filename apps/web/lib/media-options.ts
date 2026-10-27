// Media library images as choices for a <select>, with a readable label.
import type { Media, MediaSummary } from "./types";

export type MediaOption = MediaSummary & { label: string };

export function mediaOptions(items: Media[], alsoInclude: MediaSummary[] = []): MediaOption[] {
  const options: MediaOption[] = items.map((m) => ({
    id: m.id,
    url: m.url,
    alt: m.alt,
    width: m.width,
    height: m.height,
    label: m.alt ?? m.original_filename ?? m.id.slice(0, 8),
  }));
  // Keep already-chosen images selectable even if they aren't in the first page.
  for (const chosen of alsoInclude) {
    if (!options.some((o) => o.id === chosen.id)) {
      options.push({ ...chosen, label: chosen.alt ?? "Current photo" });
    }
  }
  return options;
}
