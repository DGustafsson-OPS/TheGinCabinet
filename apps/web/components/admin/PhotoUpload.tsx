"use client";
// "Upload a new photo" right where a photo is chosen (gin, tonic, review,
// cocktail, article, logo), so nobody has to leave the form for the media
// library. The photo is added to the library and handed back to the form,
// which selects it straight away.
//
// It is not a <form> of its own (forms can't be nested); the button does the
// work. The server checks, resizes and strips hidden data from every image.

import { useId, useRef, useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import { type MediaOption, mediaLabel } from "@/lib/media-options";
import type { Media } from "@/lib/types";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

type Props = {
  /** Called with the new photo, ready to use as an option in the form's picker. */
  onUploaded: (photo: MediaOption) => void;
  /** e.g. "Upload a new bottle photo". */
  label?: string;
};

export default function PhotoUpload({ onUploaded, label = "Upload a new photo" }: Props) {
  const { upload, toast } = useAdmin();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const details = useRef<HTMLDetailsElement>(null);
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    const file = fileInput.current?.files?.[0];
    setError(null);
    if (!file) return setError("Choose a photo first.");
    if (!ACCEPTED.includes(file.type)) return setError("Only JPEG, PNG and WebP photos are allowed.");
    if (!alt.trim()) return setError("Describe the photo in a few words.");
    const form = new FormData();
    form.append("file", file);
    form.append("alt", alt.trim());
    setBusy(true);
    try {
      const media = await upload<Media>("/admin/media", form);
      onUploaded({
        id: media.id,
        url: media.url,
        alt: media.alt,
        width: media.width,
        height: media.height,
        label: mediaLabel(media),
      });
      toast("Photo uploaded and selected. Remember to save.");
      setAlt("");
      if (fileInput.current) fileInput.current.value = "";
      if (details.current) details.current.open = false;
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details ref={details} className="photo-upload">
      <summary>{label}…</summary>
      <div role="alert">{error && <p className="alert alert-error">{error}</p>}</div>
      <div className="field">
        <label htmlFor={`${id}-file`}>Photo file</label>
        <input id={`${id}-file`} ref={fileInput} type="file" accept={ACCEPTED.join(",")} />
        <span className="field-hint">JPEG, PNG or WebP. Location data and other hidden details are removed.</span>
      </div>
      <div className="field">
        <label htmlFor={`${id}-alt`}>Describe the photo</label>
        <input id={`${id}-alt`} value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={500} aria-describedby={`${id}-alt-hint`} />
        <span id={`${id}-alt-hint`} className="field-hint">
          Read aloud to visitors who can&apos;t see it, e.g. &quot;Hernö Gin bottle on a wooden bar&quot;.
        </span>
      </div>
      <button type="button" className="button button-secondary" onClick={send} disabled={busy}>
        {busy ? "Uploading…" : "Upload"}
      </button>
    </details>
  );
}
