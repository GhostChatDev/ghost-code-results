"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface Config {
  mock: boolean;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  vapidPublicKey: string | null;
  pushConfigured: boolean;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export const errMsg = (e: unknown): string =>
  e instanceof ApiError ? (e.status === 0 ? "You are offline. Try again when the network is back." : e.message) : "Something went wrong";

export type Call = <T>(path: string, init?: { method?: string; body?: unknown }) => Promise<T>;

interface SessionValue {
  ready: boolean;
  loadError: boolean;
  config: Config | null;
  email: string | null;
  signIn: (mode: "in" | "up", email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  call: Call;
  download: (path: string, filename: string) => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);
export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("SessionProvider is missing");
  return v;
}

const MOCK_KEY = "cr-mock-email";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const sb = useRef<SupabaseClient | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const c = (await (await fetch("/api/config")).json()) as Config;
        setConfig(c);
        if (!c.mock && c.supabaseUrl && c.supabaseAnonKey) {
          const client = createClient(c.supabaseUrl, c.supabaseAnonKey);
          sb.current = client;
          const { data } = await client.auth.getSession();
          setEmail(data.session?.user.email ?? null);
          client.auth.onAuthStateChange((_e, s) => setEmail(s?.user.email ?? null));
        } else {
          setEmail(localStorage.getItem(MOCK_KEY));
        }
      } catch {
        setLoadError(true);
      }
      setReady(true);
    })();
  }, []);

  const token = useCallback(async (): Promise<string | null> => {
    if (sb.current) return (await sb.current.auth.getSession()).data.session?.access_token ?? null;
    const e = localStorage.getItem(MOCK_KEY);
    return e ? "mock:" + e : null;
  }, []);

  const call = useCallback<Call>(
    async (path, init = {}) => {
      const t = await token();
      if (!t) throw new ApiError(401, "Sign in required");
      let res: Response;
      try {
        res = await fetch(path, {
          method: init.method ?? "GET",
          headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        });
      } catch {
        throw new ApiError(0, "You are offline");
      }
      if (!res.ok) {
        let m = "Something went wrong";
        try {
          m = ((await res.json()) as { error?: string }).error ?? m;
        } catch {
          /* keep generic message */
        }
        throw new ApiError(res.status, m);
      }
      return (await res.json()) as never;
    },
    [token],
  );

  const download = useCallback(
    async (path: string, filename: string) => {
      const t = await token();
      if (!t) throw new ApiError(401, "Sign in required");
      let res: Response;
      try {
        res = await fetch(path, { headers: { Authorization: `Bearer ${t}` } });
      } catch {
        throw new ApiError(0, "You are offline");
      }
      if (!res.ok) throw new ApiError(res.status, "Export failed");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
    [token],
  );

  const signIn = useCallback(async (mode: "in" | "up", em: string, pw: string): Promise<string | null> => {
    const e = em.trim().toLowerCase();
    if (!sb.current) {
      // Local MOCK mode only (server has no Supabase configured).
      if (!/^[a-z0-9._%+@-]{3,80}$/.test(e)) return "Enter a valid email";
      localStorage.setItem(MOCK_KEY, e);
      setEmail(e);
      return null;
    }
    if (pw.length < 8) return "Use a password of at least 8 characters";
    if (mode === "up") {
      const { data, error } = await sb.current.auth.signUp({ email: e, password: pw });
      if (error) return error.message;
      return data.session ? null : "Check your email to confirm your account, then sign in.";
    }
    const { error } = await sb.current.auth.signInWithPassword({ email: e, password: pw });
    return error ? "Wrong email or password" : null;
  }, []);

  const signOut = useCallback(async () => {
    if (sb.current) await sb.current.auth.signOut();
    localStorage.removeItem(MOCK_KEY);
    setEmail(null);
  }, []);

  return <Ctx.Provider value={{ ready, loadError, config, email, signIn, signOut, call, download }}>{children}</Ctx.Provider>;
}
