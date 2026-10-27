"use client";
// A dropdown filter that writes its choice into the URL (?style=london_dry),
// so the list page re-renders on the server with matching results.

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Props = {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  allLabel?: string;
};

export default function FilterSelect({ name, label, options, allLabel = "All" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function change(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("page");
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="field">
      <label htmlFor={`filter-${name}`}>{label}</label>
      <select
        id={`filter-${name}`}
        value={searchParams.get(name) ?? ""}
        onChange={(event) => change(event.target.value)}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
