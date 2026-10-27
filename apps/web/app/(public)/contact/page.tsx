// The contact form. Messages go to Admin → Messages (the site sends no email).
// Cloudflare Turnstile checks that a person, not a bot, is sending it.
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import FormattedText from "@/components/FormattedText";
import { getSite, siteText } from "@/lib/public-api";
import { contactFormOn, turnstileSiteKey } from "@/lib/turnstile";

import styles from "../prose.module.css";
import ContactForm from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Send The Gin Cabinet a message: questions, tips or a gin we should try.",
  alternates: { canonical: "/contact" },
};

export default async function ContactPage() {
  const site = await getSite();
  const siteKey = turnstileSiteKey();
  if (!contactFormOn(site) || !siteKey) notFound();
  // This page's script nonce (proxy.ts), so the Turnstile loader may run.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <article className={styles.prose}>
      <h1>Contact</h1>
      <FormattedText text={siteText(site, "contact.intro")} />
      <ContactForm siteKey={siteKey} nonce={nonce} />
      <p className="field-hint">
        We keep messages for a year at most and use your details only to reply. See the{" "}
        <Link href="/privacy">privacy page</Link>.
      </p>
    </article>
  );
}
