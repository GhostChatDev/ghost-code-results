"use client";
import { useEffect, useState } from "react";
import PushSetup from "@/components/PushSetup";
import { ErrorLine, PageTitle, btn, btnDanger, btnPrimary, field } from "@/components/ui";
import { errMsg, useSession } from "@/lib/client/session";
import type { Profile } from "@/lib/core/types";

function zones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
}

function Card({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-calm-100 bg-white p-4">
      <h2 id={id} className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { call, download, signOut, email } = useSession();
  const [p, setP] = useState<Profile | null>(null);
  const [tz, setTz] = useState("UTC");
  const [qs, setQs] = useState("");
  const [qe, setQe] = useState("");
  const [showTitle, setShowTitle] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await call<{ profile: Profile }>("/api/profile");
        setP(r.profile);
        setTz(r.profile.time_zone);
        setQs(r.profile.quiet_start ?? "");
        setQe(r.profile.quiet_end ?? "");
        setShowTitle(r.profile.show_task_title);
      } catch (e) {
        setErr(errMsg(e));
      }
    })();
  }, [call]);

  async function save() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await call<{ profile: Profile }>("/api/profile", {
        method: "PATCH",
        body: { time_zone: tz, quiet_start: qs || null, quiet_end: qe || null, show_task_title: showTitle },
      });
      setP(r.profile);
      setMsg("Saved.");
    } catch (e) {
      setErr(errMsg(e));
    }
    setBusy(false);
  }

  async function exportAs(fmt: "md" | "json") {
    setErr(null);
    try {
      await download(`/api/export?format=${fmt}`, `confirm-and-remind.${fmt === "md" ? "md" : "json"}`);
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  async function deleteAccount() {
    setBusy(true);
    setErr(null);
    try {
      await call("/api/account", { method: "POST", body: { confirm: "DELETE" } });
      try { indexedDB.deleteDatabase("confirm-and-remind"); } catch { /* best effort */ }
      await signOut();
    } catch (e) {
      setErr(errMsg(e));
      setBusy(false);
    }
  }

  const list = zones();
  if (!list.includes(tz)) list.unshift(tz);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Settings</PageTitle>
      <ErrorLine message={err} />
      {msg && <p role="status" className="rounded-xl bg-calm-50 p-3">{msg}</p>}
      <Card id="time-h" title="Time and quiet hours">
        <label className="flex flex-col gap-1 text-sm">Time zone
          <select className={field} value={tz} onChange={(e) => setTz(e.target.value)} disabled={!p}>
            {list.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm">Quiet from
            <input type="time" className={field} value={qs} onChange={(e) => setQs(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm">Quiet until
            <input type="time" className={field} value={qe} onChange={(e) => setQe(e.target.value)} />
          </label>
        </div>
        <p className="text-xs text-calm-600">Reminders that fall in quiet hours are held until quiet hours end.</p>
        <label className="flex min-h-11 items-center gap-3">
          <input type="checkbox" className="h-6 w-6" checked={showTitle} onChange={(e) => setShowTitle(e.target.checked)} />
          <span>Show the task title in notifications</span>
        </label>
        <p className="text-xs text-calm-600">Off by default: notifications say "You have a reminder. Open Confirm &amp; Remind."</p>
        <button className={btnPrimary} disabled={busy || !p} onClick={save}>Save settings</button>
      </Card>
      <PushSetup />
      <Card id="export-h" title="Export your data">
        <div className="flex gap-2">
          <button className={btn} onClick={() => exportAs("md")}>Export Markdown</button>
          <button className={btn} onClick={() => exportAs("json")}>Export JSON</button>
        </div>
      </Card>
      <Card id="acct-h" title="Account">
        <p className="text-sm text-calm-600">Signed in as {email}</p>
        <button className={btn} onClick={() => signOut()}>Sign out</button>
        <label className="flex flex-col gap-1 text-sm">Type DELETE to delete your account and all data
          <input className={field} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
        </label>
        <button className={btnDanger} disabled={busy || confirmText !== "DELETE"} onClick={deleteAccount}>Delete account and all data</button>
      </Card>
    </div>
  );
}
