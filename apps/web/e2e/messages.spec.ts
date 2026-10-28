// The messages inbox: the unread count in the menu, folders, notes and spam.
//
// The contact form can't create messages here (CI's Turnstile test key always
// refuses), so the test puts one straight into the database with the API's
// own code, using GC_DATABASE_URL (set in CI; see e2e/README.md locally).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { HAS_CREDENTIALS, gotoReady, signInThroughUi, toasts, unique } from "./helpers";

test.skip(!HAS_CREDENTIALS, "Set E2E_PASSWORD and E2E_TOTP_SECRET (see e2e/README.md)");
test.skip(!process.env.GC_DATABASE_URL, "Set GC_DATABASE_URL so the test can add a message");

const API_DIR = path.resolve(__dirname, "../../api");
const PYTHON = existsSync(path.join(API_DIR, ".venv/bin/python")) ? path.join(API_DIR, ".venv/bin/python") : "python";

function addMessage(name: string) {
  const script = [
    "import sys",
    "from app.db import SessionLocal",
    "from app.models import ContactMessage",
    "with SessionLocal() as db:",
    "    db.add(ContactMessage(name=sys.argv[1], email='visitor@example.com', message='Hello from the test.', sender_hash='e' * 64))",
    "    db.commit()",
  ].join("\n");
  execFileSync(PYTHON, ["-c", script, name], { cwd: API_DIR, env: process.env });
}

test("folders, notes and spam in the messages inbox", async ({ page }) => {
  const tag = unique();
  const sender = `Visitor ${tag}`;
  const folder = `Ideas ${tag}`;
  addMessage(sender);
  await signInThroughUi(page);

  // The menu shows how many messages are new.
  await gotoReady(page, "/juniper");
  await expect(page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: /^Messages \d+ new$/ })).toBeVisible();

  // Add a folder.
  await gotoReady(page, "/juniper/messages");
  await page.getByText("Manage folders…").click();
  await page.getByLabel("New folder").fill(folder);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(toasts(page)).toContainText(`Folder "${folder}" added.`);

  // Move the message into it: it leaves the Inbox and shows in the folder.
  const card = page.getByRole("article", { name: `Message from ${sender}` });
  await card.getByLabel("Move to").selectOption({ label: folder });
  await expect(toasts(page)).toContainText(`Moved to ${folder}.`);
  await expect(card).toHaveCount(0);
  const boxes = page.getByRole("navigation", { name: "Message folders" });
  await boxes.getByRole("link", { name: new RegExp(`^${folder}`) }).click();
  await expect(page.getByRole("heading", { level: 2, name: folder })).toBeVisible();
  await expect(card).toBeVisible();

  // A note keeps a copy of the reply, line breaks and all.
  await card.getByRole("textbox", { name: "Add a note" }).fill("Replied:\nThanks, we'll try it!");
  await card.getByRole("button", { name: "Add note" }).click();
  await expect(toasts(page)).toContainText("Note added.");
  await expect(card.getByText("Thanks, we'll try it!")).toBeVisible();
  await expect(card.getByText(/E2E Admin ·/)).toBeVisible();

  // Spam: gone from the folder, found under Spam, and back with "Not spam".
  await card.getByRole("button", { name: "Mark as spam" }).click();
  await expect(toasts(page)).toContainText("Marked as spam");
  await expect(card).toHaveCount(0);
  await boxes.getByRole("link", { name: /^Spam/ }).click();
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Not spam" }).click();
  await expect(toasts(page)).toContainText("Not spam");
  await expect(card).toHaveCount(0);

  // Deleting the folder moves its message back to the Inbox.
  await boxes.getByRole("link", { name: new RegExp(`^${folder}`) }).click();
  await expect(card).toBeVisible();
  await gotoReady(page, page.url()); // a fresh page: the folder panel starts closed
  await page.getByText("Manage folders…").click();
  await page.getByRole("button", { name: `Delete ${folder}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete folder" }).click();
  await expect(toasts(page)).toContainText("Folder deleted.");
  await gotoReady(page, "/juniper/messages");
  await expect(card).toBeVisible();
});
