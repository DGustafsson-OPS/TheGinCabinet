// A score shown as juniper berries out of five: ●●●●◐ = 4½ junipers.
// Tonics use little clear tonic bottles instead (symbol="bottle").
//
// Ratings are stored out of 10 (full reviews, tonic reviews and gin
// averages); quick reviews are stored as berries. Pass whichever you have:
// `outOfTen` is halved, and both are rounded to the nearest half berry.
// Screen readers hear "4.5 out of 5 juniper berries".
import styles from "./Junipers.module.css";

type Props = {
  outOfTen?: string | number | null;
  berries?: string | number | null;
  size?: "small" | "medium" | "large";
  /** Also write the number next to the berries, e.g. "4½". */
  showNumber?: boolean;
  /** "bottle" for tonics: small clear tonic bottles. */
  symbol?: "juniper" | "bottle";
};

/** 8.6 out of 10 → 4.5 berries (to the nearest half). */
export function toBerries(outOfTen: string | number): number {
  return Math.round(Number(outOfTen)) / 2;
}

/** 4.5 → "4½", 4 → "4". */
export function berriesText(berries: number): string {
  const whole = Math.floor(berries);
  return berries - whole >= 0.5 ? `${whole || ""}½` : String(whole);
}

function Berry() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {/* The berry, its dusty bloom, and the three-pointed mark at the top. */}
      <circle cx="8" cy="8.5" r="6.5" fill="#46557a" />
      <circle cx="9.2" cy="9.8" r="5" fill="#3a4766" />
      <ellipse cx="5.6" cy="6.4" rx="2" ry="1.3" fill="#fff" opacity="0.4" />
      <path d="M8 3.4 V5.2 M8 5.2 L6.6 6.1 M8 5.2 L9.4 6.1" stroke="#1f2638" strokeWidth="0.9" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** A small clear tonic bottle with bubbles (for tonic ratings). */
function TonicBottle() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="6.3" y="0.8" width="3.4" height="1.9" rx="0.5" fill="#5f7480" />
      <path
        d="M6.6 2.7 H9.4 V4.6 L11.3 6.8 V14 A1.2 1.2 0 0 1 10.1 15.2 H5.9 A1.2 1.2 0 0 1 4.7 14 V6.8 L6.6 4.6 Z"
        fill="#e3eef2"
        stroke="#6f8a95"
        strokeWidth="0.9"
        strokeLinejoin="round"
      />
      <path d="M5.3 8.6 H10.7 V14 A0.6 0.6 0 0 1 10.1 14.6 H5.9 A0.6 0.6 0 0 1 5.3 14 Z" fill="#c9dfe7" />
      <circle cx="7.2" cy="12.2" r="0.6" fill="#fff" />
      <circle cx="8.9" cy="10.6" r="0.5" fill="#fff" />
      <circle cx="8" cy="13.3" r="0.45" fill="#fff" />
      <rect x="5.6" y="7.2" width="0.8" height="5.6" rx="0.4" fill="#fff" opacity="0.7" />
    </svg>
  );
}

export default function Junipers({ outOfTen, berries, size = "small", showNumber = false, symbol = "juniper" }: Props) {
  const Symbol = symbol === "bottle" ? TonicBottle : Berry;
  const noun = symbol === "bottle" ? "tonic bottles" : "juniper berries";
  const raw = berries ?? (outOfTen != null && outOfTen !== "" ? toBerries(outOfTen) : null);
  if (raw == null) return null;
  const value = Math.round(Number(raw) * 2) / 2; // nearest half berry
  return (
    <span className={`${styles.junipers} ${styles[size]}`}>
      <span role="img" aria-label={`${value} out of 5 ${noun}`} className={styles.row}>
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = Math.max(0, Math.min(1, value - i)); // 1, 0.5 or 0
          return (
            <span key={i} className={styles.slot}>
              <span className={styles.empty}>
                <Symbol />
              </span>
              {fill > 0 && (
                <span className={styles.full} style={{ width: `${fill * 100}%` }}>
                  <Symbol />
                </span>
              )}
            </span>
          );
        })}
      </span>
      {showNumber && <span className={styles.number}>{berriesText(value)}</span>}
    </span>
  );
}
