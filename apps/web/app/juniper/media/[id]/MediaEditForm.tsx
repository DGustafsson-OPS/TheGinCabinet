"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import ConfirmButton from "@/components/admin/ConfirmButton";
import { ApiError } from "@/lib/api-client";
import type { Media } from "@/lib/types";

export default function MediaEditForm({ media, folders }: { media: Media; folders: string[] }) {
  const router = useRouter();
  const { call, toast } = useAdmin();
  const [name, setName] = useState(media.name ?? "");
  const [folder, setFolder] = useState(media.folder ?? "");
  const [alt, setAlt] = useState(media.alt ?? "");
  const [decorative, setDecorative] = useState(media.decorative);
  const [credit, setCredit] = useState(media.credit ?? "");
  const [rights, setRights] = useState(media.rights ?? "");
  const [watermark, setWatermark] = useState(media.watermark);
  const [aiGenerated, setAiGenerated] = useState(media.ai_generated);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await call(`/admin/media/${media.id}`, "PATCH", {
        version: media.version,
        name: name.trim() || null,
        folder: folder.trim(),
        alt: alt.trim() || null,
        decorative,
        credit: credit.trim() || null,
        rights: rights.trim() || null,
        watermark,
        ai_generated: aiGenerated,
      });
      const marksChanged = watermark !== media.watermark || aiGenerated !== media.ai_generated;
      toast(marksChanged ? "Saved. The website now shows the image with these marks." : "Saved.");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "version_conflict"
          ? "Someone else changed this image. Reload the page to see their version."
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    try {
      await call(`/admin/media/${media.id}`, "DELETE");
      toast("Image deleted.");
      router.push("/juniper/media");
    } catch (err) {
      // 409 media_in_use: the API lists where it is used.
      toast(errorMessage(err), "error");
    }
  }

  return (
    <form onSubmit={save}>
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} aria-describedby="name-hint" />
        <span id="name-hint" className="field-hint">
          For finding it in the library, e.g. &quot;Hernö Navy Strength bottle&quot;. Not shown to visitors.
        </span>
      </div>
      <div className="field">
        <label htmlFor="folder">Folder</label>
        <input id="folder" list="folder-options" value={folder} onChange={(event) => setFolder(event.target.value)} maxLength={300} aria-describedby="folder-hint" />
        <datalist id="folder-options">
          {folders.map((path) => (
            <option key={path} value={path} />
          ))}
        </datalist>
        <span id="folder-hint" className="field-hint">
          Pick one or type a new one. Use / for a subfolder: Gins/Hernö. Leave empty for no folder.
        </span>
      </div>
      <div className="field">
        <label htmlFor="alt">Alt text</label>
        <textarea
          id="alt"
          value={alt}
          onChange={(event) => setAlt(event.target.value)}
          disabled={decorative}
          aria-describedby="alt-hint"
        />
        <span id="alt-hint" className="field-hint">
          Describe what the picture shows for people who can&apos;t see it, e.g. &quot;A green
          bottle of Hernö gin beside a sprig of juniper&quot;.
        </span>
      </div>
      <div className="field-checkbox">
        <input
          id="decorative"
          type="checkbox"
          checked={decorative}
          onChange={(event) => setDecorative(event.target.checked)}
        />
        <label htmlFor="decorative">Decorative only (screen readers skip it)</label>
      </div>
      <div className="field">
        <label htmlFor="credit">Photo credit</label>
        <input id="credit" value={credit} onChange={(event) => setCredit(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="rights">Licence / permission</label>
        <input
          id="rights"
          value={rights}
          onChange={(event) => setRights(event.target.value)}
          placeholder="e.g. Own photo, or CC BY 4.0"
        />
      </div>
      <fieldset className="fieldset-plain">
        <legend>Corner marks</legend>
        <p className="field-hint" style={{ marginTop: 0 }}>
          Small text drawn on the image the website shows. Your uploaded file stays unchanged, so marks can be switched
          off again at any time.
        </p>
        <div className="field-checkbox">
          <input id="watermark" type="checkbox" checked={watermark} onChange={(event) => setWatermark(event.target.checked)} />
          <label htmlFor="watermark">Watermark: &quot;© site name&quot;, bottom-right corner</label>
        </div>
        <div className="field-checkbox">
          <input id="ai-generated" type="checkbox" checked={aiGenerated} onChange={(event) => setAiGenerated(event.target.checked)} />
          <label htmlFor="ai-generated">AI-generated: &quot;AI-generated&quot; label, bottom-left corner</label>
        </div>
      </fieldset>
      <div className="form-actions">
        <button className="button button-primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <ConfirmButton
          label="Delete image"
          title="Delete this image?"
          description={
            media.used_by.length > 0
              ? `It is still used in: ${media.used_by.join(", ")}. Remove it there first.`
              : "It will disappear from the media library."
          }
          confirmLabel="Delete"
          danger
          onConfirm={remove}
        />
      </div>
    </form>
  );
}
