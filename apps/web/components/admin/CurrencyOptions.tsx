// Suggestions for a currency box. Euro comes first (we're in Finland), then
// the neighbours' currencies; any other 3-letter code can still be typed.
// Use with <input list={CURRENCY_LIST_ID} …>.
export const CURRENCY_LIST_ID = "currency-options";

const CURRENCIES = [
  ["EUR", "Euro"],
  ["SEK", "Swedish krona"],
  ["NOK", "Norwegian krone"],
  ["DKK", "Danish krone"],
  ["GBP", "British pound"],
  ["USD", "US dollar"],
];

export default function CurrencyOptions() {
  return (
    <datalist id={CURRENCY_LIST_ID}>
      {CURRENCIES.map(([code, name]) => (
        <option key={code} value={code}>
          {name}
        </option>
      ))}
    </datalist>
  );
}
