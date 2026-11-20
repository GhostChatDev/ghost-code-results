"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { clearDraft, loadDraft, saveDraft } from "@/lib/drafts";
import { errMsg, useSession } from "./session";
import type { Item } from "./reminders";

/** Text typed into a box is written to IndexedDB at once (not awaited), and restored after a reload. */
export function useDraft(key: string) {
  const [text, setTextState] = useState("");
  const [restored, setRestored] = useState(false);
  const clientId = useRef("");
  if (!clientId.current && typeof crypto !== "undefined") clientId.current = crypto.randomUUID();

  useEffect(() => {
    loadDraft(key)
      .then((d) => {
        if (d) {
          setTextState(d.text);
          clientId.current = d.clientId;
          setRestored(true);
        }
      })
      .catch(() => {});
  }, [key]);

  const setText = useCallback(
    (t: string) => {
      setTextState(t);
      saveDraft(key, t, clientId.current).catch(() => {});
    },
    [key],
  );
  const clear = useCallback(() => {
    setTextState("");
    setRestored(false);
    clientId.current = crypto.randomUUID();
    clearDraft(key).catch(() => {});
  }, [key]);
  return { text, setText, clear, restored, clientId };
}

/** Tasks with their reminder occurrences. Reloads when something announces "cr-refresh". */
export function useItems() {
  const { call } = useSession();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const r = await call<{ items: Item[] }>("/api/tasks");
      setItems(r.items);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, [call]);
  useEffect(() => {
    reload();
    window.addEventListener("cr-refresh", reload);
    return () => window.removeEventListener("cr-refresh", reload);
  }, [reload]);
  return { items, error, reload };
}
