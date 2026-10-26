"use client";
// Shares two things with every interactive admin component:
//   1. the CSRF token, needed on every change request (spec §8, §9);
//   2. `toast()`, for short "Saved" / "Something went wrong" messages (spec §2).
//
// It uses React *context*: the provider wraps the admin area once, and any
// component inside can call useAdmin() instead of receiving props at every level.

import { createContext, useCallback, useContext, useRef, useState } from "react";

import { ApiError, apiFetch } from "@/lib/api-client";

import styles from "./AdminProvider.module.css";

type ToastKind = "success" | "error";
type Toast = { id: number; kind: ToastKind; message: string };

type AdminContextValue = {
  csrfToken: string;
  toast: (message: string, kind?: ToastKind) => void;
  /** apiFetch with the CSRF token already filled in. */
  call: <T>(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) => Promise<T>;
};

const AdminContext = createContext<AdminContextValue | null>(null);

export function useAdmin(): AdminContextValue {
  const value = useContext(AdminContext);
  if (!value) throw new Error("useAdmin() must be used inside <AdminProvider>");
  return value;
}

export default function AdminProvider({
  csrfToken,
  children,
}: {
  csrfToken: string;
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const toast = useCallback((message: string, kind: ToastKind = "success") => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, kind, message }]);
    // Hide it again after 5 seconds.
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 5000);
  }, []);

  const call = useCallback(
    <T,>(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown) =>
      apiFetch<T>(path, { method, body, csrfToken }),
    [csrfToken],
  );

  return (
    <AdminContext.Provider value={{ csrfToken, toast, call }}>
      {children}
      {/* aria-live: screen readers read new toasts aloud without moving focus. */}
      <div className={styles.toasts} aria-live="polite" role="status">
        {toasts.map((t) => (
          <p key={t.id} className={t.kind === "error" ? styles.toastError : styles.toast}>
            {t.message}
          </p>
        ))}
      </div>
    </AdminContext.Provider>
  );
}

/** Turn any thrown error into a readable sentence for a toast or alert. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "validation_error" && Array.isArray(error.details)) {
      const first = error.details[0] as { field?: string; message?: string } | undefined;
      if (first?.field) return `${first.field}: ${first.message}`;
    }
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
