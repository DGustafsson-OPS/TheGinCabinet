"use client";
// Marks the page as interactive: <html data-hydrated="true">.
//
// The server sends finished HTML first; a moment later React "hydrates" it
// (attaches the JavaScript). Anything typed in that short gap can be lost.
// Browser tests wait for this marker before using forms. Nothing else uses it.

import { useEffect } from "react";

export default function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return null;
}
