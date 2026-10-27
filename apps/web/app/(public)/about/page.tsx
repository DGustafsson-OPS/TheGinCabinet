// P09 About (spec §4): origin story, tasting method and how to get in touch.
// The wording comes from Admin → Page texts.
// No administrator names, usernames or emails are shown (spec P09).
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import FormattedText from "@/components/FormattedText";
import { getSite, siteText } from "@/lib/public-api";
import { contactFormOn } from "@/lib/turnstile";

import styles from "../prose.module.css";

export const metadata: Metadata = {
  title: "About",
  description: "How The Gin Cabinet started, and how we taste and score every gin.",
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  // All the wording is edited in Admin → Page texts; the contact address in
  // Admin → Settings → Website.
  const site = await getSite();
  const text = (key: string) => siteText(site, key);
  return (
    <article className={styles.prose}>
      <h1>About {site?.site_name ?? "The Gin Cabinet"}</h1>
      <Image
        src="/images/juniper-berries.jpg"
        alt="Fresh juniper berries and sprigs on a dark wooden table"
        width={1408}
        height={768}
        className={styles.banner}
        priority
      />
      <FormattedText text={text("about.intro")} leadClassName={styles.lead} />
      <FormattedText text={text("about.body")} />

      <h2>{text("about.contact_title")}</h2>
      <FormattedText text={text("about.contact_text")} />
      <p>
        {contactFormOn(site) && <Link href="/contact">Send us a message</Link>}
        {contactFormOn(site) && site?.contact_email && ", or email us at "}
        {!contactFormOn(site) && site?.contact_email && "Email us at "}
        {site?.contact_email && <a href={`mailto:${site.contact_email}`}>{site.contact_email}</a>}
        {contactFormOn(site) || site?.contact_email ? "." : "Contact details will appear here soon."}{" "}
        See the <Link href="/privacy">privacy page</Link> for how we handle messages.
      </p>
    </article>
  );
}
