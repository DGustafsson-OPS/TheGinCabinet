// Show an editable page text (Admin → Page texts) with a few simple marks:
//
//   ## A heading          - a bullet            1. a numbered step
//   **bold words**        [link text](https://…) or [text](/a-page)
//
// A blank line starts a new paragraph. Like InlineText, nothing is ever
// inserted as HTML: we build each element ourselves and React escapes the
// text, so whatever an editor types can't run as code on the site.
import type { ReactNode } from "react";

import InlineText from "@/components/InlineText";

type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "bullets" | "numbers"; items: string[] };

const BULLET = /^[-*]\s+(.*)$/;
const NUMBER = /^\d+[.)]\s+(.*)$/;
const HEADING = /^#{2,3}\s+(.*)$/;

/** Cut the text into headings, paragraphs and lists, line by line. */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let current = null as Block | null; // the paragraph or list being filled
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    let match: RegExpExecArray | null;
    if (!line) {
      current = null; // a blank line ends the paragraph or list
    } else if ((match = HEADING.exec(line))) {
      blocks.push({ kind: "heading", text: match[1] });
      current = null;
    } else if ((match = BULLET.exec(line)) || (match = NUMBER.exec(line))) {
      const kind = BULLET.test(line) ? "bullets" : "numbers";
      if (current?.kind !== kind) {
        current = { kind, items: [] };
        blocks.push(current);
      }
      (current as { items: string[] }).items.push(match[1]);
    } else if (current?.kind === "paragraph") {
      current.lines.push(line);
    } else {
      current = { kind: "paragraph", lines: [line] };
      blocks.push(current);
    }
  }
  return blocks;
}

/** One line of text: **bold** parts, and links via InlineText. */
export function FormattedLine({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  text.split(/\*\*([^*\n]+)\*\*/).forEach((piece, index) => {
    // split() with a (group) gives: plain, bold, plain, bold, …
    parts.push(index % 2 ? <strong key={index}><InlineText text={piece} /></strong> : <InlineText key={index} text={piece} />);
  });
  return <>{parts}</>;
}

type Props = {
  text: string;
  /** A class for the first paragraph only (e.g. a larger "lead" paragraph). */
  leadClassName?: string;
};

export default function FormattedText({ text, leadClassName }: Props) {
  const blocks = toBlocks(text);
  const lead = blocks.findIndex((block) => block.kind === "paragraph");
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === "heading") return <h2 key={index}><FormattedLine text={block.text} /></h2>;
        if (block.kind === "paragraph") {
          return (
            <p key={index} className={index === lead ? leadClassName : undefined}>
              <FormattedLine text={block.lines.join(" ")} />
            </p>
          );
        }
        const items = block.items.map((item, i) => (
          <li key={i}>
            <FormattedLine text={item} />
          </li>
        ));
        return block.kind === "bullets" ? <ul key={index}>{items}</ul> : <ol key={index}>{items}</ol>;
      })}
    </>
  );
}
