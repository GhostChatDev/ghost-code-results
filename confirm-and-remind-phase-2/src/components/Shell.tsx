"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { SessionProvider, useSession } from "@/lib/client/session";
import { syncPending } from "@/lib/client/reminders";

const TABS = [
  { href: "/", label: "Today" },
  { href: "/notes", label: "Notes" },
  { href: "/upcoming", label: "Upcoming" },
  { href: "/review", label: "Review" },
  { href: "/settings", label: "Settings" },
];

function AuthForm() {
  const { signIn, config } = useSession();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(await signIn(mode, email, pw));
    setBusy(false);
  }
  const field = "w-full min-h-12 rounded-xl border border-calm-100 bg-white px-4 text-base";
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 p-6">
      <div>
        <h1 className="text-3xl font-semibold text-calm-700">Confirm &amp; Remind</h1>
        <p className="mt-1 text-calm-600">Write it down. Confirm what matters. Get reminded.</p>
      </div>
      {config?.mock && (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Local test mode: Supabase is not configured, so any password works and data lives in server memory. Not for real use.
        </p>
      )}
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-sm" htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
        <label className="text-sm" htmlFor="pw">Password</label>
        <input id="pw" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} value={pw} onChange={(e) => setPw(e.target.value)} className={field} />
        {msg && <p role="alert" className="text-sm text-red-700">{msg}</p>}
        <button disabled={busy} className="min-h-12 rounded-xl bg-calm-600 px-4 text-lg font-medium text-white disabled:opacity-60">
          {mode === "in" ? "Sign in" : "Create account"}
        </button>
      </form>
      <button onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }} className="min-h-12 text-calm-700 underline">
        {mode === "in" ? "New here? Sign up" : "Have an account? Sign in"}
      </button>
    </main>
  );
}

function Gate({ children }: { children: ReactNode }) {
  const { ready, loadError, email, call } = useSession();
  const path = usePathname();

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    if (!email) return;
    const run = async () => {
      if ((await syncPending(call)) > 0) window.dispatchEvent(new Event("cr-refresh"));
    };
    run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [email, call]);

  useEffect(() => {
    if (!email) return;
    // First sign-in: use this device's time zone if the profile still has the default.
    call<{ profile: { time_zone: string } }>("/api/profile")
      .then(async (r) => {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (r.profile.time_zone === "UTC" && tz && tz !== "UTC") await call("/api/profile", { method: "PATCH", body: { time_zone: tz } });
      })
      .catch(() => {});
  }, [email, call]);

  if (!ready) return <p className="p-6 text-calm-600">Loading…</p>;
  if (loadError) return <p className="p-6">Can't reach the server. Check your connection and reload.</p>;
  if (!email) return <AuthForm />;
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <main className="flex-1 px-4 pb-28 pt-6 sm:pb-8">{children}</main>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 border-t border-calm-100 bg-white sm:static sm:border-t-0 sm:border-b sm:order-first">
        <ul className="mx-auto flex max-w-2xl">
          {TABS.map((t) => (
            <li key={t.href} className="flex-1">
              <Link href={t.href} aria-current={path === t.href ? "page" : undefined} className={`flex min-h-14 items-center justify-center text-sm font-medium ${path === t.href ? "text-calm-700 underline underline-offset-8" : "text-calm-500"}`}>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <Gate>{children}</Gate>
    </SessionProvider>
  );
}
