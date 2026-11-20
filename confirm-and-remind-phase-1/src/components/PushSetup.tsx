"use client";
import { useCallback, useEffect, useState } from "react";
import { errMsg, useSession } from "@/lib/client/session";
import { btn, btnPrimary, ErrorLine } from "./ui";

interface Device { id: string; label: string; active: boolean; created_at: string }

function keyBytes(b64url: string): ArrayBuffer {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const buf = new ArrayBuffer(raw.length);
  const arr = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return buf;
}

function env() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Mac") && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return { ios, standalone, supported };
}

export default function PushSetup() {
  const { call, config } = useSession();
  const [devices, setDevices] = useState<Device[]>([]);
  const [e, setE] = useState<ReturnType<typeof env> | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDevices((await call<{ devices: Device[] }>("/api/push")).devices);
    } catch (x) {
      setErr(errMsg(x));
    }
  }, [call]);
  useEffect(() => {
    setE(env());
    load();
  }, [load]);

  async function enable() {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const key = config?.vapidPublicKey;
      if (!key) throw new Error("Push is not set up on this server (no VAPID public key).");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error("Notifications were not allowed. You can change this in your browser settings.");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
      await call("/api/push", { method: "POST", body: { subscription: sub.toJSON(), label: navigator.userAgent.slice(0, 60) } });
      setInfo("This device is enabled.");
      await load();
    } catch (x) {
      setErr(x instanceof Error && !(x as { status?: number }).status ? x.message : errMsg(x));
    }
    setBusy(false);
  }

  async function test() {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const r = await call<{ devices: number; accepted: number; simulated: boolean }>("/api/push/test", { method: "POST", body: {} });
      setInfo(r.simulated
        ? "Push keys are not configured on the server, so the send was simulated. Nothing was delivered."
        : `${r.accepted} of ${r.devices} device(s): accepted by the push service. Whether it shows up is up to your device.`);
    } catch (x) {
      setErr(errMsg(x));
    }
    setBusy(false);
  }

  async function remove(id: string) {
    setErr(null);
    try {
      await call(`/api/push?id=${id}`, { method: "DELETE" });
      await load();
    } catch (x) {
      setErr(errMsg(x));
    }
  }

  const needsHomeScreen = e?.ios && !e.standalone;
  return (
    <section aria-labelledby="push-h" className="rounded-2xl border border-calm-100 bg-white p-4">
      <h2 id="push-h" className="text-lg font-semibold">Notification devices</h2>
      {needsHomeScreen ? (
        <p className="mt-2 rounded-xl bg-amber-50 p-3">Add to Home Screen, open it from the icon, then tap Enable.</p>
      ) : e && !e.supported ? (
        <p className="mt-2 text-calm-600">This browser does not support Web Push.</p>
      ) : (
        <button className={`${btnPrimary} mt-3 w-full`} disabled={busy || !e} onClick={enable}>Enable notifications</button>
      )}
      <ul className="mt-3 space-y-2">
        {devices.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2 rounded-xl bg-calm-50 p-3 text-sm">
            <span className="min-w-0 break-words">{d.label || "Device"} · {d.active ? "active" : "disabled"}</span>
            <button className={btn} onClick={() => remove(d.id)} aria-label={`Remove device ${d.label || d.id}`}>Remove</button>
          </li>
        ))}
        {devices.length === 0 && <li className="text-calm-600">No devices enabled yet.</li>}
      </ul>
      <button className={`${btn} mt-3 w-full`} disabled={busy || devices.length === 0} onClick={test}>Send test notification</button>
      <p className="mt-2 text-xs text-calm-600">Delivery is best effort. Your device or browser may delay or drop notifications.</p>
      <div className="mt-2 space-y-2">
        {info && <p role="status" className="rounded-xl bg-calm-50 p-3 text-sm">{info}</p>}
        <ErrorLine message={err} />
      </div>
    </section>
  );
}
