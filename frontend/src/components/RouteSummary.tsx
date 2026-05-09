import { useState } from "react";
import { solve } from "../api/client";
import { truckColor, useFleetStore } from "../store/store";

export default function RouteSummary() {
  const {
    result,
    visibleTrucks,
    toggleTruckVisible,
    showAllTrucks,
    truckCapacity,
    numTrucks,
    stations,
    qaoaParams,
    lastQaoaParams,
    comparisonResult,
    setComparisonResult,
  } = useFleetStore((s) => ({
    result: s.result,
    visibleTrucks: s.visibleTrucks,
    toggleTruckVisible: s.toggleTruckVisible,
    showAllTrucks: s.showAllTrucks,
    truckCapacity: s.truckCapacity,
    numTrucks: s.numTrucks,
    stations: s.stations,
    qaoaParams: s.qaoaParams,
    lastQaoaParams: s.lastQaoaParams,
    comparisonResult: s.comparisonResult,
    setComparisonResult: s.setComparisonResult,
  }));
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  if (!result) {
    return (
      <div className="space-y-2">
        <div className="label">Solution</div>
        <div className="text-sm text-slate-500 bg-slate-50 border border-dashed border-slate-200 rounded-lg p-3 text-center">
          No solution yet — click <span className="font-medium text-slate-700">Solve</span>.
        </div>
      </div>
    );
  }

  const allVisible = result.routes.every((r) => visibleTrucks.has(r.truck_id));
  const noneVisible = result.routes.every((r) => !visibleTrucks.has(r.truck_id));
  const otherSolver = result.solver === "qaoa" ? "classical" : "qaoa";

  async function runComparison() {
    setComparing(true);
    setCompareError(null);
    try {
      const resp = await solve({
        num_trucks: numTrucks,
        truck_capacity: truckCapacity,
        depot: [0, 0],
        stations,
        solver: otherSolver,
        qaoa_params: qaoaParams,
      });
      setComparisonResult(resp);
    } catch (e) {
      setCompareError(e instanceof Error ? e.message : String(e));
    } finally {
      setComparing(false);
    }
  }

  function toggleAll() {
    if (allVisible) {
      // Hide all by toggling each visible
      result!.routes.forEach((r) => {
        if (visibleTrucks.has(r.truck_id)) toggleTruckVisible(r.truck_id);
      });
    } else {
      showAllTrucks();
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="label">Solution</div>
          <div className="font-mono text-xs text-slate-500 mt-0.5">{result.day_id}</div>
        </div>
        <span
          className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${
            result.feasible
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-rose-50 text-rose-700 border border-rose-200"
          }`}
        >
          {result.feasible ? "Feasible" : "Infeasible"}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Distance" value={result.total_distance.toFixed(2)} />
        <Kpi label="Solver" value={result.solver} />
        <Kpi label="Solve" value={`${result.solve_time_ms} ms`} />
      </div>

      {result.meta?.qaoa_fallback && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-2 py-1.5 flex items-start gap-1.5 text-[11px] text-amber-900">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 flex-shrink-0">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span>
            QAOA unavailable — solved classically.{" "}
            <span className="text-amber-700">
              ({result.meta.qaoa_fallback === "library_unavailable"
                ? "qaoa-repo not installed"
                : result.meta.qaoa_fallback})
            </span>
          </span>
        </div>
      )}

      {!!result.meta?.dropped_routes && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-2 py-1.5 flex items-start gap-1.5 text-[11px] text-rose-900">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 flex-shrink-0">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>
            {result.meta.dropped_routes} route
            {result.meta.dropped_routes === 1 ? "" : "s"} dropped — fleet
            capacity is too small to serve every station. Add a truck or
            increase capacity.
          </span>
        </div>
      )}

      {result.solver === "qaoa" && lastQaoaParams && (
        <div className="rounded-lg bg-indigo-50/50 border border-indigo-100 px-2 py-1.5 text-[10.5px] text-indigo-800">
          <div className="flex items-center gap-1.5 flex-wrap">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 17l6-6 4 4 8-8"/>
              <path d="M14 7h7v7"/>
            </svg>
            <span className="font-mono">p={lastQaoaParams.p}</span>
            <span className="text-indigo-300">·</span>
            <span className="font-mono">{lastQaoaParams.shots} shots</span>
            <span className="text-indigo-300">·</span>
            <span className="font-mono">{lastQaoaParams.optimizer}</span>
          </div>
          {(lastQaoaParams.reupload ||
            lastQaoaParams.observable_mode === "trainable" ||
            lastQaoaParams.normalize_weights) && (
            <div className="mt-1 flex flex-wrap gap-1">
              {lastQaoaParams.reupload && (
                <span
                  className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-mono text-[10px]"
                  title="Multi-angle / data re-uploading enabled"
                >
                  re-upload
                </span>
              )}
              {lastQaoaParams.observable_mode === "trainable" && (
                <span
                  className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-mono text-[10px]"
                  title="Trainable per-term observable weights α_t"
                >
                  trainable α
                </span>
              )}
              {lastQaoaParams.normalize_weights && (
                <span
                  className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-mono text-[10px]"
                  title="Cost weights normalized by max |c_t|"
                >
                  norm-weights
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 pt-0.5">
        {comparisonResult ? (
          <button
            onClick={() => setComparisonResult(null)}
            className="btn btn-ghost px-2 py-1 text-[11px] text-slate-500"
            title="Hide comparison"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            Hide compare
          </button>
        ) : (
          <button
            onClick={runComparison}
            disabled={comparing}
            className="btn btn-ghost px-2 py-1 text-[11px] text-indigo-700 bg-indigo-50/40"
            title={`Re-solve the same scenario with the ${otherSolver} solver`}
          >
            {comparing ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 dot-pulse" />
                Comparing…
              </>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 7l-3 3 3 3"/><path d="M4 10h16"/><path d="M17 17l3-3-3-3"/></svg>
                Compare with {otherSolver}
              </>
            )}
          </button>
        )}
      </div>

      {compareError && (
        <div className="text-[11px] text-rose-700 bg-rose-50 border border-rose-200 rounded p-1.5">
          {compareError}
        </div>
      )}

      {comparisonResult && (
        <ComparePanel
          base={result}
          other={comparisonResult}
          otherSolver={otherSolver}
        />
      )}

      <div className="flex items-center justify-between pt-1">
        <span className="label">Trucks</span>
        <button
          onClick={toggleAll}
          className="text-[11px] text-slate-500 hover:text-slate-700"
        >
          {allVisible ? "Hide all" : noneVisible ? "Show all" : "Show all"}
        </button>
      </div>

      <ul className="space-y-1.5">
        {result.routes.map((r) => {
          const visible = visibleTrucks.has(r.truck_id);
          const stops = Math.max(0, r.sequence.length - 2);
          const utilPct = truckCapacity > 0 ? Math.min(1, r.load / truckCapacity) : 0;
          return (
            <li
              key={r.truck_id}
              className={`group rounded-lg border px-2 py-1.5 transition-colors ${
                visible
                  ? "border-slate-200 bg-white hover:bg-slate-50"
                  : "border-slate-200 bg-slate-50 opacity-70"
              }`}
            >
              <button
                onClick={() => toggleTruckVisible(r.truck_id)}
                className="flex items-center gap-2 w-full text-left"
                aria-pressed={visible}
                aria-label={`Toggle truck ${r.truck_id}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{
                    background: truckColor(r.truck_id),
                    opacity: visible ? 1 : 0.3,
                  }}
                />
                <span className="font-mono text-xs font-semibold text-slate-700">
                  T{r.truck_id}
                </span>
                <span className="text-[11px] text-slate-500 flex-1">
                  {stops} stop{stops === 1 ? "" : "s"} · {r.distance.toFixed(2)}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`text-slate-400 ${visible ? "" : "opacity-50"}`}
                >
                  {visible ? (
                    <>
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                      <circle cx="12" cy="12" r="3" />
                    </>
                  ) : (
                    <>
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-6.5 0-10-7-10-7a18 18 0 0 1 4.06-5.19" />
                      <path d="M9.9 4.24A9 9 0 0 1 12 4c6.5 0 10 7 10 7a18 18 0 0 1-2.06 3.19" />
                      <line x1="2" y1="2" x2="22" y2="22" />
                    </>
                  )}
                </svg>
              </button>
              <div className="mt-1.5 flex items-center gap-1.5">
                <div className="flex-1 h-1 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${utilPct * 100}%`,
                      background: truckColor(r.truck_id),
                      opacity: visible ? 0.8 : 0.4,
                    }}
                  />
                </div>
                <span className="font-mono text-[10px] text-slate-500 w-14 text-right">
                  {r.load.toFixed(0)}/{truckCapacity}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">
        {label}
      </div>
      <div className="font-mono text-xs font-semibold text-slate-800 truncate" title={value}>
        {value}
      </div>
    </div>
  );
}

function ComparePanel({
  base,
  other,
  otherSolver,
}: {
  base: { total_distance: number; solve_time_ms: number; feasible: boolean; solver: string };
  other: { total_distance: number; solve_time_ms: number; feasible: boolean; solver: string };
  otherSolver: string;
}) {
  const distDelta = other.total_distance - base.total_distance;
  const timeDelta = other.solve_time_ms - base.solve_time_ms;
  const better =
    other.feasible && base.feasible
      ? distDelta < -0.001
        ? "other"
        : distDelta > 0.001
        ? "base"
        : "tie"
      : other.feasible && !base.feasible
      ? "other"
      : !other.feasible && base.feasible
      ? "base"
      : "tie";
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
          {otherSolver} (compare)
        </span>
        <span
          className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${
            other.feasible
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-rose-50 text-rose-700 border border-rose-200"
          }`}
        >
          {other.feasible ? "Feasible" : "Infeasible"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <CompareRow
          label="Distance"
          baseVal={base.total_distance.toFixed(2)}
          otherVal={other.total_distance.toFixed(2)}
          delta={distDelta}
          fmt={(v) => (v >= 0 ? "+" : "") + v.toFixed(2)}
          // for distance: lower is better
          sense="lower-better"
        />
        <CompareRow
          label="Time"
          baseVal={`${base.solve_time_ms} ms`}
          otherVal={`${other.solve_time_ms} ms`}
          delta={timeDelta}
          fmt={(v) => (v >= 0 ? "+" : "") + v + " ms"}
          sense="lower-better"
        />
      </div>
      <div className="text-[10px] text-slate-500">
        {better === "other"
          ? `${otherSolver} found a ${distDelta < 0 ? "shorter" : "feasible"} solution.`
          : better === "base"
          ? `${base.solver} is ${distDelta > 0 ? "shorter" : "feasible"}.`
          : "Both solutions are equivalent."}
      </div>
    </div>
  );
}

function CompareRow({
  label,
  baseVal,
  otherVal,
  delta,
  fmt,
  sense,
}: {
  label: string;
  baseVal: string;
  otherVal: string;
  delta: number;
  fmt: (n: number) => string;
  sense: "lower-better" | "higher-better";
}) {
  const isBetter =
    sense === "lower-better" ? delta < -0.001 : delta > 0.001;
  const isWorse =
    sense === "lower-better" ? delta > 0.001 : delta < -0.001;
  const tone = isBetter
    ? "text-emerald-700"
    : isWorse
    ? "text-rose-700"
    : "text-slate-500";
  return (
    <div className="rounded bg-white border border-slate-200 px-1.5 py-1">
      <div className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold">
        {label}
      </div>
      <div className="font-mono font-semibold text-slate-800">
        {otherVal}
      </div>
      <div className={`font-mono text-[10px] ${tone}`}>
        Δ {fmt(delta)} <span className="text-slate-400">vs {baseVal}</span>
      </div>
    </div>
  );
}
