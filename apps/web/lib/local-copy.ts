// A safety copy of unsaved edits, kept in this browser (localStorage) while a
// form has changes. If the tab is closed, reloaded or the Back button is used,
// the editor finds the copy next time and offers to restore it, all inside
// the page, with no browser popup. The copy is removed once the work is saved.
//
// Nothing here leaves the browser. Every call is wrapped in try/catch because
// storage can be switched off (e.g. some private windows); then there's
// simply no copy.

export type LocalCopy<T> = {
  /** When the copy was written (ISO time). */
  savedAt: string;
  /** The record's version when editing started, to spot newer saves since. */
  version: number;
  data: T;
};

export function readLocalCopyRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function parseLocalCopy<T>(raw: string | null): LocalCopy<T> | null {
  if (!raw) return null;
  try {
    const copy = JSON.parse(raw) as LocalCopy<T>;
    return copy && typeof copy.savedAt === "string" && typeof copy.version === "number" ? copy : null;
  } catch {
    return null;
  }
}

export function writeLocalCopy<T>(key: string, version: number, data: T) {
  try {
    const copy: LocalCopy<T> = { savedAt: new Date().toISOString(), version, data };
    window.localStorage.setItem(key, JSON.stringify(copy));
  } catch {
    // Storage full or switched off: carry on without a copy.
  }
}

export function clearLocalCopy(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do.
  }
}
