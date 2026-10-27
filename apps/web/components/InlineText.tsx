// Show article text, turning `[label](address)` into links.
//
// We never insert the text as HTML. Instead the text is cut into pieces:
// plain strings (React escapes them) and <a> elements we build ourselves.
// Only https://, http:// and /site-paths become links; anything else (for
// example "javascript:") stays visible as plain text. The API already refuses
// such links; this is a second line of defence.
import Link from "next/link";
import type { ReactNode } from "react";

const LINK = /\[([^\]\n]+)\]\(([^)\s]*)\)/g;
const SAFE_URL = /^(https?:\/\/[^\s<>"]+|\/[^\s<>"]*)$/;

export default function InlineText({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  // matchAll finds every `[label](url)` in order, with its position.
  for (const match of text.matchAll(LINK)) {
    const [whole, label, url] = match;
    const start = match.index ?? 0;
    if (!SAFE_URL.test(url)) continue; // leave it as plain text
    parts.push(text.slice(last, start));
    parts.push(
      url.startsWith("/") ? (
        <Link key={start} href={url}>
          {label}
        </Link>
      ) : (
        <a key={start} href={url} rel="noopener noreferrer">
          {label}
        </a>
      ),
    );
    last = start + whole.length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}
