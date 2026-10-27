"use client";
// The Gin guide page editor: everything on the page is editable here.
// * Text: headings, paragraphs, lists, quotes, images and gin/review/cocktail
//   cards, with the Journal's block editor.
// * Details: title and summary. Image: cover photo and credit.
// * Search engines: the address (slug), title and description.
// Publishing and deleting ask "Are you sure?" first. If someone else saved
// the page meanwhile, a conflict panel shows both versions instead of
// silently overwriting.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useId, useRef, useState } from "react";

import BlockEditor, { type BlockRow, type RefOptions, cleanBlocks } from "@/app/juniper/blog/[id]/edit/BlockEditor";
import MediaImage from "@/components/MediaImage";
import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import ConflictPanel from "@/components/admin/ConflictPanel";
import PhotoUpload from "@/components/admin/PhotoUpload";
import Tabs from "@/components/admin/Tabs";
import UnsavedChangesGuard from "@/components/admin/UnsavedChangesGuard";
import { ApiError } from "@/lib/api-client";
import type { MediaOption } from "@/lib/media-options";
import type { ConflictDetails, GuidePage } from "@/lib/types";

type Fields = {
  title: string; slug: string; summary: string; hero_media_id: string;
  hero_credit: string; seo_title: string; seo_description: string;
};

function toFields(p: GuidePage): Fields {
  return {
    title: p.title, slug: p.slug, summary: p.summary ?? "", hero_media_id: p.hero_media_id ?? "",
    hero_credit: p.hero_credit ?? "", seo_title: p.seo_title ?? "", seo_description: p.seo_description ?? "",
  };
}
const toBlocks = (p: GuidePage, tag: string): BlockRow[] => p.body_blocks.map((b, i) => ({ ...b, key: `${tag}-${i}` }));
const text = (value: string) => value.trim() || null;

/** Everything on screen as the JSON the API expects. */
function payload(f: Fields, blocks: BlockRow[]): Record<string, unknown> {
  return {
    title: f.title.trim(),
    slug: f.slug.trim() || null,
    summary: text(f.summary),
    hero_media_id: f.hero_media_id || null,
    hero_credit: text(f.hero_credit),
    seo_title: text(f.seo_title),
    seo_description: text(f.seo_description),
    body_blocks: cleanBlocks(blocks),
  };
}

type Props = { page: GuidePage; media: MediaOption[]; refs: RefOptions };

export default function GuidePageEditor({ page, media: library, refs }: Props) {
  const [uploaded, setUploaded] = useState<MediaOption[]>([]); // photos uploaded from this page
  const media = [...uploaded, ...library];
  const router = useRouter();
  const idPrefix = useId();
  const counter = useRef(0);
  const newKey = useCallback(() => {
    counter.current += 1;
    return `new-${counter.current}`;
  }, []);
  const { call, toast } = useAdmin();

  const [saved, setSaved] = useState<GuidePage>(page); // the last version the server confirmed
  const [fields, setFields] = useState<Fields>(() => toFields(page));
  const [blocks, setBlocks] = useState<BlockRow[]>(() => toBlocks(page, "init"));
  const [original, setOriginal] = useState(() => payload(toFields(page), toBlocks(page, "init")));
  const [conflict, setConflict] = useState<ConflictDetails<GuidePage> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = payload(fields, blocks);
  const changed = Object.keys(current).filter((k) => JSON.stringify(current[k]) !== JSON.stringify(original[k]));
  const dirty = changed.length > 0;

  /** Show a saved version of the page (after saving, or "take theirs"). */
  function loadFrom(next: GuidePage) {
    const nextFields = toFields(next);
    const nextBlocks = toBlocks(next, `v${next.version}`);
    setSaved(next);
    setFields(nextFields);
    setBlocks(nextBlocks);
    setOriginal(payload(nextFields, nextBlocks));
  }

  async function send(body: Record<string, unknown>, force = false): Promise<GuidePage | null> {
    setBusy(true);
    setError(null);
    try {
      const updated = await call<GuidePage>(`/admin/guide/${page.id}${force ? "?force=true" : ""}`, "PATCH", {
        version: saved.version,
        ...body,
      });
      setConflict(null);
      loadFrom(updated);
      router.refresh();
      return updated;
    } catch (err) {
      if (err instanceof ApiError && err.code === "version_conflict") {
        setConflict(err.details as ConflictDetails<GuidePage>);
      } else {
        setError(errorMessage(err));
      }
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function save(force = false) {
    if (!dirty) return toast("Nothing to save.");
    const updated = await send(Object.fromEntries(changed.map((k) => [k, current[k]])), force);
    if (updated) toast(updated.published ? "Saved. The page on the website is updated." : "Saved.");
  }

  async function setPublished(published: boolean) {
    const updated = await send({ published });
    if (updated) toast(published ? "Published. It's on the website now." : "Unpublished. It's no longer on the website.");
  }

  async function remove() {
    try {
      await call(`/admin/guide/${page.id}`, "DELETE");
      toast(`"${saved.title}" deleted.`);
      router.push("/juniper/guide");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const set = (field: keyof Fields) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setFields((f) => ({ ...f, [field]: event.target.value }));
  const id = (name: string) => `${idPrefix}-${name}`;
  const counterHint = (field: "seo_title" | "seo_description" | "summary", max: number) => (
    <span className="field-hint">
      {fields[field].length} / {max} characters
    </span>
  );
  const chosenHero = media.find((m) => m.id === fields.hero_media_id);

  return (
    <>
      <UnsavedChangesGuard dirty={dirty} />
      <section className="card" aria-labelledby={id("status")} style={{ marginBottom: "var(--space-4)" }}>
        <h2 id={id("status")} style={{ fontSize: "var(--font-size-h3)" }}>
          Status:{" "}
          <span className={saved.published ? "badge badge-public" : "badge badge-private"}>
            {saved.published ? "Published" : "Draft (not on the website)"}
          </span>
        </h2>
        {dirty && <p className="field-hint">Save your changes before publishing or unpublishing.</p>}
        <div className="form-actions">
          {saved.published ? (
            <ConfirmButton
              label="Unpublish"
              title="Take this page off the website?"
              description="It stays here as a draft. You can publish it again later."
              confirmLabel="Unpublish"
              disabled={busy || dirty}
              onConfirm={() => setPublished(false)}
            />
          ) : (
            <ConfirmButton
              label="Publish"
              title="Publish this page?"
              description="It appears in the Gin guide on the website straight away."
              confirmLabel="Publish now"
              disabled={busy || dirty}
              onConfirm={() => setPublished(true)}
            />
          )}
          <Link className="button button-secondary" href={`/juniper/guide/${page.id}/preview`}>
            Preview
          </Link>
          {saved.published && (
            <Link className="button button-secondary" href={`/guide/${saved.slug}`}>
              View on the site
            </Link>
          )}
          <ConfirmButton
            label="Delete page"
            title={`Delete "${saved.title}"?`}
            description="The page and its text are deleted for good. Photos stay in the media library."
            confirmLabel="Delete"
            danger
            quiet
            disabled={busy}
            onConfirm={remove}
          />
        </div>
      </section>

      <form
        className="card"
        aria-label="Edit guide page"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        {conflict && (
          <ConflictPanel
            diff={conflict.diff}
            busy={busy}
            onKeepMine={() => save(true)}
            onTakeTheirs={() => {
              loadFrom(conflict.current);
              setConflict(null);
              toast("Loaded the saved version.");
            }}
          />
        )}
        <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>

        <Tabs
          label="Page sections"
          tabs={[
            {
              id: "body",
              label: "Text",
              content: (
                <BlockEditor
                  idPrefix={idPrefix}
                  blocks={blocks}
                  onChange={setBlocks}
                  newKey={newKey}
                  media={media}
                  refs={refs}
                  onPhotoUploaded={(p) => setUploaded((list) => [p, ...list])}
                />
              ),
            },
            {
              id: "details",
              label: "Title and summary",
              content: (
                <div className="form-grid">
                  <div className="field span-2">
                    <label htmlFor={id("title")}>Title</label>
                    <input id={id("title")} value={fields.title} onChange={set("title")} required maxLength={200} />
                  </div>
                  <div className="field span-2">
                    <label htmlFor={id("summary")}>Summary</label>
                    <textarea id={id("summary")} value={fields.summary} onChange={set("summary")} maxLength={600} aria-describedby={id("summary-hint")} />
                    <span id={id("summary-hint")} className="field-hint">
                      One or two sentences, shown under the title and on the guide&apos;s front page.
                    </span>
                    {counterHint("summary", 600)}
                  </div>
                </div>
              ),
            },
            {
              id: "image",
              label: "Cover photo",
              content: (
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor={id("hero")}>Cover photo</label>
                    <select id={id("hero")} value={fields.hero_media_id} onChange={set("hero_media_id")}>
                      <option value="">(none)</option>
                      {media.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <span className="field-hint">Shown large at the top of the page and on its card.</span>
                    <PhotoUpload
                      onUploaded={(p) => {
                        setUploaded((list) => [p, ...list]);
                        setFields((f) => ({ ...f, hero_media_id: p.id }));
                      }}
                    />
                    {chosenHero && <MediaImage media={{ ...chosenHero, alt: "" }} sizes="320px" className="cover-preview" />}
                  </div>
                  <div className="field">
                    <label htmlFor={id("credit")}>Photo credit</label>
                    <input id={id("credit")} value={fields.hero_credit} onChange={set("hero_credit")} maxLength={200} />
                  </div>
                </div>
              ),
            },
            {
              id: "seo",
              label: "Address and search engines",
              content: (
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor={id("slug")}>URL name (slug)</label>
                    <input id={id("slug")} value={fields.slug} onChange={set("slug")} />
                    <span className="field-hint">The page will be /guide/{fields.slug || "…"}</span>
                  </div>
                  <div className="field">
                    <label htmlFor={id("seo_title")}>Search engine title</label>
                    <input id={id("seo_title")} value={fields.seo_title} onChange={set("seo_title")} maxLength={70} />
                    {counterHint("seo_title", 70)}
                  </div>
                  <div className="field span-2">
                    <label htmlFor={id("seo_description")}>Meta description</label>
                    <textarea id={id("seo_description")} value={fields.seo_description} onChange={set("seo_description")} maxLength={170} />
                    {counterHint("seo_description", 170)}
                  </div>
                </div>
              ),
            },
          ]}
        />

        <div className="form-actions">
          <button className="button button-primary" type="submit" disabled={busy || !dirty}>
            {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
          {dirty && saved.published && <span className="field-hint">Saving updates the page on the website immediately.</span>}
        </div>
      </form>
    </>
  );
}
