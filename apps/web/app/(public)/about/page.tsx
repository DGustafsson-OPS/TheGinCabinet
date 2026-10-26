// P09 About (spec §4): origin story, tasting method and how to get in touch.
// No administrator names, usernames or emails are shown (spec P09).
import type { Metadata } from "next";
import Link from "next/link";

import styles from "../prose.module.css";

export const metadata: Metadata = {
  title: "About",
  description: "How The Gin Cabinet started, and how we taste and score every gin.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <article className={styles.prose}>
      <h1>About The Gin Cabinet</h1>
      <p className={styles.lead}>
        One cabinet, two friends and a growing row of bottles. This site is where we keep track of
        what we drink, what we think of it and what we mix with it.
      </p>

      <h2>How we taste</h2>
      <p>Every gin is tasted at least twice before it is reviewed:</p>
      <ol>
        <li>
          <strong>Neat</strong>, at room temperature, in a tulip glass: nose, palate and finish.
        </li>
        <li>
          <strong>With tonic</strong>, over plenty of ice, with a light, neutral tonic first and
          then the garnish we think suits it best.
        </li>
      </ol>
      <p>
        We score out of ten. A 7 is a good gin we would happily buy again; a 9 is one we
        recommend to everyone. Scores are personal, and the notes explain why.
      </p>

      <h2>What you see here</h2>
      <p>
        The collection shows gins we have catalogued and chosen to share. Bottle counts, prices
        and our private tasting notes stay private.
      </p>

      <h2>Get in touch</h2>
      <p>
        Questions, tips or a gin we should try? Contact details will appear here once the site
        launches. See the <Link href="/privacy">privacy page</Link> for how we handle messages.
      </p>
    </article>
  );
}
