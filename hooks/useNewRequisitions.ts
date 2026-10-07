'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const STORAGE_KEY = 'admin_requisitions_last_seen';
const SEEN_EVENT = 'admin-requisitions-seen';
const POLL_INTERVAL_MS = 15_000;
const INITIAL_SEEN = '1970-01-01T00:00:00.000Z';

/** Track new orders since this browser last opened the requisitions tab. */
export function useNewRequisitions() {
  const [newCount, setNewCount] = useState(0);
  const versionRef = useRef(0);
  const lastSeenRef = useRef(INITIAL_SEEN);

  const refresh = useCallback(async () => {
    const version = ++versionRef.current;
    let lastSeen = lastSeenRef.current;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && !Number.isNaN(Date.parse(saved))) lastSeen = saved;
    } catch {
      // Keep the in-memory read marker when browser storage is unavailable.
    }
    lastSeenRef.current = lastSeen;
    const { count, error } = await supabase
      .from('requisitions')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', lastSeen);
    if (version !== versionRef.current) return;
    if (error) {
      console.error('[badge] refresh error:', error);
      return;
    }
    setNewCount(count ?? 0);
  }, []);

  const markSeen = useCallback(() => {
    versionRef.current += 1;
    lastSeenRef.current = new Date().toISOString();
    try {
      localStorage.setItem(STORAGE_KEY, lastSeenRef.current);
    } catch {
      // The marker still works for this mounted page.
    }
    setNewCount(0);
    window.dispatchEvent(new CustomEvent(SEEN_EVENT, { detail: lastSeenRef.current }));
  }, []);

  useEffect(() => {
    const clearSeen = (event: Event) => {
      versionRef.current += 1;
      lastSeenRef.current = (event as CustomEvent<string>).detail;
      setNewCount(0);
    };
    const syncStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) void refresh();
    };
    const refreshVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener(SEEN_EVENT, clearSeen);
    window.addEventListener('storage', syncStorage);
    window.addEventListener('focus', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    void refresh();

    const channel = supabase
      .channel(`new-requisitions-badge-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'requisitions' },
        () => { void refresh(); },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void refresh();
      });

    // Poll as a fallback when database Realtime is unavailable.
    const timer = setInterval(refreshVisible, POLL_INTERVAL_MS);
    return () => {
      versionRef.current += 1;
      void supabase.removeChannel(channel);
      clearInterval(timer);
      window.removeEventListener(SEEN_EVENT, clearSeen);
      window.removeEventListener('storage', syncStorage);
      window.removeEventListener('focus', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [refresh]);

  return { newCount, markSeen, refresh };
}