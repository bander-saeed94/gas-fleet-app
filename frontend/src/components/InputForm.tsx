import { useState } from "react";
import { solve } from "../api/client";
import { QAOA_OPTIMIZERS, useFleetStore } from "../store/store";
import ConfirmDialog from "./ConfirmDialog";

const SAMPLE_SCENARIOS: { label: string; description: string; stations: Array<{ x: number; y: number; demand: number }> }[] = [
  {
    label: "City grid (8 stations)",
    description: "Compact urban layout, balanced demand",
    stations: [
      { x: 3, y: 4, demand: 1200 },
      { x: -4, y: 2, demand: 900 },
      { x: 5, y: -3, demand: 1500 },
      { x: -3, y: -5, demand: 1100 },
      { x: 6, y: 6, demand: 800 },
      { x: -5, y: 5, demand: 1300 },
      { x: 2, y: -7, demand: 1000 },
      { x: -7, y: -2, demand: 1400 },
    ],
  },
  {
    label: "Highway corridor (6 stations)",
    description: "Mostly along the X-axis, light fleet test",
    stations: [
      { x: -8, y: 0.5, demand: 1500 },
      { x: -4, y: -0.4, demand: 1100 },
      { x: 4, y: 0.7, demand: 1300 },
      { x: 8, y: -0.6, demand: 1200 },
      { x: 12, y: 0.3, demand: 900 },
      { x: -12, y: -0.2, demand: 1400 },
    ],
  },
  {
    label: "Tight cluster (5 stations)",
    description: "Stress test for short routes",
    stations: [
      { x: 1.5, y: 1.5, demand: 800 },
      { x: 2.5, y: -1, demand: 1100 },
      { x: -1.5, y: 2, demand: 950 },
      { x: -2, y: -1.5, demand: 1300 },
      { x: 0.5, y: 3, demand: 1000 },
    ],
  },
];

export default function InputForm({ onSolved }: { onSolved?: () => void }) {
  const {
    numTrucks,
    truckCapacity,
    solver,
    stations,
    qaoaParams,
    setNumTrucks,
    setTruckCapacity,
    setSolver,
    setQaoaParams,
    setResult,
    clearStations,
    addStation,
  } = useFleetStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [showSamples, setShowSamples] = useState(false);
  const [showQaoaTuning, setShowQaoaTuning] = useState(false);

  const totalDemand = stations.reduce((s, st) => s + st.demand, 0);
  const fleetCapacity = numTrucks * truckCapacity;
  const utilization = fleetCapacity > 0 ? totalDemand / fleetCapacity : 0;
  const overCapacity = totalDemand > fleetCapacity;

  async function onSolve() {
    if (stations.length === 0) {
      setError("Add at least one station by clicking the canvas.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const resp = await solve({
        num_trucks: numTrucks,
        truck_capacity: truckCapacity,
        depot: [0, 0],
        stations,
        solver,
        qaoa_params: qaoaParams,
      });
      setResult(resp, solver === "qaoa" ? { ...qaoaParams } : null);
      onSolved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function onClear() {
    if (stations.length === 0) {
      clearStations();
      return;
    }
    setConfirmingClear(true);
  }

  function loadSample(idx: number) {
    clearStations();
    SAMPLE_SCENARIOS[idx].stations.forEach((s) => addStation(s.x, s.y, s.demand));
    setShowSamples(false);
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="label">Setup</div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowSamples((v) => !v)}
              className="btn btn-ghost px-2 py-1 text-xs"
              title="Load a sample scenario"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Load sample
            </button>
            {showSamples && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowSamples(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-white border border-slate-200 rounded-lg shadow-lg p-1">
                  {SAMPLE_SCENARIOS.map((s, i) => (
                    <button
                      key={s.label}
                      onClick={() => loadSample(i)}
                      className="w-full text-left px-2.5 py-2 rounded hover:bg-slate-50 group"
                    >
                      <div className="text-sm font-medium text-slate-900 group-hover:text-indigo-600">
                        {s.label}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {s.description}
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">
          Click the canvas to add a station, or load a sample scenario above.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Trucks" icon={<TruckIcon />}>
          <input
            type="number"
            min={1}
            value={numTrucks}
            onChange={(e) => setNumTrucks(Number(e.target.value))}
            className="input"
          />
        </Field>
        <Field label="Capacity (L)" icon={<DropletIcon />}>
          <input
            type="number"
            min={1}
            value={truckCapacity}
            onChange={(e) => setTruckCapacity(Number(e.target.value))}
            className="input"
          />
        </Field>
      </div>

      <div>
        <div className="label mb-1.5">Solver</div>
        <div className="grid grid-cols-2 gap-2">
          <SolverChip
            active={solver === "classical"}
            onClick={() => setSolver("classical")}
            title="Classical"
            subtitle="Heuristic / OR-Tools"
            accent="#0f172a"
          />
          <SolverChip
            active={solver === "qaoa"}
            onClick={() => setSolver("qaoa")}
            title="QAOA"
            subtitle="Quantum-inspired"
            accent="#6366f1"
          />
        </div>

        {solver === "qaoa" && (
          <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/40 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowQaoaTuning((v) => !v)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] text-indigo-700 hover:bg-indigo-50"
              aria-expanded={showQaoaTuning}
            >
              <span className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 17l6-6 4 4 8-8"/>
                  <path d="M14 7h7v7"/>
                </svg>
                QAOA settings
                <span className="font-mono text-indigo-500/70">
                  · p={qaoaParams.p} · {qaoaParams.shots} shots · {qaoaParams.optimizer}
                </span>
              </span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: showQaoaTuning ? "rotate(180deg)" : undefined }}>
                <path d="M6 9l6 6 6-6"/>
              </svg>
            </button>
            {showQaoaTuning && (
              <div className="px-2.5 pb-2.5 pt-1 space-y-2.5 bg-white border-t border-indigo-100">
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-0.5">
                    <span className="text-slate-600">
                      Depth <span className="font-mono text-indigo-600">p</span>
                    </span>
                    <span className="font-mono text-slate-700">{qaoaParams.p}</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={qaoaParams.p}
                    onChange={(e) => setQaoaParams({ p: Number(e.target.value) })}
                    className="slider w-full"
                    aria-label="QAOA circuit depth p"
                  />
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Higher = more circuit layers, slower but potentially better.
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-0.5">
                    <span className="text-slate-600">Shots per circuit</span>
                    <span className="font-mono text-slate-700">{qaoaParams.shots}</span>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {[256, 512, 1024, 2048, 4096].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setQaoaParams({ shots: n })}
                        className={`text-[10.5px] py-1 rounded border font-mono ${
                          qaoaParams.shots === n
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-600 mb-0.5">Optimizer</div>
                  <div className="grid grid-cols-2 gap-1">
                    {QAOA_OPTIMIZERS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setQaoaParams({ optimizer: opt })}
                        className={`text-[10.5px] py-1 rounded border font-mono ${
                          qaoaParams.optimizer === opt
                            ? "bg-indigo-600 text-white border-indigo-600"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
                {/* QNN-VQC enhancements */}
                <div className="pt-1.5 mt-1.5 border-t border-indigo-100">
                  <div className="text-[10.5px] uppercase tracking-wide text-indigo-700/80 font-medium mb-1">
                    QNN-VQC enhancements
                  </div>
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={qaoaParams.reupload ?? false}
                        onChange={(e) => setQaoaParams({ reupload: e.target.checked })}
                        className="rounded border-slate-300"
                      />
                      <span>
                        Data re-uploading (multi-angle / ma-QAOA){" "}
                        <span className="text-slate-400">— per-term <span className="font-mono">w·γ + b</span></span>
                      </span>
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(qaoaParams.observable_mode ?? "fixed") === "trainable"}
                        onChange={(e) =>
                          setQaoaParams({ observable_mode: e.target.checked ? "trainable" : "fixed" })
                        }
                        className="rounded border-slate-300"
                      />
                      <span>
                        Trainable observable weights{" "}
                        <span className="text-slate-400">— per-term <span className="font-mono">α<sub>t</sub></span></span>
                      </span>
                    </label>
                    <label className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={qaoaParams.normalize_weights ?? false}
                        onChange={(e) => setQaoaParams({ normalize_weights: e.target.checked })}
                        className="rounded border-slate-300"
                      />
                      <span>
                        Normalize cost weights{" "}
                        <span className="text-slate-400">— divide by max <span className="font-mono">|c<sub>t</sub>|</span></span>
                      </span>
                    </label>
                  </div>
                  {qaoaParams.optimizer === "adam_pshift" && (
                    <div className="grid grid-cols-3 gap-1.5 mt-2 text-[11px]">
                      <label className="space-y-0.5">
                        <span className="text-slate-600">lr</span>
                        <input
                          type="number"
                          step={0.01}
                          min={0.001}
                          value={qaoaParams.adam_lr ?? 0.1}
                          onChange={(e) => setQaoaParams({ adam_lr: Number(e.target.value) })}
                          className="w-full font-mono px-1.5 py-0.5 rounded border border-slate-200"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-slate-600">epochs</span>
                        <input
                          type="number"
                          step={10}
                          min={1}
                          value={qaoaParams.adam_epochs ?? 100}
                          onChange={(e) => setQaoaParams({ adam_epochs: Number(e.target.value) })}
                          className="w-full font-mono px-1.5 py-0.5 rounded border border-slate-200"
                        />
                      </label>
                      <label className="space-y-0.5">
                        <span className="text-slate-600">shift</span>
                        <input
                          type="number"
                          step={0.01}
                          min={0.001}
                          value={qaoaParams.adam_pshift_step ?? 0.1}
                          onChange={(e) => setQaoaParams({ adam_pshift_step: Number(e.target.value) })}
                          className="w-full font-mono px-1.5 py-0.5 rounded border border-slate-200"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">
            Demand vs. fleet capacity
          </span>
          <span className={`font-mono ${overCapacity ? "text-rose-600" : "text-slate-700"}`}>
            {totalDemand.toLocaleString()} / {fleetCapacity.toLocaleString()}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              overCapacity ? "bg-rose-500" : utilization > 0.85 ? "bg-amber-500" : "bg-emerald-500"
            }`}
            style={{ width: `${Math.min(utilization, 1) * 100}%` }}
          />
        </div>
        {overCapacity && (
          <div className="flex items-center gap-2 text-[11px] text-rose-600">
            <span className="flex-1 leading-snug">
              Demand exceeds fleet capacity by{" "}
              <span className="font-mono font-semibold">
                {(totalDemand - fleetCapacity).toLocaleString()}
              </span>
              .
            </span>
            <button
              type="button"
              onClick={() => {
                const needed = Math.ceil(totalDemand / Math.max(1, truckCapacity));
                setNumTrucks(needed);
              }}
              className="text-[11px] font-medium text-rose-700 hover:text-rose-900 underline underline-offset-2 decoration-rose-300 hover:decoration-rose-500 whitespace-nowrap"
              title={`Set trucks to ${Math.ceil(totalDemand / Math.max(1, truckCapacity))} so the fleet covers demand`}
            >
              Auto-fix trucks
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">{stations.length} station(s) placed</span>
        {stations.length > 0 && !busy && (
          overCapacity ? (
            <span className="text-amber-700 inline-flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 9v4M12 17h.01"/>
                <path d="M10.3 3.86l-7.35 12.7A2 2 0 0 0 4.66 19.5h14.68a2 2 0 0 0 1.71-2.94l-7.34-12.7a2 2 0 0 0-3.42 0z"/>
              </svg>
              Capacity short
            </span>
          ) : (
            <span className="text-slate-400">Ready to solve</span>
          )
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onSolve}
          disabled={busy || stations.length === 0}
          className={`btn flex-1 ${overCapacity ? "btn-warning" : "btn-primary"}`}
          title={overCapacity ? "Will return infeasible — fleet can't cover demand" : undefined}
        >
          {busy ? (
            <>
              <span className="w-2 h-2 rounded-full bg-white dot-pulse" />
              {solver === "qaoa" ? "Running QAOA…" : "Solving…"}
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              Solve
            </>
          )}
        </button>
        <button onClick={onClear} className="btn btn-secondary" title="Remove all stations">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          Clear
        </button>
      </div>

      {error && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 flex items-start gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <div className="leading-snug">
            <div className="font-semibold">Solve failed</div>
            <div>{error}</div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmingClear}
        title="Clear all stations?"
        message={
          <>This removes {stations.length} station{stations.length === 1 ? "" : "s"} and the current solution. This cannot be undone.</>
        }
        confirmLabel="Clear all"
        cancelLabel="Keep them"
        tone="danger"
        onConfirm={() => {
          clearStations();
          setConfirmingClear(false);
        }}
        onCancel={() => setConfirmingClear(false)}
      />
    </div>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center gap-1.5 mb-1 text-slate-600">
        {icon && <span className="text-slate-400">{icon}</span>}
        <span className="text-xs font-medium">{label}</span>
      </div>
      {children}
    </label>
  );
}

function SolverChip({
  active,
  onClick,
  title,
  subtitle,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-lg border px-2.5 py-2 transition-all ${
        active
          ? "text-white shadow-sm"
          : "bg-white border-slate-200 hover:border-slate-300 text-slate-700"
      }`}
      style={
        active
          ? { background: accent, borderColor: accent }
          : undefined
      }
    >
      <div className="text-sm font-semibold leading-tight">{title}</div>
      <div className={`text-[10.5px] leading-tight mt-0.5 ${active ? "opacity-80" : "text-slate-500"}`}>
        {subtitle}
      </div>
    </button>
  );
}

function TruckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 17h2M5 17V7a1 1 0 0 1 1-1h9v11M15 11h4l2 3v3h-2"/>
      <circle cx="8" cy="17.5" r="1.5"/>
      <circle cx="18" cy="17.5" r="1.5"/>
    </svg>
  );
}

function DropletIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.5l5.5 7.5a6.5 6.5 0 1 1-11 0z"/>
    </svg>
  );
}
