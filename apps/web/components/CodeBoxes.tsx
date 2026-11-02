"use client";
// The 6-digit authenticator code, shown as six boxes.
//
// Underneath it is still ONE ordinary input (invisible, laid over the boxes),
// so pasting the whole code, password-manager autofill, screen readers and the
// browser's own form handling all work as usual. The boxes only show the
// digits typed so far and which box is next.

import { forwardRef, useState } from "react";

import styles from "./CodeBoxes.module.css";

type Props = {
  id: string;
  name?: string;
  value?: string; // controlled use; leave out to let the box keep its own value
  onChange?: (value: string) => void;
  describedBy?: string;
};

const LENGTH = 6;

const CodeBoxes = forwardRef<HTMLInputElement, Props>(function CodeBoxes(
  { id, name, value, onChange, describedBy },
  ref,
) {
  const [own, setOwn] = useState("");
  const [focused, setFocused] = useState(false);
  const code = value ?? own;
  const active = Math.min(code.length, LENGTH - 1); // the box the next digit goes in

  return (
    <div className={styles.wrap}>
      <input
        ref={ref}
        id={id}
        name={name}
        className={styles.input}
        value={code}
        onChange={(e) => {
          // Digits only (a pasted "123 456" becomes "123456"), at most six.
          const digits = e.target.value.replace(/\D/g, "").slice(0, LENGTH);
          if (value === undefined) setOwn(digits);
          onChange?.(digits);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={LENGTH}
        required
        aria-describedby={describedBy}
      />
      <div className={styles.boxes} aria-hidden="true">
        {Array.from({ length: LENGTH }, (_, i) => (
          <span
            key={i}
            className={[
              styles.box,
              code[i] ? styles.filled : "",
              focused && i === active && code.length < LENGTH ? styles.active : "",
              i === 2 ? styles.gapAfter : "",
            ].join(" ")}
          >
            {code[i] ?? ""}
          </span>
        ))}
      </div>
    </div>
  );
});

export default CodeBoxes;
