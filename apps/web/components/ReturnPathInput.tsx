"use client";
// A hidden form field holding the page the visitor opened (e.g. "/gins/x"),
// so the age gate can send them back there after they answer.
//
// The server can't know the address while drawing the layout, so the browser
// fills it in. useSyncExternalStore reads it without a "flash": the server
// draws an empty value, the browser the real one. Without JavaScript the
// field stays empty and /age-check falls back to the Referer header.
import { useSyncExternalStore } from "react";

const noSubscription = () => () => {}; // the address doesn't change while the gate is open

export default function ReturnPathInput() {
  const path = useSyncExternalStore(
    noSubscription,
    () => window.location.pathname + window.location.search,
    () => "",
  );
  return <input type="hidden" name="next" value={path} />;
}
