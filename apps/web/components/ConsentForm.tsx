// The per-category cookie choices, used by the banner ("Choose cookies") and
// the Cookie settings page. One checkbox per category from lib/consent.ts;
// "Necessary" is shown ticked and locked, so visitors see it exists but can't
// switch it off.
//
// A plain form that posts to /consent: works without JavaScript.
import { CONSENT_CATEGORIES } from "@/lib/consent";

import styles from "@/app/(public)/consent.module.css";

import ReturnPathInput from "./ReturnPathInput";

type Props = {
  idPrefix: string; // keeps element ids unique when two forms are on a page
  analytics: boolean; // the current choice, to pre-tick the box
  returnTo?: string; // fixed page to return to (otherwise: the current page)
};

export default function ConsentForm({ idPrefix, analytics, returnTo }: Props) {
  return (
    <form method="post" action="/consent" className={styles.choices}>
      {returnTo ? <input type="hidden" name="next" value={returnTo} /> : <ReturnPathInput />}
      <fieldset className={styles.fieldset}>
        <legend className="visually-hidden">Cookie categories</legend>
        {CONSENT_CATEGORIES.map((category) => {
          const id = `${idPrefix}-${category.key}`;
          return (
            <div key={category.key} className={styles.category}>
              <input
                id={id}
                type="checkbox"
                name={category.key}
                defaultChecked={category.required || (category.key === "analytics" && analytics)}
                disabled={category.required}
                aria-describedby={`${id}-desc`}
              />
              <div>
                <label htmlFor={id} className={styles.categoryTitle}>
                  {category.title}
                  {category.required && <span className={styles.always}> (always on)</span>}
                </label>
                <p id={`${id}-desc`} className={styles.categoryText}>
                  {category.description}
                </p>
              </div>
            </div>
          );
        })}
      </fieldset>
      <button className="button button-primary" type="submit" name="choice" value="custom">
        Save my choices
      </button>
    </form>
  );
}
