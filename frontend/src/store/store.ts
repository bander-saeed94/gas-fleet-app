import { create } from "zustand";
import type { SolveResponse, StationIn } from "../types";

export type QaoaParams = {
  p: number;
  shots: number;
  optimizer: string;
  // QNN-VQC enhancements (Add-QNN-Enhancements-Prompt.md)
  reupload?: boolean;
  observable_mode?: "fixed" | "trainable";
  normalize_weights?: boolean;
  adam_lr?: number;
  adam_epochs?: number;
  adam_pshift_step?: number;
};
export const QAOA_OPTIMIZERS = [
  "COBYLA",
  "SPSA",
  "NELDER_MEAD",
  "adam_pshift",
] as const;

type State = {
  numTrucks: number;
  truckCapacity: number;
  solver: "classical" | "qaoa";
  stations: StationIn[];
  nextId: number;
  result: SolveResponse | null;
  visibleTrucks: Set<number>;
  qaoaParams: QaoaParams;
  /** Snapshot of QAOA params used when result was produced (null if classical or no result). */
  lastQaoaParams: QaoaParams | null;
  /** Result of the alternate solver run for comparison. */
  comparisonResult: SolveResponse | null;
  setNumTrucks: (n: number) => void;
  setTruckCapacity: (q: number) => void;
  setSolver: (s: "classical" | "qaoa") => void;
  setQaoaParams: (patch: Partial<QaoaParams>) => void;
  addStation: (x: number, y: number, demand: number) => void;
  updateStation: (id: number, patch: Partial<StationIn>) => void;
  removeStation: (id: number) => void;
  clearStations: () => void;
  setResult: (r: SolveResponse | null, qaoaSnapshot?: QaoaParams | null) => void;
  setComparisonResult: (r: SolveResponse | null) => void;
  toggleTruckVisible: (truckId: number) => void;
  showAllTrucks: () => void;
};

export const useFleetStore = create<State>((set) => ({
  numTrucks: 3,
  truckCapacity: 5000,
  solver: "classical",
  stations: [],
  nextId: 1,
  result: null,
  visibleTrucks: new Set(),
  qaoaParams: {
    p: 2,
    shots: 1024,
    optimizer: "COBYLA",
    reupload: false,
    observable_mode: "fixed",
    normalize_weights: false,
    adam_lr: 0.1,
    adam_epochs: 100,
    adam_pshift_step: 0.1,
  },
  lastQaoaParams: null,
  comparisonResult: null,
  setNumTrucks: (n) => set({ numTrucks: Math.max(1, Math.floor(n)) }),
  setTruckCapacity: (q) => set({ truckCapacity: Math.max(1, q) }),
  setSolver: (s) => set({ solver: s }),
  setQaoaParams: (patch) => set((s) => ({ qaoaParams: { ...s.qaoaParams, ...patch } })),
  addStation: (x, y, demand) =>
    set((s) => ({
      stations: [...s.stations, { id: s.nextId, x, y, demand }],
      nextId: s.nextId + 1,
    })),
  updateStation: (id, patch) =>
    set((s) => ({
      stations: s.stations.map((st) => (st.id === id ? { ...st, ...patch } : st)),
    })),
  removeStation: (id) =>
    set((s) => ({ stations: s.stations.filter((st) => st.id !== id) })),
  clearStations: () => set({ stations: [], nextId: 1, result: null, comparisonResult: null, lastQaoaParams: null }),
  setResult: (r, qaoaSnapshot) =>
    set({
      result: r,
      visibleTrucks: new Set(r ? r.routes.map((rt) => rt.truck_id) : []),
      lastQaoaParams: qaoaSnapshot ?? null,
      comparisonResult: null,
    }),
  setComparisonResult: (r) => set({ comparisonResult: r }),
  toggleTruckVisible: (truckId) =>
    set((s) => {
      const next = new Set(s.visibleTrucks);
      if (next.has(truckId)) next.delete(truckId);
      else next.add(truckId);
      return { visibleTrucks: next };
    }),
  showAllTrucks: () =>
    set((s) => ({
      visibleTrucks: new Set(s.result ? s.result.routes.map((r) => r.truck_id) : []),
    })),
}));

export const TRUCK_PALETTE = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#a855f7", "#84cc16", "#f43f5e",
];

export function truckColor(truckId: number): string {
  return TRUCK_PALETTE[truckId % TRUCK_PALETTE.length];
}
