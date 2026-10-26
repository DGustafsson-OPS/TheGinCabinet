"use client";
// Drop images here, or pick them with the button (spec A09 "Upload/dropzone").
// Files are checked again on the server; the checks here are only a courtesy.

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { errorMessage, useAdmin } from "@/components/admin/AdminProvider";
import type { Media } from "@/lib/types";

import styles from "./media.module.css";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export default function UploadDropzone() {
  const router = useRouter();
  const { upload, toast } = useAdmin();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    let done = 0;
    for (const file of list) {
      if (!ACCEPTED.includes(file.type)) {
        toast(`${file.name}: only JPEG, PNG and WebP images are allowed.`, "error");
        continue;
      }
      const form = new FormData();
      form.append("file", file);
      try {
        await upload<Media>("/admin/media", form);
        done++;
      } catch (err) {
        toast(`${file.name}: ${errorMessage(err)}`, "error");
      }
    }
    setBusy(false);
    if (done > 0) {
      toast(`${done} image${done === 1 ? "" : "s"} uploaded. Add alt text to each.`);
      router.refresh();
    }
  }

  return (
    <div
      className={dragging ? styles.dropzoneActive : styles.dropzone}
      onDragOver={(event) => {
        event.preventDefault(); // allow dropping
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        send(event.dataTransfer.files);
      }}
    >
      <p>
        <strong>Drop images here</strong> or{" "}
        <button
          type="button"
          className="button button-secondary"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          {busy ? "Uploading…" : "Choose files"}
        </button>
      </p>
      <p className="field-hint">
        JPEG, PNG or WebP. Location data and other hidden details are removed automatically.
      </p>
      <label className="visually-hidden" htmlFor="upload-input">
        Upload images
      </label>
      <input
        ref={input}
        id="upload-input"
        type="file"
        accept={ACCEPTED.join(",")}
        multiple
        hidden
        onChange={(event) => {
          if (event.target.files) send(event.target.files);
          event.target.value = ""; // allow choosing the same file again
        }}
      />
    </div>
  );
}
