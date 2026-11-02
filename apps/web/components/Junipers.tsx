// A score shown as juniper berries out of five: ●●●●◐ = 4½ junipers.
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

export default function Junipers({ outOfTen, berries, size = "small", showNumber = false }: Props) {
  const raw = berries ?? (outOfTen != null && outOfTen !== "" ? toBerries(outOfTen) : null);
  if (raw == null) return null;
  const value = Math.round(Number(raw) * 2) / 2; // nearest half berry
  return (
    <span className={`${styles.junipers} ${styles[size]}`}>
      <span role="img" aria-label={`${value} out of 5 juniper berries`} className={styles.row}>
        {[0, 1, 2, 3, 4].map((i) => {
          const fill = Math.max(0, Math.min(1, value - i)); // 1, 0.5 or 0
          return (
            <span key={i} className={styles.slot}>
              <span className={styles.empty}>
                <Berry />
              </span>
              {fill > 0 && (
                <span className={styles.full} style={{ width: `${fill * 100}%` }}>
                  <Berry />
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
