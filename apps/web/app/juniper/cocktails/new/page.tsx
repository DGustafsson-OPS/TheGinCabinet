// Start a recipe with just a name, then fill in the details in the editor.
// A server page, so requireStaff() can send signed-out visitors to /login.
import type { Metadata } from "next";
import Link from "next/link";

import { requireStaff } from "@/lib/server-api";

import NewCocktailForm from "./NewCocktailForm";

export const metadata: Metadata = { title: "New recipe" };

export default async function NewCocktailPage() {
  await requireStaff();
  return (
    <>
      <Link className="back-link" href="/juniper/cocktails">
        ← All recipes
      </Link>
      <div className="page-header">
        <h1>New recipe</h1>
      </div>
      <NewCocktailForm />
    </>
  );
}
