import { useEffect, useState } from "react";
import { deleteDay, getDay, listDays } from "../api/client";
import { useFleetStore } from "../store/store";
import type { DaySummary } from "../types";
import ConfirmDialog from "./ConfirmDialog";

export default function HistoryPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [days, setDays] = useState<DaySummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const setResult = useFleetStore((s) => s.setResult);
  const clearStations = useFleetStore((s) => s.clearStations);
  const addStation = useFleetStore((s) => s.addStation);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setDays(await listDays());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [refreshKey]);

  async function open(id: string) {
    try {
      const detail = await getDay(id);
      clearStations();
      detail.request.stations.forEach((s) => addStation(s.x, s.y, s.demand));
      setResult(detail.response);
      setLoadedId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function askRemove(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setConfirmingDeleteId(id);
  }

  async function confirmRemove() {
    const id = confirmingDeleteId;
    if (!id) return;
    setConfirmingDeleteId(null);
    try {
      await deleteDay(id);
      if (loadedId === id) {
        setResult(null);
        setLoadedId(null);
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <div className="label">History</div>
        <button
          onClick={refresh}
          className="btn btn-ghost px-2 py-1 text-xs"
          title="Refresh history"
          disabled={loading}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={loading ? "animate-spin" : ""}
          >
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          Refresh
        </button>
      </div>

      {error && (
        <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 text-xs">
          {error}
        </div>
      )}

      {!error && days.length === 0 && (
        <div className="text-slate-500 text-xs bg-slate-50 border border-dashed border-slate-200 rounded-lg p-3 text-center">
          {loading ? "Loading…" : "No past solves yet."}
        </div>
      )}

      <ul className="space-y-1.5 max-h-72 overflow-auto scroll-thin -mx-1 px-1">
        {days.map((d) => {
          const isActive = loadedId === d.id;
          return (
            <li
              key={d.id}
              onClick={() => open(d.id)}
              className={`group cursor-pointer rounded-lg border px-2.5 py-2 transition-colors ${
                isActive
                  ? "border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-200"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${
                        d.solver === "qaoa"
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {d.solver}
                    </span>
                    <span className="text-[10.5px] text-slate-500" title={d.created_at}>
                      {timeAgo(d.created_at)}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-700 mt-1 truncate">
                    {d.id}
                  </div>
                  <div className="text-[10.5px] text-slate-500 mt-0.5">
                    {d.num_trucks} trucks · {d.total_distance.toFixed(1)} dist · {d.solve_time_ms}ms
                  </div>
                </div>
                <button
                  onClick={(e) => askRemove(d.id, e)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity btn-danger-ghost rounded p-1"
                  title={`Delete ${d.id}`}
                  aria-label={`Delete ${d.id}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
                  </svg>
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <ConfirmDialog
        open={confirmingDeleteId !== null}
        title="Delete this solve?"
        message={
          <>
            Day <span className="font-mono">{confirmingDeleteId}</span> will be removed from history. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        tone="danger"
        onConfirm={confirmRemove}
        onCancel={() => setConfirmingDeleteId(null)}
      />
    </div>
  );
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diffSec = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (diffSec < 45) return "just now";
  if (diffSec < 90) return "1 min ago";
  const diffMin = diffSec / 60;
  if (diffMin < 45) return `${Math.round(diffMin)} min ago`;
  if (diffMin < 90) return "1 hour ago";
  const diffHr = diffMin / 60;
  if (diffHr < 24) return `${Math.round(diffHr)} hours ago`;
  const diffDay = diffHr / 24;
  if (diffDay < 7) return `${Math.round(diffDay)} days ago`;
  return d.toLocaleDateString();
}
