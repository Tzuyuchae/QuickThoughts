/**
 * File that keeps all the recorded memos in a React Context. 
 * It manages the shared memo list, handles adding/deleting memos, 
 * and provides the data to both the Home and Memos pages. 
 * Using this while we set up database schemas.
 */

"use client";


import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

export type MemoStatus = "ready" | "classifying" | "error";

export type Memo = {
  id: string;
  title: string;
  status: MemoStatus;
  date: string;
  audioUrl?: string;
  duration?: number;
  category?: string;
  transcription?: string;
  createdAt?: string;
};

interface MemoContextType {
  memos: Memo[];
  addMemo: (memo: Memo) => void;
  deleteMemo: (id: string) => void;
}

const MemoContext = createContext<MemoContextType | undefined>(undefined);

type FolderRow = { id: string; name: string };

type MemoRow = {
  id: string;
  title: string | null;
  transcription: string | null;
  created_at: string | null;
  folder_id: string | null;
};

function formatDateLabel(iso?: string | null) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function MemoProvider({ children }: { children: React.ReactNode }) {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [foldersLoaded, setFoldersLoaded] = useState(false);

  const supabase = useMemo(() => createClient(), []);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const newUserId = session?.user?.id ?? null;

      // If user changed, reset state
      setSessionUserId((prev) => {
        if (prev !== newUserId) {
          setMemos([]);
          setFolders([]);
          setFoldersLoaded(false);
        }
        return newUserId;
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const folderNameById = useMemo(() => {
    const map = new Map<string, string>();
    folders.forEach((f) => map.set(f.id, f.name));
    return map;
  }, [folders]);

  const folderIdByName = useMemo(() => {
    const map = new Map<string, string>();
    folders.forEach((f) => map.set(f.name, f.id));
    return map;
  }, [folders]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setFolders([]);
          setMemos([]);
          setFoldersLoaded(true);
        }
        return;
      }

      // Load folders
      const { data: folderRows, error: folderErr } = await supabase
        .from("folders")
        .select("id,name")
        .eq("user_id", user.id);

      if (!cancelled) {
        if (folderErr) {
          console.error("Failed to load folders", folderErr);
          setFolders([]);
        } else {
          setFolders((folderRows ?? []) as FolderRow[]);
        }
        setFoldersLoaded(true);
      }

      // Load memos (supports both folder_id and category-based schemas)
      const { data: memoRows, error: memoErr } = await supabase
        .from("memos")
        .select("id,title,transcription,created_at,folder_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (memoErr) {
        console.error("Failed to load memos", memoErr);
        if (!cancelled) setMemos([]);
        return;
      }

      const mapped: Memo[] = ((memoRows ?? []) as MemoRow[]).map((r) => {
        const category = r.folder_id
          ? folders.find((f) => f.id === r.folder_id)?.name || "Unsorted"
          : "Unsorted";
        const createdAt = r.created_at ?? undefined;
        return {
          id: r.id,
          title: (r.title ?? "Voice Memo") as string,
          status: "ready",
          date: formatDateLabel(createdAt),
          category,
          transcription: r.transcription ?? undefined,
          createdAt,
        };
      });

      if (!cancelled) setMemos(mapped);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase, sessionUserId]);

  const addMemo = (newMemo: Memo) => {
    // Optimistic UI update
    const optimistic: Memo = {
      ...newMemo,
      category: newMemo.category || "Unsorted",
      status: "ready",
      createdAt: newMemo.createdAt,
      date: newMemo.date || formatDateLabel(newMemo.createdAt),
    };

    setMemos((prev) => [optimistic, ...prev]);

    // Persist in background
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Resolve folder_id by folder name; fallback to Unsorted
      const desiredFolderName = optimistic.category || "Unsorted";
      const unsortedId = folderIdByName.get("Unsorted");
      const folderId = folderIdByName.get(desiredFolderName) || unsortedId;

      const payload: any = {
        user_id: user.id,
        title: optimistic.title,
        transcription: optimistic.transcription ?? null,
        folder_id: folderId,
        status: "ready",
      };

      const { data: inserted, error } = await supabase
        .from("memos")
        .insert(payload)
        .select("id,created_at")
        .single();

      if (error) {
        console.error("Failed to insert memo", error);
        return;
      }

      // Reconcile optimistic id with DB id (only if different)
      if (inserted?.id && inserted.id !== optimistic.id) {
        setMemos((prev) =>
          prev.map((m) =>
            m.id === optimistic.id
              ? {
                  ...m,
                  id: inserted.id,
                  createdAt: inserted.created_at ?? m.createdAt,
                  date: formatDateLabel(inserted.created_at ?? m.createdAt),
                }
              : m
          )
        );
      }
    })();
  };

  const deleteMemo = (id: string) => {
    // Optimistic UI update
    setMemos((prev) => prev.filter((m) => m.id !== id));

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from("memos")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);

      if (error) {
        console.error("Failed to delete memo", error);
      }
    })();
  };

  return (
    <MemoContext.Provider value={{ memos, addMemo, deleteMemo }}>
      {children}
    </MemoContext.Provider>
  );
}

export function useMemos() {
  const context = useContext(MemoContext);
  if (!context) throw new Error("useMemos must be used within a MemoProvider");
  return context;
}