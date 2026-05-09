import { useEffect, useRef, useState } from "react";
import HistoryPanel from "./components/HistoryPanel";
import InputForm from "./components/InputForm";
import RouteSummary from "./components/RouteSummary";
import XYCanvas from "./components/XYCanvas";
import { useFleetStore } from "./store/store";

export default function App() {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [rightOpen, setRightOpen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const result = useFleetStore((s) => s.result);
  const stations = useFleetStore((s) => s.stations);
  const svgWrap = useRef<HTMLDivElement>(null);

  function exportJson() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.day_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPng() {
    const svg = svgWrap.current?.querySelector("svg");
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = svg.clientWidth || 720;
      canvas.height = svg.clientHeight || 540;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((b) => {
        if (!b) return;
        const u = URL.createObjectURL(b);
        const a = document.createElement("a");
        a.href = u;
        a.download = `${result?.day_id ?? "fleet"}.png`;
        a.click();
        URL.revokeObjectURL(u);
      });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === " " && result) {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShowHelp((v) => !v);
      } else if (e.key === "Escape") {
        setShowHelp(false);
        setRightOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [result]);

  const totalDemand = stations.reduce((s, st) => s + st.demand, 0);

  return (
    <div className="h-full flex flex-col">
      <header className="px-4 py-3 border-b border-slate-200 bg-white/70 backdrop-blur-md">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm shrink-0"
              style={{ background: "linear-gradient(135deg,#6366f1,#06b6d4)" }}
              aria-hidden="true"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 17h14M3 12a3 3 0 0 1 3-3h7l4 4v4h-2a2 2 0 1 1-4 0H10a2 2 0 1 1-4 0H3z" />
                <circle cx="9" cy="17" r="1.6" fill="currentColor" />
                <circle cx="16" cy="17" r="1.6" fill="currentColor" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold leading-tight truncate">Gas Fleet Routing</h1>
              <p className="text-xs text-slate-500 leading-tight truncate">
                Plan delivery routes with classical or quantum (QAOA) solvers
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="hidden md:flex items-center gap-2">
              <Stat label="Stations" value={String(stations.length)} />
              <Stat label="Demand" value={totalDemand.toLocaleString()} />
              <Stat
                label="Status"
                value={result ? (result.feasible ? "Feasible" : "Infeasible") : "Idle"}
                tone={result ? (result.feasible ? "success" : "danger") : "muted"}
              />
            </div>
            <button
              onClick={() => setShowHelp(true)}
              className="btn btn-ghost px-2 py-1.5"
              title="Keyboard shortcuts (?)"
              aria-label="Show keyboard shortcuts"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>
            </button>
            <button
              onClick={() => setRightOpen((v) => !v)}
              className="btn btn-secondary xl:hidden px-2.5 py-1.5"
              aria-label="Toggle results panel"
              title="Show solution & history"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
              <span className="hidden sm:inline text-xs">Results</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex gap-3 p-3 relative">
        <aside className="w-72 lg:w-80 shrink-0 card p-4 overflow-auto scroll-thin">
          <InputForm onSolved={() => setRefreshKey((k) => k + 1)} />
        </aside>

        <main ref={svgWrap} className="flex-1 min-w-0 card p-3 flex flex-col items-center gap-3 min-h-0">
          <XYCanvas playing={playing} animationSpeed={speed} />
          <div className="flex items-center gap-2 text-sm w-full">
            <button
              onClick={() => setPlaying((p) => !p)}
              disabled={!result}
              className="btn btn-secondary px-2"
              title={playing ? "Pause animation (Space)" : "Play animation (Space)"}
              aria-label={playing ? "Pause animation" : "Play animation"}
            >
              {playing ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z"/></svg>
              )}
            </button>
            <label className="flex items-center gap-2 text-slate-700 flex-1 min-w-0">
              <span className="text-xs text-slate-500 hidden sm:inline">Speed</span>
              <input
                type="range"
                min={0.25}
                max={4}
                step={0.25}
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="slider flex-1 min-w-0"
              />
              <span className="font-mono text-xs w-10 text-right text-slate-600">
                {speed.toFixed(2)}×
              </span>
            </label>
            <div className="h-5 w-px bg-slate-200" />
            <button
              disabled={!result}
              onClick={exportJson}
              className="btn btn-ghost px-2"
              title="Download solution as JSON"
              aria-label="Export JSON"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span className="text-xs">JSON</span>
            </button>
            <button
              disabled={stations.length === 0}
              onClick={exportPng}
              className="btn btn-ghost px-2"
              title="Download canvas as PNG"
              aria-label="Export PNG"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
              <span className="text-xs">PNG</span>
            </button>
          </div>
        </main>

        {/* Right panel: inline at xl+, drawer below */}
        <aside
          className={`
            card p-4 overflow-auto scroll-thin space-y-4
            xl:static xl:block xl:w-80 xl:shrink-0 xl:translate-x-0
            ${rightOpen
              ? "fixed top-0 right-0 bottom-0 z-40 w-80 max-w-[88vw] m-3 shadow-2xl"
              : "hidden xl:block"}
          `}
          style={{ transition: "transform 0.18s ease-out" }}
        >
          <div className="flex items-center justify-between xl:hidden -mt-1">
            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Results
            </div>
            <button
              onClick={() => setRightOpen(false)}
              className="p-1 rounded text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              aria-label="Close results panel"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
          <RouteSummary />
          <hr className="border-slate-200" />
          <HistoryPanel refreshKey={refreshKey} />
        </aside>

        {/* Backdrop for the drawer below xl */}
        {rightOpen && (
          <div
            className="xl:hidden fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-[1px]"
            onClick={() => setRightOpen(false)}
            aria-hidden="true"
          />
        )}
      </div>

      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "success" | "danger";
}) {
  const toneStyles =
    tone === "success"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : tone === "danger"
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <div className={`px-2.5 py-1 rounded-lg border ${toneStyles}`}>
      <span className="opacity-60 mr-1.5 text-[10px] uppercase tracking-wider">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/35 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]">
        <div className="flex items-start justify-between px-4 pt-3.5 pb-2 shrink-0">
          <div>
            <div className="text-sm font-semibold text-slate-900">Tips & shortcuts</div>
            <div className="text-xs text-slate-500 mt-0.5">Speed up your workflow.</div>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <div className="px-4 pb-4 space-y-3 text-sm text-slate-700 overflow-y-auto scroll-thin">
          <Section title="Solvers">
            <li className="text-[11px] text-slate-600 leading-snug pl-0.5">
              <span className="font-semibold text-slate-800">Classical</span> uses an OR-Tools heuristic — fast, deterministic, ideal as a baseline.
            </li>
            <li className="text-[11px] text-slate-600 leading-snug pl-0.5">
              <span className="font-semibold text-indigo-700">QAOA</span> is a quantum-inspired simulated solver. Tune <span className="font-mono">p</span> (depth), <span className="font-mono">shots</span>, and the optimizer in the QAOA settings panel. Use <span className="font-medium">Compare</span> in the Solution panel to A/B against classical.
            </li>
          </Section>
          <Section title="Canvas">
            <Row keyText="Click empty space" desc="Add a station" />
            <Row keyText="Click a station" desc="Edit its position or demand" />
            <Row keyText="Drag a station" desc="Move it" />
            <Row keyText="Right-click" desc="Delete (with undo)" />
            <Row keyText="Shift + drag" desc="Pan the view" />
            <Row keyText="Scroll wheel" desc="Zoom in / out" />
          </Section>
          <Section title="Keyboard">
            <Row keyText="Space" desc="Play / pause animation" />
            <Row keyText="Esc" desc="Close dialogs" />
            <Row keyText="?" desc="Toggle this help" />
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1.5">{title}</div>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}

function Row({ keyText, desc }: { keyText: string; desc: string }) {
  return (
    <li className="flex items-center gap-3">
      <kbd className="font-mono text-[11px] px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded shrink-0 min-w-[5.5rem] text-center">
        {keyText}
      </kbd>
      <span className="text-xs text-slate-600">{desc}</span>
    </li>
  );
}
