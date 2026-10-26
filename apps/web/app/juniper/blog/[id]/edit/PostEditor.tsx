"use client";
// The Journal article editor (spec A12): details, body blocks, images, SEO,
// related items, and the publishing workflow (save draft, preview, schedule,
// publish, unpublish, archive).
//
// Safety rules from the spec:
// * Autosave runs only for drafts, never forces over someone else's save, and
//   can never publish anything.
// * Leaving the page with unsaved changes asks for confirmation.
// * Publishing, scheduling and archiving ask "Are you sure?" first.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";

import MediaImage from "@/components/MediaImage";
import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import ConflictPanel from "@/components/admin/ConflictPanel";
import PostStatusBadge from "@/components/admin/PostStatusBadge";
import Tabs from "@/components/admin/Tabs";
import { ApiError } from "@/lib/api-client";
import type { MediaOption } from "@/lib/media-options";
import type { Category, ConflictDetails, Person, Post, RelationKind } from "@/lib/types";

import BlockEditor, { type BlockRow, KIND_LABELS, type RefOptions, cleanBlocks } from "./BlockEditor";

const AUTOSAVE_AFTER_MS = 15_000; // quiet time after the last change
const noSubscription = () => () => {}; // the time zone never changes while the page is open

type Fields = {
  title: string; slug: string; excerpt: string; category_id: string; tags: string;
  author_id: string; featured: boolean; hero_media_id: string; hero_credit: string;
  social_media_id: string; seo_title: string; seo_description: string;
};
type RelationRow = { key: string; kind: RelationKind; id: string };

function toFields(p: Post): Fields {
  return {
    title: p.title, slug: p.slug, excerpt: p.excerpt ?? "", category_id: p.category?.id ?? "",
    tags: p.tags.join(", "), author_id: p.author.id, featured: p.featured,
    hero_media_id: p.hero_media_id ?? "", hero_credit: p.hero_credit ?? "",
    social_media_id: p.social_media_id ?? "", seo_title: p.seo_title ?? "",
    seo_description: p.seo_description ?? "",
  };
}
const toBlocks = (p: Post, tag: string): BlockRow[] => p.body_blocks.map((b, i) => ({ ...b, key: `${tag}-${i}` }));
const toRelations = (p: Post, tag: string): RelationRow[] =>
  p.relations.map((r, i) => ({ key: `${tag}-${i}`, kind: r.kind, id: r.id }));

const text = (value: string) => value.trim() || null;

/** Everything on screen as the JSON the API expects. */
function payload(f: Fields, blocks: BlockRow[], relations: RelationRow[]): Record<string, unknown> {
  return {
    title: f.title.trim(),
    slug: f.slug.trim() || null,
    excerpt: text(f.excerpt),
    category_id: f.category_id || null,
    tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
    author_id: f.author_id,
    featured: f.featured,
    hero_media_id: f.hero_media_id || null,
    hero_credit: text(f.hero_credit),
    social_media_id: f.social_media_id || null,
    seo_title: text(f.seo_title),
    seo_description: text(f.seo_description),
    body_blocks: cleanBlocks(blocks),
    relations: relations.filter((r) => r.id).map((r) => ({ kind: r.kind, id: r.id })),
  };
}

type Props = {
  post: Post;
  categories: Category[];
  authors: Person[];
  media: MediaOption[];
  refs: RefOptions;
};

export default function PostEditor({ post, categories, authors, media, refs }: Props) {
  const router = useRouter();
  const idPrefix = useId();
  const counter = useRef(0);
  const newKey = useCallback(() => {
    counter.current += 1;
    return `new-${counter.current}`;
  }, []);
  const { call, toast } = useAdmin();

  const [saved, setSaved] = useState<Post>(post); // the last version the server confirmed
  const [fields, setFields] = useState<Fields>(() => toFields(post));
  const [blocks, setBlocks] = useState<BlockRow[]>(() => toBlocks(post, "init"));
  const [relations, setRelations] = useState<RelationRow[]>(() => toRelations(post, "init"));
  const [original, setOriginal] = useState(() => payload(toFields(post), toBlocks(post, "init"), toRelations(post, "init")));
  const [conflict, setConflict] = useState<ConflictDetails<Post> | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [autosaveNote, setAutosaveNote] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");

  const current = payload(fields, blocks, relations);
  const changed = Object.keys(current).filter((k) => JSON.stringify(current[k]) !== JSON.stringify(original[k]));
  const dirty = changed.length > 0;

  // The browser's time zone. The server can't know it, so the first HTML says
  // "your local time" and the browser fills in the real name.
  const timeZone = useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => "your local time",
  );

  /** Show a saved version of the article (after saving, or "take theirs"). */
  function loadFrom(next: Post) {
    const tag = `v${next.version}`;
    const nextFields = toFields(next);
    const nextBlocks = toBlocks(next, tag);
    const nextRelations = toRelations(next, tag);
    setSaved(next);
    setFields(nextFields);
    setBlocks(nextBlocks);
    setRelations(nextRelations);
    setOriginal(payload(nextFields, nextBlocks, nextRelations));
  }

  async function save({ force = false, autosave = false } = {}) {
    if (!dirty) {
      if (!autosave) toast("Nothing to save.");
      return;
    }
    setBusy(true);
    setError(null);
    setProblems([]);
    const changes = Object.fromEntries(changed.map((k) => [k, current[k]]));
    try {
      const updated = await call<Post>(`/admin/blog/${post.id}${force ? "?force=true" : ""}`, "PATCH", {
        version: saved.version,
        autosave,
        ...changes,
      });
      // Keep what's on screen (you may have typed more meanwhile), but
      // remember this as the new saved state.
      setSaved(updated);
      setOriginal(current);
      setConflict(null);
      if (autosave) {
        setAutosaveNote(`Draft autosaved at ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`);
      } else {
        loadFrom(updated);
        toast(updated.is_live ? "Saved. The live article is updated." : "Saved. A revision was recorded.");
        router.refresh();
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "version_conflict") {
        setConflict(err.details as ConflictDetails<Post>);
      } else if (!(autosave && err instanceof ApiError && err.code === "autosave_not_draft")) {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  // Autosave: a while after the last change, save a draft quietly.
  // The timer calls the newest `save` through this ref (updated after each render).
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  const draftChanges = saved.status === "draft" && dirty && !conflict && !busy;
  const changeKey = JSON.stringify(current);
  useEffect(() => {
    if (!draftChanges) return;
    const timer = setTimeout(() => saveRef.current({ autosave: true }), AUTOSAVE_AFTER_MS);
    return () => clearTimeout(timer); // typing again restarts the wait
  }, [draftChanges, changeKey]);

  // Warn before closing the tab or reloading with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function act(action: "publish" | "schedule" | "unpublish" | "archive", success: string, extra = {}) {
    setBusy(true);
    setError(null);
    setProblems([]);
    try {
      const updated = await call<Post>(`/admin/blog/${post.id}/${action}`, "POST", { version: saved.version, ...extra });
      loadFrom(updated);
      toast(success);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === "not_publishable") {
        setProblems(err.details as string[]);
      } else if (err instanceof ApiError && err.code === "version_conflict") {
        setError("Someone else changed this article. Reload the page before changing its status.");
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  function schedule() {
    if (!scheduleAt) {
      setError("Choose a date and time first.");
      return;
    }
    // The input gives local time without a zone; Date reads it as the
    // browser's time zone, and toISOString() converts it to UTC.
    const when = new Date(scheduleAt);
    return act("schedule", `Scheduled for ${when.toLocaleString()}.`, { scheduled_at: when.toISOString() });
  }

  async function duplicate() {
    try {
      const copy = await call<Post>(`/admin/blog/${post.id}/duplicate`, "POST");
      toast("Copied into a new draft.");
      router.push(`/juniper/blog/${copy.id}/edit`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const set =
    (field: keyof Fields) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const target = event.target;
      const value = target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value;
      setFields((f) => ({ ...f, [field]: value }));
    };
  const id = (name: string) => `${idPrefix}-${name}`;
  const counterHint = (field: "seo_title" | "seo_description" | "excerpt", max: number) => (
    <span className="field-hint">
      {fields[field].length} / {max} characters
    </span>
  );
  const imageSelect = (field: "hero_media_id" | "social_media_id", label: string, hint: string) => {
    const chosen = media.find((m) => m.id === fields[field]);
    return (
      <div className="field">
        <label htmlFor={id(field)}>{label}</label>
        <select id={id(field)} value={fields[field]} onChange={set(field)} aria-describedby={id(`${field}-hint`)}>
          <option value="">(none)</option>
          {media.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <span id={id(`${field}-hint`)} className="field-hint">
          {hint}
        </span>
        {chosen && <MediaImage media={{ ...chosen, alt: "" }} sizes="320px" className="cover-preview" />}
      </div>
    );
  };

  const status = saved.status;
  const blocked = busy || dirty;

  return (
    <>
      <section className="card" aria-labelledby={id("workflow")} style={{ marginBottom: "var(--space-4)" }}>
        <h2 id={id("workflow")} style={{ fontSize: "var(--font-size-h3)" }}>
          Status: <PostStatusBadge post={saved} />
        </h2>
        {problems.length > 0 && (
          <div className="alert alert-warning" role="alert">
            <p style={{ margin: 0 }}>
              <strong>Not ready to go public yet:</strong>
            </p>
            <ul style={{ margin: 0 }}>
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        )}
        {dirty && <p className="field-hint">Save your changes before publishing, scheduling or archiving.</p>}
        <p className="field-hint" aria-live="polite">
          {autosaveNote}
        </p>

        <div className="form-actions">
          {(status === "draft" || status === "scheduled") && (
            <ConfirmButton
              label="Publish now"
              title="Publish this article?"
              description="It will appear on the public website straight away."
              confirmLabel="Publish now"
              disabled={blocked}
              onConfirm={() => act("publish", "Published. It's live.")}
            />
          )}
          {status === "published" && (
            <ConfirmButton
              label="Unpublish"
              title="Take this article off the website?"
              description="It goes back to draft. You can publish it again later."
              confirmLabel="Unpublish"
              disabled={blocked}
              onConfirm={() => act("unpublish", "Unpublished. It's no longer public.")}
            />
          )}
          {status === "scheduled" && (
            <button type="button" className="button button-secondary" disabled={blocked} onClick={() => act("unpublish", "Schedule cancelled. Back to draft.")}>
              Cancel schedule
            </button>
          )}
          {status === "archived" && (
            <button type="button" className="button button-secondary" disabled={blocked} onClick={() => act("unpublish", "Restored to draft.")}>
              Restore to draft
            </button>
          )}
          {status !== "archived" && (
            <ConfirmButton
              label="Archive"
              title="Archive this article?"
              description="It leaves the website and the working lists. You can restore it to draft."
              confirmLabel="Archive"
              danger
              disabled={blocked}
              onConfirm={() => act("archive", "Archived.")}
            />
          )}
          <Link className="button button-secondary" href={`/juniper/blog/${post.id}/preview`}>
            Preview
          </Link>
          <button type="button" className="button button-secondary" onClick={duplicate}>
            Duplicate
          </button>
          <Link className="button button-secondary" href={`/juniper/blog/${post.id}/revisions`}>
            Revision history
          </Link>
          {saved.is_live && (
            <Link className="button button-secondary" href={`/blog/${saved.slug}`}>
              View on the site
            </Link>
          )}
        </div>

        {(status === "draft" || status === "scheduled") && (
          <div className="form-grid" style={{ marginTop: "var(--space-4)", alignItems: "end" }}>
            <div className="field">
              <label htmlFor={id("schedule")}>Publish automatically at</label>
              <input id={id("schedule")} type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} aria-describedby={id("schedule-hint")} />
              <span id={id("schedule-hint")} className="field-hint">
                Time zone: {timeZone}. The site checks for due articles every minute.
              </span>
            </div>
            <div style={{ marginBottom: "var(--space-5)" }}>
              <ConfirmButton
                label={status === "scheduled" ? "Change schedule" : "Schedule"}
                title="Schedule this article?"
                description={scheduleAt ? `It will go live on ${new Date(scheduleAt).toLocaleString()} (${timeZone}).` : "Choose a date and time first."}
                confirmLabel="Schedule"
                disabled={blocked || !scheduleAt}
                onConfirm={schedule}
              />
            </div>
          </div>
        )}
      </section>

      <form
        className="card"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        {conflict && (
          <ConflictPanel
            diff={conflict.diff}
            busy={busy}
            onKeepMine={() => save({ force: true })}
            onTakeTheirs={() => {
              loadFrom(conflict.current);
              setConflict(null);
              toast("Loaded the saved version.");
            }}
          />
        )}
        <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>

        <Tabs
          label="Article sections"
          tabs={[
            {
              id: "details",
              label: "Details",
              content: (
                <div className="form-grid">
                  <div className="field span-2">
                    <label htmlFor={id("title")}>Title</label>
                    <input id={id("title")} value={fields.title} onChange={set("title")} required maxLength={200} />
                  </div>
                  <div className="field span-2">
                    <label htmlFor={id("excerpt")}>Summary (standfirst)</label>
                    <textarea id={id("excerpt")} value={fields.excerpt} onChange={set("excerpt")} maxLength={600} />
                    {counterHint("excerpt", 600)}
                  </div>
                  <div className="field">
                    <label htmlFor={id("category")}>Category</label>
                    <select id={id("category")} value={fields.category_id} onChange={set("category_id")}>
                      <option value="">(none)</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor={id("author")}>Author (byline)</label>
                    <select id={id("author")} value={fields.author_id} onChange={set("author_id")}>
                      {authors.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.display_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field span-2">
                    <label htmlFor={id("tags")}>Tags</label>
                    <input id={id("tags")} value={fields.tags} onChange={set("tags")} aria-describedby={id("tags-hint")} />
                    <span id={id("tags-hint")} className="field-hint">
                      Separate with commas: Japan, distillery visit.
                    </span>
                  </div>
                  <div className="field-checkbox span-2">
                    <input id={id("featured")} type="checkbox" checked={fields.featured} onChange={set("featured")} />
                    <label htmlFor={id("featured")}>Feature this article at the top of the Journal</label>
                  </div>
                </div>
              ),
            },
            {
              id: "body",
              label: "Article",
              content: (
                <BlockEditor idPrefix={idPrefix} blocks={blocks} onChange={setBlocks} newKey={newKey} media={media} refs={refs} />
              ),
            },
            {
              id: "images",
              label: "Images",
              content: (
                <div className="form-grid">
                  {imageSelect("hero_media_id", "Featured image", "Shown large at the top (16:9) and on cards (4:3).")}
                  <div className="field">
                    <label htmlFor={id("credit")}>Photo credit</label>
                    <input id={id("credit")} value={fields.hero_credit} onChange={set("hero_credit")} maxLength={200} />
                  </div>
                  {imageSelect("social_media_id", "Social sharing image", "Optional. Used when the article is shared; the featured image otherwise.")}
                  <p className="field-hint span-2">
                    Upload images and write their alt text in the <Link href="/juniper/media">media library</Link>.
                  </p>
                </div>
              ),
            },
            {
              id: "related",
              label: "Related",
              content: (
                <RelationsEditor idPrefix={idPrefix} rows={relations} onChange={setRelations} newKey={newKey} refs={refs} statusOf={saved.relations} />
              ),
            },
            {
              id: "seo",
              label: "SEO",
              content: (
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor={id("slug")}>URL name (slug)</label>
                    <input id={id("slug")} value={fields.slug} onChange={set("slug")} />
                    <span className="field-hint">The page will be /blog/{fields.slug || "…"}</span>
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
            {busy ? "Saving…" : !dirty ? "Saved" : status === "draft" ? "Save draft" : "Save changes"}
          </button>
          {dirty && saved.is_live && <span className="field-hint">Saving updates the live article immediately.</span>}
        </div>
      </form>
    </>
  );
}

type RelationsProps = {
  idPrefix: string;
  rows: RelationRow[];
  onChange: (rows: RelationRow[]) => void;
  newKey: () => string;
  refs: RefOptions;
  statusOf: Post["relations"];
};

/** "Relevant gins, reviews, cocktails and stories" shown at the end of the article. */
function RelationsEditor({ idPrefix, rows, onChange, newKey, refs, statusOf }: RelationsProps) {
  const update = (index: number, patch: Partial<RelationRow>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  return (
    <div>
      <p className="field-hint">These appear under the article. Private or unpublished items are left out of the public page.</p>
      <ol style={{ listStyle: "none", padding: 0, display: "grid", gap: "var(--space-3)" }}>
        {rows.map((row, index) => {
          const id = (part: string) => `${idPrefix}-rel-${row.key}-${part}`;
          const known = statusOf.find((r) => r.kind === row.kind && r.id === row.id);
          return (
            <li key={row.key} className="form-grid" style={{ alignItems: "end" }}>
              <div className="field">
                <label htmlFor={id("kind")}>Type {index + 1}</label>
                <select id={id("kind")} value={row.kind} onChange={(e) => update(index, { kind: e.target.value as RelationKind, id: "" })}>
                  {(Object.keys(KIND_LABELS) as RelationKind[]).map((kind) => (
                    <option key={kind} value={kind}>
                      {KIND_LABELS[kind]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={id("item")}>Item {index + 1}</label>
                <select id={id("item")} value={row.id} onChange={(e) => update(index, { id: e.target.value })}>
                  <option value="">Choose…</option>
                  {refs[row.kind].map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {known && !known.public && <span className="field-hint">Not public: it won&apos;t show on the site.</span>}
              </div>
              <button type="button" className="button button-secondary" onClick={() => onChange(rows.filter((_, i) => i !== index))}>
                Remove<span className="visually-hidden"> related item {index + 1}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <button type="button" className="button button-secondary" onClick={() => onChange([...rows, { key: newKey(), kind: "gin", id: "" }])}>
        + Add related item
      </button>
    </div>
  );
}
