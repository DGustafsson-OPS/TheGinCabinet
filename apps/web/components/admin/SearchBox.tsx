"use client";
// A search field that updates the URL (?search=...) as you type, which makes the
// server page re-render with filtered results. "Debounced" (spec §2): it waits
// until you pause typing for 300 ms, instead of searching on every key press.

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function SearchBox({ label, placeholder }: { label: string; placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("search") ?? "");

  useEffect(() => {
    const timer = setTimeout(() => {
      const current = searchParams.get("search") ?? "";
      if (value === current) return;
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set("search", value);
      else next.delete("search");
      next.delete("page"); // new search → back to page 1
      router.replace(`${pathname}?${next.toString()}`);
    }, 300);
    return () => clearTimeout(timer); // a new key press cancels the pending search
  }, [value, pathname, router, searchParams]);

  return (
    <div className="field">
      <label htmlFor="search">{label}</label>
      <input
        id="search"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
      />
    </div>
  );
}
