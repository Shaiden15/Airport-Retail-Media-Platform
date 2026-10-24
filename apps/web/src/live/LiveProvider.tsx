import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ClockState, DecisionSummary, FlightSummary, Kpis, RedemptionEvent, ZoneSummary } from '../api/types.ts';

type Listener<T> = (data: T) => void;

interface Events {
  decision: DecisionSummary[];
  redemption: RedemptionEvent[];
  flight: (FlightSummary & { event: string; previousGate: string | null })[];
  inject: { type: string; simTime: string; latencyMs: number; affectedScreens: number };
  screen: { screenId: string; status: string; simTime: string };
  incident: { id: string; status: string; severity: string; title: string };
}

interface LiveState {
  connected: boolean;
  clock: ClockState | null;
  kpis: Kpis | null;
  presence: ZoneSummary[] | null;
  feed: unknown;
  subscribe: <K extends keyof Events>(topic: K, listener: Listener<Events[K]>) => () => void;
}

const LiveContext = createContext<LiveState | null>(null);

// One shared SSE connection for the whole app; the browser reconnects automatically if it drops
export function LiveProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [clock, setClock] = useState<ClockState | null>(null);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [presence, setPresence] = useState<ZoneSummary[] | null>(null);
  const [feed, setFeed] = useState<unknown>(null);
  const listeners = useRef(new Map<keyof Events, Set<Listener<never>>>());

  useEffect(() => {
    const source = new EventSource('/api/stream');
    const parse = (e: MessageEvent<string>): unknown => JSON.parse(e.data);
    const emit = (topic: keyof Events) => (e: MessageEvent<string>) => {
      const data = parse(e);
      for (const fn of listeners.current.get(topic) ?? []) (fn as Listener<unknown>)(data);
    };
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener('clock', (e) => setClock(parse(e) as ClockState));
    source.addEventListener('kpi', (e) => setKpis(parse(e) as Kpis));
    source.addEventListener('presence', (e) => setPresence(parse(e) as ZoneSummary[]));
    source.addEventListener('feed', (e) => setFeed(parse(e)));
    for (const topic of ['decision', 'redemption', 'flight', 'inject', 'screen', 'incident'] as const) source.addEventListener(topic, emit(topic));
    return () => source.close();
  }, []);

  const subscribe = useCallback<LiveState['subscribe']>((topic, listener) => {
    const set = listeners.current.get(topic) ?? new Set();
    set.add(listener as Listener<never>);
    listeners.current.set(topic, set);
    return () => {
      set.delete(listener as Listener<never>);
    };
  }, []);

  const value = useMemo(() => ({ connected, clock, kpis, presence, feed, subscribe }), [connected, clock, kpis, presence, feed, subscribe]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveState {
  const ctx = useContext(LiveContext);
  if (!ctx) throw new Error('useLive must be used inside LiveProvider');
  return ctx;
}

export function useLiveEvent<K extends keyof Events>(topic: K, listener: Listener<Events[K]>): void {
  const { subscribe } = useLive();
  const latest = useRef(listener);
  useEffect(() => {
    latest.current = listener;
  });
  useEffect(() => subscribe(topic, (data) => latest.current(data)), [subscribe, topic]);
}
