// Small display helpers shared by admin pages.

/** "1299.00" + "EUR" → "€1,299.00". Decimal strings from the API stay exact until here. */
export function formatMoney(amount: string | null | undefined, currency: string | null): string {
  if (amount == null || !currency) return "–";
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(Number(amount));
  } catch {
    return `${currency} ${amount}`; // unknown currency code: show it plainly
  }
}

/** "2026-10-05" → "5 Oct 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

/** A timestamp with time, shown in UTC (spec §7 stores UTC). */
export function formatDateTime(iso: string): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(iso)) + " UTC"
  );
}

/** "london_dry" → "London dry". */
export function humanize(value: string): string {
  const text = value.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Read one value from Next.js searchParams (which may hold a string or a list). */
export function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Today's date as YYYY-MM-DD, for date inputs. */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Plural forms for units that are words ("2 dashes", "3 leaves").
const PLURALS: Record<string, string> = {
  dash: "dashes", drop: "drops", piece: "pieces", slice: "slices", wedge: "wedges",
  sprig: "sprigs", leaf: "leaves", barspoon: "barspoons",
};

/** "50 ml", "2 dashes", "1 slice"… An amount and its unit, ready to read. */
export function formatAmount(quantity: string | null, unit: string): string {
  if (unit === "top up") return "Top up";
  if (quantity === null) return unit;
  const plural = Number(quantity) !== 1 && PLURALS[unit];
  return `${quantity} ${plural || unit}`;
}

/**
 * Alcohol strength as written on Finnish and EU labels: "41.5 % vol".
 * The API sends "41.50"; trailing zeros go ("40.00" → "40 % vol"). The
 * spaces are non-breaking, so the number never wraps away from "% vol".
 */
export function formatStrength(abv: string | number | null | undefined): string {
  if (abv === null || abv === undefined || abv === "") return "";
  const value = Number(abv);
  if (!Number.isFinite(value)) return "";
  return `${String(Number(value.toFixed(2)))} % vol`;
}
