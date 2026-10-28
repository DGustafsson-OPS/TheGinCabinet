"use client";
// The recipe editor (spec §5 A07): tabs for basics / ingredients / steps /
// imagery / gin pairings / SEO / publishing, all in one form so switching tabs
// never loses unsaved work.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import MediaImage from "@/components/MediaImage";
import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import ConflictPanel from "@/components/admin/ConflictPanel";
import Tabs from "@/components/admin/Tabs";
import PhotoUpload from "@/components/admin/PhotoUpload";
import { ApiError } from "@/lib/api-client";
import { humanize } from "@/lib/format";
import {
  type Cocktail,
  type CocktailStatus,
  type ConflictDetails,
  DIFFICULTIES,
  type GinSummary,
  type MediaSummary,
  METHODS,
  UNITS,
  COMMON_TOOLS,
  type Unit,
} from "@/lib/types";

// Each row needs a stable React `key`. Rows loaded with the page get keys from
// their position ("init-0"...), identical on the server and in the browser;
// rows added later use this editor's own counter ("new-1"...).
type Row<T> = T & { key: string };
type LineRow = Row<{ name: string; quantity: string; unit: Unit; note: string; optional: boolean }>;
type StepRow = Row<{ text: string }>;
type GinRow = Row<{ gin_id: string; priority: string; pairing_note: string }>;

type Basics = {
  title: string; slug: string; intro: string; method: string; glassware: string;
  prep_minutes: string; difficulty: string; servings_base: string; garnish: string;
  garnish_quantity: string; tags: string; equipment: string; cover_media_id: string; seo_title: string;
  seo_description: string;
};

function initialBasics(c: Cocktail): Basics {
  return {
    title: c.title, slug: c.slug, intro: c.intro ?? "", method: c.method, glassware: c.glassware ?? "",
    prep_minutes: c.prep_minutes?.toString() ?? "", difficulty: c.difficulty,
    servings_base: String(c.servings_base), garnish: c.garnish ?? "",
    garnish_quantity: c.garnish_quantity ?? "", tags: c.tags.join(", "), equipment: c.equipment.join(", "),
    cover_media_id: c.cover_media_id ?? "", seo_title: c.seo_title ?? "",
    seo_description: c.seo_description ?? "",
  };
}

const text = (value: string) => value.trim() || null;
/** "Shaker, Strainer" → ["Shaker", "Strainer"] */
const splitList = (value: string) => value.split(",").map((t) => t.trim()).filter(Boolean);
const decimal = (value: string) => (value.trim() ? value.replace(",", ".").trim() : null);

/** Everything on screen, as the JSON the API expects. */
function payload(basics: Basics, lines: LineRow[], steps: StepRow[], gins: GinRow[]) {
  return {
    title: basics.title.trim(),
    slug: basics.slug.trim(),
    intro: text(basics.intro),
    method: basics.method,
    glassware: text(basics.glassware),
    prep_minutes: basics.prep_minutes.trim() ? Number(basics.prep_minutes) : null,
    difficulty: basics.difficulty,
    servings_base: Number(basics.servings_base || 1),
    garnish: text(basics.garnish),
    garnish_quantity: decimal(basics.garnish_quantity),
    tags: basics.tags.split(",").map((t) => t.trim()).filter(Boolean),
    equipment: splitList(basics.equipment),
    cover_media_id: basics.cover_media_id || null,
    seo_title: text(basics.seo_title),
    seo_description: text(basics.seo_description),
    ingredients: lines.map((l) => ({
      name: l.name.trim(),
      quantity: l.unit === "top up" ? null : decimal(l.quantity),
      unit: l.unit,
      note: text(l.note),
      optional: l.optional,
    })),
    steps: steps.map((s) => ({ text: s.text.trim() })),
    gins: gins.map((g) => ({
      gin_id: g.gin_id,
      priority: Number(g.priority || 1),
      pairing_note: text(g.pairing_note),
    })),
  };
}

/** Move an item in a list one place up (-1) or down (+1). */
function move<T>(list: T[], index: number, by: -1 | 1): T[] {
  const target = index + by;
  if (target < 0 || target >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

type Props = {
  cocktail: Cocktail;
  gins: GinSummary[];
  media: (MediaSummary & { label: string })[];
  knownIngredients: string[];
};

const toLines = (c: Cocktail, tag = "init"): LineRow[] =>
  c.ingredients.map((l, i) => ({
    key: `${tag}-${i}`, name: l.name, quantity: l.quantity ?? "", unit: l.unit, note: l.note ?? "", optional: l.optional,
  }));
const toSteps = (c: Cocktail, tag = "init"): StepRow[] => c.steps.map((t, i) => ({ key: `${tag}-${i}`, text: t }));
const toGinRows = (c: Cocktail, tag = "init"): GinRow[] =>
  c.gins.map((g, i) => ({ key: `${tag}-${i}`, gin_id: g.gin.id, priority: String(g.priority), pairing_note: g.pairing_note ?? "" }));

export default function CocktailEditor({ cocktail, gins, media: library, knownIngredients }: Props) {
  // Photos uploaded from this form (PhotoUpload) join the library's list.
  const [uploaded, setUploaded] = useState<Props["media"]>([]);
  const media = [...uploaded, ...library];
  const router = useRouter();
  const formId = useId(); // prefix for element ids, unique per editor
  const counter = useRef(0);
  const newKey = () => {
    counter.current += 1;
    return `new-${counter.current}`;
  };
  const { call, toast } = useAdmin();
  const [basics, setBasics] = useState<Basics>(() => initialBasics(cocktail));
  const [lines, setLines] = useState<LineRow[]>(() => toLines(cocktail));
  const [steps, setSteps] = useState<StepRow[]>(() => toSteps(cocktail));
  const [ginRows, setGinRows] = useState<GinRow[]>(() => toGinRows(cocktail));
  // The last saved state. After a save we update these from the API's answer
  // instead of rebuilding the editor, so you stay on the tab you were using.
  const [original, setOriginal] = useState(() => payload(basics, lines, steps, ginRows));
  const [version, setVersion] = useState(cocktail.version);
  const [status, setStatusState] = useState<CocktailStatus>(cocktail.status);
  const [conflict, setConflict] = useState<ConflictDetails<Cocktail> | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Replace everything on screen with a saved version of the recipe. */
  function loadFrom(saved: Cocktail) {
    const tag = `v${saved.version}`; // fresh keys, different from the rows on screen
    const next = {
      basics: initialBasics(saved), lines: toLines(saved, tag), steps: toSteps(saved, tag), gins: toGinRows(saved, tag),
    };
    setBasics(next.basics);
    setLines(next.lines);
    setSteps(next.steps);
    setGinRows(next.gins);
    setOriginal(payload(next.basics, next.lines, next.steps, next.gins));
    setVersion(saved.version);
    setStatusState(saved.status);
  }

  const current = payload(basics, lines, steps, ginRows);
  const changes = Object.fromEntries(
    Object.entries(current).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(original[key as keyof typeof original]),
    ),
  );
  const dirty = Object.keys(changes).length > 0;

  const setB =
    (field: keyof Basics) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setBasics((b) => ({ ...b, [field]: event.target.value }));

  async function save(force = false) {
    setBusy(true);
    setError(null);
    setProblems([]);
    try {
      const saved = await call<Cocktail>(`/admin/cocktails/${cocktail.id}${force ? "?force=true" : ""}`, "PATCH", {
        version,
        ...changes,
      });
      setOriginal(current); // what's on screen is now the saved state
      setVersion(saved.version);
      toast("Saved.");
      setConflict(null);
      router.refresh(); // update the rest of the page (e.g. the title)
    } catch (err) {
      if (err instanceof ApiError && err.code === "version_conflict") {
        setConflict(err.details as ConflictDetails<Cocktail>);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: CocktailStatus, success: string) {
    setBusy(true);
    setError(null);
    setProblems([]);
    try {
      const saved = await call<Cocktail>(`/admin/cocktails/${cocktail.id}/status`, "POST", { version, status });
      setVersion(saved.version);
      setStatusState(saved.status);
      toast(success);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.code === "not_publishable") setProblems(err.details as string[]);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const cover = media.find((m) => m.id === basics.cover_media_id);
  const field = (id: keyof Basics, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} value={basics[id]} onChange={setB(id)} {...extra} />
    </div>
  );

  // ---------- Tab contents ----------

  const basicsTab = (
    <div className="form-grid">
      <div className="field span-2">
        <label htmlFor="title">Title</label>
        <input id="title" value={basics.title} onChange={setB("title")} required />
      </div>
      <div className="field span-2">
        <label htmlFor="intro">Summary</label>
        <textarea id="intro" value={basics.intro} onChange={setB("intro")} />
      </div>
      <div className="field">
        <label htmlFor="method">Method</label>
        <select id="method" value={basics.method} onChange={setB("method")}>
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {humanize(m)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="difficulty">Difficulty</label>
        <select id="difficulty" value={basics.difficulty} onChange={setB("difficulty")}>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {humanize(d)}
            </option>
          ))}
        </select>
      </div>
      {field("glassware", "Glassware", { placeholder: "e.g. Copa glass" })}
      {field("prep_minutes", "Preparation time (minutes)", { type: "number", min: 0 })}
      {field("servings_base", "The recipe makes (drinks)", { type: "number", min: 1, max: 12 })}
      {field("tags", "Tags (comma separated)", { placeholder: "refreshing, citrus, summer" })}
      {field("garnish", "Garnish", { placeholder: "e.g. lime wheels" })}
      {field("garnish_quantity", "Garnish amount (scales with servings)", { inputMode: "decimal" })}
      <fieldset className="fieldset-plain span-2">
        <legend>What you need</legend>
        <p className="field-hint" style={{ marginTop: 0 }}>
          Tick the tools, or type others in the list below. The glass above is shown too.
        </p>
        <div className="tool-choices">
          {COMMON_TOOLS.map((tool) => {
            const list = splitList(basics.equipment);
            const chosen = list.some((t) => t.toLowerCase() === tool.toLowerCase());
            return (
              <div key={tool} className="field-checkbox">
                <input
                  id={`tool-${tool}`}
                  type="checkbox"
                  checked={chosen}
                  onChange={() => {
                    // Ticking adds the tool to the end of the list; unticking removes it.
                    const next = chosen ? list.filter((t) => t.toLowerCase() !== tool.toLowerCase()) : [...list, tool];
                    setBasics((b) => ({ ...b, equipment: next.join(", ") }));
                  }}
                />
                <label htmlFor={`tool-${tool}`}>{tool}</label>
              </div>
            );
          })}
        </div>
        {field("equipment", "The whole list, in order (comma separated)", { placeholder: "e.g. Shaker, Strainer, Jigger, Ice" })}
      </fieldset>
    </div>
  );

  const ingredientsTab = (
    <>
      <datalist id="known-ingredients">
        {knownIngredients.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      {lines.length === 0 && <p className="empty-state">No ingredients yet.</p>}
      {lines.map((line, index) => {
        const update = (patch: Partial<LineRow>) =>
          setLines((all) => all.map((l) => (l.key === line.key ? { ...l, ...patch } : l)));
        const n = index + 1;
        return (
          <fieldset key={line.key} className="card" style={{ marginBottom: "var(--space-3)" }}>
            <legend className="visually-hidden">Ingredient {n}</legend>
            <div className="form-grid">
              <div className="field">
                <label htmlFor={`${formId}-ing-name-${line.key}`}>Ingredient {n}</label>
                <input id={`${formId}-ing-name-${line.key}`} list="known-ingredients" value={line.name} onChange={(e) => update({ name: e.target.value })} required />
              </div>
              <div className="field">
                <label htmlFor={`${formId}-ing-qty-${line.key}`}>
                  Amount<span className="visually-hidden"> of ingredient {n}</span>
                </label>
                <input
                  id={`${formId}-ing-qty-${line.key}`}
                  inputMode="decimal"
                  value={line.unit === "top up" ? "" : line.quantity}
                  disabled={line.unit === "top up"}
                  onChange={(e) => update({ quantity: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor={`${formId}-ing-unit-${line.key}`}>
                  Unit<span className="visually-hidden"> of ingredient {n}</span>
                </label>
                <select id={`${formId}-ing-unit-${line.key}`} value={line.unit} onChange={(e) => update({ unit: e.target.value as Unit })}>
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u === "" ? "(no unit)" : u}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${formId}-ing-note-${line.key}`}>
                  Note<span className="visually-hidden"> for ingredient {n}</span>
                </label>
                <input id={`${formId}-ing-note-${line.key}`} value={line.note} onChange={(e) => update({ note: e.target.value })} placeholder="e.g. freshly squeezed" />
              </div>
              <div className="field-checkbox">
                <input id={`${formId}-ing-opt-${line.key}`} type="checkbox" checked={line.optional} onChange={(e) => update({ optional: e.target.checked })} />
                <label htmlFor={`${formId}-ing-opt-${line.key}`}>
                  Optional<span className="visually-hidden"> (ingredient {n})</span>
                </label>
              </div>
            </div>
            <div className="form-actions" style={{ marginTop: 0 }}>
              <button type="button" className="button button-secondary" disabled={index === 0} onClick={() => setLines((all) => move(all, index, -1))}>
                Move up<span className="visually-hidden"> ingredient {n}</span>
              </button>
              <button type="button" className="button button-secondary" disabled={index === lines.length - 1} onClick={() => setLines((all) => move(all, index, 1))}>
                Move down<span className="visually-hidden"> ingredient {n}</span>
              </button>
              <ConfirmButton
                quiet
                label={<>Remove<span className="visually-hidden"> ingredient {n}</span></>}
                title={`Remove ingredient ${n}?`}
                description="It disappears from the form now; nothing is saved until you press Save."
                confirmLabel="Remove ingredient"
                onConfirm={() => setLines((all) => all.filter((l) => l.key !== line.key))}
              />
            </div>
          </fieldset>
        );
      })}
      <button
        type="button"
        className="button button-secondary"
        onClick={() => {
          const key = newKey();
          setLines((all) => [...all, { key, name: "", quantity: "", unit: "ml", note: "", optional: false }]);
        }}
      >
        Add ingredient
      </button>
    </>
  );

  const stepsTab = (
    <>
      {steps.length === 0 && <p className="empty-state">No steps yet.</p>}
      <ol style={{ padding: 0, listStyle: "none" }}>
        {steps.map((step, index) => (
          <li key={step.key} className="card" style={{ marginBottom: "var(--space-3)" }}>
            <div className="field">
              <label htmlFor={`${formId}-step-${step.key}`}>Step {index + 1}</label>
              <textarea
                id={`${formId}-step-${step.key}`}
                value={step.text}
                onChange={(e) => setSteps((all) => all.map((s) => (s.key === step.key ? { ...s, text: e.target.value } : s)))}
              />
            </div>
            <div className="form-actions" style={{ marginTop: 0 }}>
              <button type="button" className="button button-secondary" disabled={index === 0} onClick={() => setSteps((all) => move(all, index, -1))}>
                Move up<span className="visually-hidden"> step {index + 1}</span>
              </button>
              <button type="button" className="button button-secondary" disabled={index === steps.length - 1} onClick={() => setSteps((all) => move(all, index, 1))}>
                Move down<span className="visually-hidden"> step {index + 1}</span>
              </button>
              <ConfirmButton
                quiet
                label={<>Remove<span className="visually-hidden"> step {index + 1}</span></>}
                title={`Remove step ${index + 1}?`}
                description="It disappears from the form now; nothing is saved until you press Save."
                confirmLabel="Remove step"
                onConfirm={() => setSteps((all) => all.filter((s) => s.key !== step.key))}
              />
            </div>
          </li>
        ))}
      </ol>
      <button type="button" className="button button-secondary" onClick={() => {
          const key = newKey();
          setSteps((all) => [...all, { key, text: "" }]);
        }}>
        Add step
      </button>
    </>
  );

  const imageryTab = (
    <div className="field">
      <label htmlFor="cover_media_id">Photo</label>
      <select id="cover_media_id" value={basics.cover_media_id} onChange={setB("cover_media_id")}>
        <option value="">(no photo)</option>
        {media.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </select>
      {cover && <MediaImage media={cover} className="cover-preview" sizes="320px" />}
      <PhotoUpload
        onUploaded={(p) => {
          setUploaded((list) => [p, ...list]);
          setBasics((b) => ({ ...b, cover_media_id: p.id }));
        }}
      />
    </div>
  );

  const pairingsTab = (
    <>
      <p className="field-hint">
        Gins shown as &quot;recommended&quot; on this recipe and, in return, on each gin&apos;s page. Only public
        gins are shown to visitors.
      </p>
      {ginRows.map((row, index) => {
        const update = (patch: Partial<GinRow>) =>
          setGinRows((all) => all.map((g) => (g.key === row.key ? { ...g, ...patch } : g)));
        const pairing = cocktail.gins.find((g) => g.gin.id === row.gin_id);
        return (
          <fieldset key={row.key} className="card" style={{ marginBottom: "var(--space-3)" }}>
            <legend className="visually-hidden">Recommended gin {index + 1}</legend>
            <div className="form-grid">
              <div className="field">
                <label htmlFor={`${formId}-gin-${row.key}`}>Recommended gin {index + 1}</label>
                <select id={`${formId}-gin-${row.key}`} value={row.gin_id} onChange={(e) => update({ gin_id: e.target.value })} required>
                  <option value="" disabled>
                    Choose a gin…
                  </option>
                  {gins.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.display_name}
                    </option>
                  ))}
                </select>
                {pairing && !pairing.gin_public && <span className="field-hint">⚠ This gin is private, so visitors won&apos;t see it.</span>}
              </div>
              <div className="field">
                <label htmlFor={`${formId}-prio-${row.key}`}>
                  Priority (1 = best)<span className="visually-hidden"> for gin {index + 1}</span>
                </label>
                <input id={`${formId}-prio-${row.key}`} type="number" min={1} max={10} value={row.priority} onChange={(e) => update({ priority: e.target.value })} />
              </div>
              <div className="field span-2">
                <label htmlFor={`${formId}-note-${row.key}`}>
                  Why it works<span className="visually-hidden"> (gin {index + 1})</span>
                </label>
                <input id={`${formId}-note-${row.key}`} value={row.pairing_note} onChange={(e) => update({ pairing_note: e.target.value })} />
              </div>
            </div>
            <ConfirmButton
              quiet
              label={<>Remove<span className="visually-hidden"> gin {index + 1}</span></>}
              title={`Remove gin pairing ${index + 1}?`}
              description="The gin itself is not affected. It disappears from the form now; nothing is saved until you press Save."
              confirmLabel="Remove pairing"
              onConfirm={() => setGinRows((all) => all.filter((g) => g.key !== row.key))}
            />
          </fieldset>
        );
      })}
      <button
        type="button"
        className="button button-secondary"
        onClick={() => {
          const key = newKey();
          setGinRows((all) => [...all, { key, gin_id: "", priority: String(all.length + 1), pairing_note: "" }]);
        }}
      >
        Add recommended gin
      </button>
    </>
  );

  const seoTab = (
    <div className="form-grid">
      <div className="field">
        <label htmlFor="slug">URL name (slug)</label>
        <input id="slug" value={basics.slug} onChange={setB("slug")} />
        <span className="field-hint">The page will be /cocktails/{basics.slug || "…"}</span>
      </div>
      <div className="field">
        <label htmlFor="seo_title">Search engine title</label>
        <input id="seo_title" value={basics.seo_title} onChange={setB("seo_title")} maxLength={70} />
        <span className="field-hint">{basics.seo_title.length} / 70</span>
      </div>
      <div className="field span-2">
        <label htmlFor="seo_description">Search engine description</label>
        <textarea id="seo_description" value={basics.seo_description} onChange={setB("seo_description")} maxLength={170} />
        <span className="field-hint">{basics.seo_description.length} / 170</span>
      </div>
    </div>
  );

  const publishingTab = (
    <div>
      <p>
        Status: <strong>{status === "published" ? "Live on the site" : humanize(status)}</strong>
      </p>
      {problems.length > 0 && (
        <div className="alert alert-warning" role="alert">
          <strong>Not ready to publish yet:</strong>
          <ul style={{ margin: 0 }}>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {dirty && <p className="field-hint">Save your changes before changing the status.</p>}
      <div className="form-actions">
        {status === "draft" && (
          <ConfirmButton label="Publish" title="Publish this recipe?" description="It will appear in the public cocktail library straight away." confirmLabel="Publish now" disabled={busy || dirty} onConfirm={() => setStatus("published", "Published. It's live.")} />
        )}
        {status === "published" && (
          <>
            <ConfirmButton label="Withdraw" title="Take this recipe off the website?" description="It goes back to draft." confirmLabel="Withdraw" disabled={busy || dirty} onConfirm={() => setStatus("draft", "Withdrawn.")} />
            <Link className="button button-secondary" href={`/cocktails/${cocktail.slug}`}>
              View on the site
            </Link>
          </>
        )}
        {status !== "archived" ? (
          <ConfirmButton label="Archive" title="Archive this recipe?" description="It leaves the website and the working list." confirmLabel="Archive" danger disabled={busy || dirty} onConfirm={() => setStatus("archived", "Archived.")} />
        ) : (
          <button type="button" className="button button-secondary" disabled={busy || dirty} onClick={() => setStatus("draft", "Restored to draft.")}>
            Restore to draft
          </button>
        )}
      </div>
    </div>
  );

  return (
    <form
      className="card"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {conflict && <ConflictPanel diff={conflict.diff} busy={busy} onKeepMine={() => save(true)} onTakeTheirs={() => {
            loadFrom(conflict.current);
            setConflict(null);
            toast("Loaded the saved version.");
          }} />}
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>

      <Tabs
        label="Recipe sections"
        tabs={[
          { id: "basics", label: "Basics", content: basicsTab },
          { id: "ingredients", label: "Ingredients", badge: String(lines.length), content: ingredientsTab },
          { id: "steps", label: "Steps", badge: String(steps.length), content: stepsTab },
          { id: "imagery", label: "Imagery", content: imageryTab },
          { id: "gins", label: "Gin pairings", badge: String(ginRows.length), content: pairingsTab },
          { id: "seo", label: "SEO", content: seoTab },
          { id: "publishing", label: "Publishing", content: publishingTab },
        ]}
      />

      <div className="form-actions" style={{ borderTop: "1px solid var(--color-border)", paddingTop: "var(--space-4)" }}>
        <button className="button button-primary" type="submit" disabled={busy || !dirty}>
          {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
        {dirty && <span className="field-hint">Unsaved changes in: {Object.keys(changes).map(humanize).join(", ")}</span>}
      </div>
    </form>
  );
}
