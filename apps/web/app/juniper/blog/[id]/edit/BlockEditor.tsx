"use client";
// The article body editor (spec A12): a list of blocks you can add, edit,
// reorder and remove. Each block is a <fieldset> with its own labelled
// controls, so it works fully with the keyboard and screen readers.
//
// Blocks are data, not HTML: a paragraph is just text, and links are written
// as [label](https://…). Gins, reviews, cocktails and other articles are
// embedded "by reference": you pick one, and the website draws its card.

import { useEffect, useRef } from "react";

import MediaImage from "@/components/MediaImage";
import ConfirmButton from "@/components/admin/ConfirmButton";
import PhotoUpload from "@/components/admin/PhotoUpload";
import type { MediaOption } from "@/lib/media-options";
import type { PostBlock, RelationKind } from "@/lib/types";

export type BlockRow = PostBlock & { key: string };
export type RefOptions = Record<RelationKind, { id: string; label: string }[]>;

export const KIND_LABELS: Record<RelationKind, string> = {
  gin: "Gin",
  review: "Review",
  cocktail: "Cocktail",
  post: "Journal article",
};

const TYPE_LABELS: Record<PostBlock["type"], string> = {
  heading: "Heading",
  paragraph: "Paragraph",
  list: "List",
  quote: "Quotation",
  image: "Image",
  card: "Embedded card",
};

/** A new, empty block of the given type. */
function emptyBlock(type: PostBlock["type"]): PostBlock {
  switch (type) {
    case "heading":
      return { type, level: 2, text: "" };
    case "paragraph":
      return { type, text: "" };
    case "list":
      return { type, ordered: false, items: [""] };
    case "quote":
      return { type, text: "", cite: "" };
    case "image":
      return { type, media_id: "", caption: "" };
    case "card":
      return { type, kind: "gin", id: "" };
  }
}

type Props = {
  idPrefix: string;
  blocks: BlockRow[];
  onChange: (blocks: BlockRow[]) => void;
  newKey: () => string;
  media: MediaOption[];
  /** A photo uploaded from an image block; the article editor adds it to everyone's list. */
  onPhotoUploaded: (photo: MediaOption) => void;
  refs: RefOptions;
};

export default function BlockEditor({ idPrefix, blocks, onChange, newKey, media, refs, onPhotoUploaded }: Props) {
  // After adding a block, move keyboard focus into it.
  const focusKey = useRef<string | null>(null);
  useEffect(() => {
    if (!focusKey.current) return;
    document.getElementById(`${idPrefix}-${focusKey.current}-main`)?.focus();
    focusKey.current = null;
  }, [blocks, idPrefix]);

  const update = (index: number, patch: Partial<PostBlock>) =>
    onChange(blocks.map((b, i) => (i === index ? ({ ...b, ...patch } as BlockRow) : b)));
  const moveBlock = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= blocks.length) return;
    const copy = [...blocks];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    onChange(copy);
  };
  const add = (type: PostBlock["type"]) => {
    const key = newKey();
    focusKey.current = key;
    onChange([...blocks, { ...emptyBlock(type), key } as BlockRow]);
  };

  return (
    <div>
      {blocks.length === 0 && <p className="field-hint">The article is empty. Add a paragraph to start writing.</p>}
      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "var(--space-3)" }}>
        {blocks.map((block, index) => {
          const id = (part: string) => `${idPrefix}-${block.key}-${part}`;
          const name = `${TYPE_LABELS[block.type]} (block ${index + 1})`;
          return (
            <li key={block.key}>
              <fieldset className="block-card">
                <legend>{name}</legend>
                {block.type === "heading" && (
                  <div className="form-grid">
                    <div className="field span-2">
                      <label htmlFor={id("main")}>Heading text</label>
                      <input id={id("main")} value={block.text} maxLength={200} onChange={(e) => update(index, { text: e.target.value })} />
                    </div>
                    <div className="field">
                      <label htmlFor={id("level")}>Level</label>
                      <select id={id("level")} value={block.level} onChange={(e) => update(index, { level: Number(e.target.value) as 2 | 3 })}>
                        <option value={2}>Section heading (H2)</option>
                        <option value={3}>Sub-heading (H3)</option>
                      </select>
                    </div>
                  </div>
                )}
                {block.type === "paragraph" && (
                  <div className="field">
                    <label htmlFor={id("main")}>Text</label>
                    <textarea id={id("main")} value={block.text} onChange={(e) => update(index, { text: e.target.value })} aria-describedby={id("hint")} />
                    <span id={id("hint")} className="field-hint">
                      **bold**, *italic*, links: [label](https://example.com) or [label](/collection).
                    </span>
                  </div>
                )}
                {block.type === "list" && (
                  <>
                    <div className="field">
                      <label htmlFor={id("main")}>Items, one per line</label>
                      <textarea id={id("main")} value={block.items.join("\n")} onChange={(e) => update(index, { items: e.target.value.split("\n") })} />
                    </div>
                    <div className="field-checkbox">
                      <input id={id("ordered")} type="checkbox" checked={block.ordered} onChange={(e) => update(index, { ordered: e.target.checked })} />
                      <label htmlFor={id("ordered")}>Numbered list</label>
                    </div>
                  </>
                )}
                {block.type === "quote" && (
                  <div className="form-grid">
                    <div className="field span-2">
                      <label htmlFor={id("main")}>Quotation</label>
                      <textarea id={id("main")} value={block.text} onChange={(e) => update(index, { text: e.target.value })} />
                    </div>
                    <div className="field">
                      <label htmlFor={id("cite")}>Who said it (optional)</label>
                      <input id={id("cite")} value={block.cite ?? ""} maxLength={200} onChange={(e) => update(index, { cite: e.target.value })} />
                    </div>
                  </div>
                )}
                {block.type === "image" && (
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor={id("main")}>Image from the media library</label>
                      <select id={id("main")} value={block.media_id} onChange={(e) => update(index, { media_id: e.target.value })}>
                        <option value="">Choose an image…</option>
                        {media.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <PhotoUpload
                        onUploaded={(p) => {
                          onPhotoUploaded(p);
                          update(index, { media_id: p.id });
                        }}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor={id("caption")}>Caption (optional)</label>
                      <input id={id("caption")} value={block.caption ?? ""} maxLength={300} onChange={(e) => update(index, { caption: e.target.value })} />
                    </div>
                    {(() => {
                      const chosen = media.find((m) => m.id === block.media_id);
                      return chosen ? <MediaImage media={{ ...chosen, alt: "" }} sizes="200px" className="photo-thumb" /> : null;
                    })()}
                  </div>
                )}
                {block.type === "card" && (
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor={id("kind")}>Type</label>
                      <select id={id("kind")} value={block.kind} onChange={(e) => update(index, { kind: e.target.value as RelationKind, id: "" })}>
                        {(Object.keys(KIND_LABELS) as RelationKind[]).map((kind) => (
                          <option key={kind} value={kind}>
                            {KIND_LABELS[kind]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={id("main")}>{KIND_LABELS[block.kind]}</label>
                      <select id={id("main")} value={block.id} onChange={(e) => update(index, { id: e.target.value })}>
                        <option value="">Choose…</option>
                        {refs[block.kind].map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <span className="field-hint">Private or unpublished items are left out of the public page.</span>
                    </div>
                  </div>
                )}
                <div className="form-actions" style={{ marginTop: "var(--space-2)" }}>
                  <button type="button" className="button button-secondary" disabled={index === 0} onClick={() => moveBlock(index, -1)}>
                    Move up<span className="visually-hidden"> {name}</span>
                  </button>
                  <button type="button" className="button button-secondary" disabled={index === blocks.length - 1} onClick={() => moveBlock(index, 1)}>
                    Move down<span className="visually-hidden"> {name}</span>
                  </button>
                  <ConfirmButton
                    quiet
                    label={<>Remove<span className="visually-hidden"> {name}</span></>}
                    title={`Remove ${name}?`}
                    description="Its content is removed from the article. It disappears from the form now; nothing is saved until you press Save."
                    confirmLabel="Remove block"
                    onConfirm={() => onChange(blocks.filter((_, i) => i !== index))}
                  />
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
      <div className="form-actions" role="group" aria-label="Add a block">
        {(Object.keys(TYPE_LABELS) as PostBlock["type"][]).map((type) => (
          <button key={type} type="button" className="button button-secondary" onClick={() => add(type)}>
            + {TYPE_LABELS[type]}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Blocks as the API expects them: keys removed, empty blocks left out. */
export function cleanBlocks(rows: BlockRow[]): PostBlock[] {
  const result: PostBlock[] = [];
  for (const row of rows) {
    const block = row as PostBlock; // the extra `key` is simply not copied below
    switch (block.type) {
      case "heading":
      case "paragraph":
        if (block.text.trim()) {
          result.push(
            block.type === "heading"
              ? { type: "heading", level: block.level, text: block.text.trim() }
              : { type: "paragraph", text: block.text.trim() },
          );
        }
        break;
      case "quote":
        if (block.text.trim()) result.push({ type: "quote", text: block.text.trim(), cite: block.cite?.trim() || null });
        break;
      case "list": {
        const items = block.items.map((i) => i.trim()).filter(Boolean);
        if (items.length) result.push({ type: "list", ordered: block.ordered, items });
        break;
      }
      case "image":
        if (block.media_id) result.push({ type: "image", media_id: block.media_id, caption: block.caption?.trim() || null });
        break;
      case "card":
        if (block.id) result.push({ type: "card", kind: block.kind, id: block.id });
        break;
    }
  }
  return result;
}
