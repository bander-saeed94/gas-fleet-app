import { useEffect, useMemo, useRef, useState } from "react";
import { truckColor, useFleetStore } from "../store/store";
import type { StationIn, StationOut } from "../types";
import StationDialog, { type StationDialogValue } from "./StationDialog";

type Pt = { x: number; y: number };

type Props = {
  width?: number;
  height?: number;
  readOnly?: boolean;
  animationSpeed?: number;
  playing?: boolean;
  /** When true, canvas fills the parent width and adopts a 4:3 aspect ratio. */
  responsive?: boolean;
};

function fitBounds(pts: Pt[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  if (xs.length === 0) return { minX: -10, minY: -10, maxX: 10, maxY: 10 };
  return {
    minX: Math.min(...xs, 0),
    minY: Math.min(...ys, 0),
    maxX: Math.max(...xs, 0),
    maxY: Math.max(...ys, 0),
  };
}

// Pick a "nice" tick step for the given data range.
function niceStep(range: number, target: number): number {
  if (range <= 0) return 1;
  const raw = range / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}

export default function XYCanvas({
  width: widthProp,
  height: heightProp,
  readOnly = false,
  animationSpeed = 1,
  playing = false,
  responsive = true,
}: Props) {
  const stations = useFleetStore((s) => s.stations);
  const result = useFleetStore((s) => s.result);
  const visibleTrucks = useFleetStore((s) => s.visibleTrucks);
  const addStation = useFleetStore((s) => s.addStation);
  const updateStation = useFleetStore((s) => s.updateStation);
  const removeStation = useFleetStore((s) => s.removeStation);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [containerW, setContainerW] = useState(widthProp ?? 720);

  useEffect(() => {
    if (!responsive || !wrapRef.current) return;
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => {
      const w = Math.max(280, Math.floor(el.clientWidth));
      setContainerW(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [responsive]);

  const width = responsive ? containerW : widthProp ?? 720;
  const height = heightProp ?? Math.max(360, Math.round(width * 0.66));
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pt>({ x: 0, y: 0 });
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [didDrag, setDidDrag] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [t, setT] = useState(0); // 0..1 along each route
  const [dialog, setDialog] = useState<
    | { mode: "add"; x: number; y: number; demand: number }
    | { mode: "edit"; id: number; x: number; y: number; demand: number }
    | null
  >(null);
  const [recentlyDeleted, setRecentlyDeleted] = useState<StationIn | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  const rawBounds = useMemo(() => fitBounds([{ x: 0, y: 0 }, ...stations]), [stations]);
  // Ensure a sensible viewport when there are 0–1 points: expand around depot.
  const bounds = useMemo(() => {
    const w = rawBounds.maxX - rawBounds.minX;
    const h = rawBounds.maxY - rawBounds.minY;
    const minSpan = 20;
    let { minX, minY, maxX, maxY } = rawBounds;
    if (w < minSpan) {
      const cx = (minX + maxX) / 2;
      minX = cx - minSpan / 2;
      maxX = cx + minSpan / 2;
    }
    if (h < minSpan) {
      const cy = (minY + maxY) / 2;
      minY = cy - minSpan / 2;
      maxY = cy + minSpan / 2;
    }
    return { minX, minY, maxX, maxY };
  }, [rawBounds]);
  const pad = 32;
  const dataW = Math.max(bounds.maxX - bounds.minX, 1);
  const dataH = Math.max(bounds.maxY - bounds.minY, 1);
  const scale =
    Math.min((width - 2 * pad) / dataW, (height - 2 * pad) / dataH) * zoom;

  function dataToScreen(p: Pt): Pt {
    return {
      x: pad + (p.x - bounds.minX) * scale + pan.x,
      y: height - pad - (p.y - bounds.minY) * scale + pan.y,
    };
  }

  function screenToData(sx: number, sy: number): Pt {
    return {
      x: (sx - pad - pan.x) / scale + bounds.minX,
      y: (height - pad - sy + pan.y) / scale + bounds.minY,
    };
  }

  function onClickBackground(e: React.MouseEvent<SVGSVGElement>) {
    if (readOnly) return;
    if ((e.target as Element).getAttribute("data-bg") !== "1") return;
    const rect = svgRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const p = screenToData(sx, sy);
    setDialog({ mode: "add", x: p.x, y: p.y, demand: 1000 });
  }

  function softDelete(id: number) {
    const victim = stations.find((s) => s.id === id);
    if (!victim) return;
    removeStation(id);
    setRecentlyDeleted(victim);
    if (undoTimerRef.current) window.clearTimeout(undoTimerRef.current);
    undoTimerRef.current = window.setTimeout(() => {
      setRecentlyDeleted(null);
      undoTimerRef.current = null;
    }, 5000);
  }

  function undoDelete() {
    if (!recentlyDeleted) return;
    addStation(recentlyDeleted.x, recentlyDeleted.y, recentlyDeleted.demand);
    setRecentlyDeleted(null);
    if (undoTimerRef.current) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }

  function onWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    setZoom((z) => Math.max(0.2, Math.min(8, z * (e.deltaY < 0 ? 1.1 : 0.9))));
  }

  const panRef = useRef<{ active: boolean; sx: number; sy: number; px: number; py: number }>({
    active: false, sx: 0, sy: 0, px: 0, py: 0,
  });
  function onMouseDownBg(e: React.MouseEvent) {
    if ((e.target as Element).getAttribute("data-bg") !== "1") return;
    if (e.button !== 1 && !e.shiftKey) return;
    panRef.current = { active: true, sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
  }
  useEffect(() => {
    function up() { panRef.current.active = false; setDraggingId(null); }
    function move(e: MouseEvent) {
      if (panRef.current.active) {
        setPan({
          x: panRef.current.px + (e.clientX - panRef.current.sx),
          y: panRef.current.py + (e.clientY - panRef.current.sy),
        });
      }
      if (draggingId !== null && svgRef.current) {
        const rect = svgRef.current.getBoundingClientRect();
        const p = screenToData(e.clientX - rect.left, e.clientY - rect.top);
        updateStation(draggingId, { x: p.x, y: p.y });
        setDidDrag(true);
      }
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [draggingId, scale, pan, bounds, updateStation]);

  useEffect(() => {
    if (!playing || !result) return;
    let raf = 0;
    let last = performance.now();
    function tick(now: number) {
      const dt = (now - last) / 1000;
      last = now;
      setT((cur) => (cur + dt * animationSpeed * 0.2) % 1);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, animationSpeed, result]);

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  const depotScreen = dataToScreen({ x: 0, y: 0 });

  function pointAlong(seq: StationOut[], frac: number): Pt {
    if (seq.length < 2) return { x: 0, y: 0 };
    const segLens: number[] = [];
    let total = 0;
    for (let i = 0; i < seq.length - 1; i++) {
      const dx = seq[i + 1].x - seq[i].x;
      const dy = seq[i + 1].y - seq[i].y;
      const l = Math.hypot(dx, dy);
      segLens.push(l);
      total += l;
    }
    if (total === 0) return { x: seq[0].x, y: seq[0].y };
    let target = frac * total;
    for (let i = 0; i < segLens.length; i++) {
      if (target <= segLens[i]) {
        const r = segLens[i] === 0 ? 0 : target / segLens[i];
        return {
          x: seq[i].x + (seq[i + 1].x - seq[i].x) * r,
          y: seq[i].y + (seq[i + 1].y - seq[i].y) * r,
        };
      }
      target -= segLens[i];
    }
    return { x: seq.at(-1)!.x, y: seq.at(-1)!.y };
  }

  // Compute grid ticks in data space.
  const xStep = niceStep(dataW, 8);
  const yStep = niceStep(dataH, 6);
  const xTicks: number[] = [];
  const yTicks: number[] = [];
  const xStart = Math.ceil(bounds.minX / xStep) * xStep;
  const yStart = Math.ceil(bounds.minY / yStep) * yStep;
  for (let x = xStart; x <= bounds.maxX + 1e-9; x += xStep) xTicks.push(x);
  for (let y = yStart; y <= bounds.maxY + 1e-9; y += yStep) yTicks.push(y);

  const showEmptyHint = stations.length === 0;

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height }}>
      <svg
        ref={svgRef}
        data-testid="xy-canvas"
        width={width}
        height={height}
        className="rounded-lg select-none block w-full h-full"
        style={{
          background:
            "linear-gradient(180deg,#fafbff 0%,#f4f6fb 100%)",
          border: "1px solid rgb(226 232 240)",
          boxShadow: "inset 0 1px 2px rgba(15,23,42,0.04)",
        }}
        onClick={onClickBackground}
        onWheel={onWheel}
        onMouseDown={onMouseDownBg}
      >
        <defs>
          <pattern id="dotgrid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#cbd5e1" opacity="0.45" />
          </pattern>
          <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodOpacity="0.25" />
          </filter>
        </defs>

        <rect
          data-bg="1"
          x={0}
          y={0}
          width={width}
          height={height}
          fill="url(#dotgrid)"
        />

        {/* gridlines through tick locations */}
        <g opacity="0.45">
          {xTicks.map((tx) => {
            const sx = dataToScreen({ x: tx, y: 0 }).x;
            return <line key={`gx${tx}`} data-bg="1" x1={sx} x2={sx} y1={0} y2={height} stroke="#e2e8f0" />;
          })}
          {yTicks.map((ty) => {
            const sy = dataToScreen({ x: 0, y: ty }).y;
            return <line key={`gy${ty}`} data-bg="1" x1={0} x2={width} y1={sy} y2={sy} stroke="#e2e8f0" />;
          })}
        </g>

        {/* axes through depot */}
        <line
          data-bg="1"
          x1={0} x2={width}
          y1={depotScreen.y} y2={depotScreen.y}
          stroke="#94a3b8" strokeOpacity="0.55" strokeDasharray="3 3"
        />
        <line
          data-bg="1"
          x1={depotScreen.x} x2={depotScreen.x}
          y1={0} y2={height}
          stroke="#94a3b8" strokeOpacity="0.55" strokeDasharray="3 3"
        />

        {/* tick labels */}
        <g fontSize="9" fill="#64748b" fontFamily="ui-monospace,monospace">
          {xTicks.map((tx) => {
            const sx = dataToScreen({ x: tx, y: 0 }).x;
            if (Math.abs(tx) < 1e-9) return null;
            return (
              <text key={`lx${tx}`} x={sx} y={height - 6} textAnchor="middle">
                {Number.isInteger(xStep) ? tx.toFixed(0) : tx.toFixed(1)}
              </text>
            );
          })}
          {yTicks.map((ty) => {
            const sy = dataToScreen({ x: 0, y: ty }).y;
            if (Math.abs(ty) < 1e-9) return null;
            return (
              <text key={`ly${ty}`} x={6} y={sy + 3}>
                {Number.isInteger(yStep) ? ty.toFixed(0) : ty.toFixed(1)}
              </text>
            );
          })}
        </g>

        {/* routes */}
        {result?.routes.map((r) => {
          if (!visibleTrucks.has(r.truck_id)) return null;
          const color = truckColor(r.truck_id);
          const pts = r.sequence.map((p) => dataToScreen(p));
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
          const pos = pointAlong(r.sequence, t);
          const posS = dataToScreen(pos);
          return (
            <g key={r.truck_id}>
              <path d={d} fill="none" stroke={color} strokeOpacity="0.18" strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
              <path d={d} fill="none" stroke={color} strokeWidth={2.25} strokeOpacity={0.95} strokeLinecap="round" strokeLinejoin="round" />
              <g transform={`translate(${posS.x},${posS.y})`} filter="url(#softShadow)">
                <circle r={10} fill={color} stroke="white" strokeWidth={2.5} />
                <text textAnchor="middle" dy="0.35em" fill="white" fontSize={10} fontWeight={700}>
                  {r.truck_id}
                </text>
              </g>
            </g>
          );
        })}

        {/* stations */}
        {stations.map((s) => {
          const p = dataToScreen({ x: s.x, y: s.y });
          const isHover = hover === s.id;
          return (
            <g
              key={s.id}
              transform={`translate(${p.x},${p.y})`}
              onMouseDown={(e) => {
                if (readOnly) return;
                e.stopPropagation();
                setDraggingId(s.id);
                setDidDrag(false);
              }}
              onClick={(e) => {
                if (readOnly) return;
                e.stopPropagation();
                if (didDrag) return;
                setDialog({ mode: "edit", id: s.id, x: s.x, y: s.y, demand: s.demand });
              }}
              onMouseEnter={() => setHover(s.id)}
              onMouseLeave={() => setHover(null)}
              onContextMenu={(e) => {
                if (readOnly) return;
                e.preventDefault();
                e.stopPropagation();
                softDelete(s.id);
              }}
              style={{ cursor: readOnly ? "default" : "pointer" }}
            >
              {isHover && <circle r={11} fill="#0ea5e9" opacity="0.18" />}
              <circle r={6} fill="#0ea5e9" stroke="white" strokeWidth={2} filter="url(#softShadow)" />
              <text x={9} y={-7} fontSize={10} fill="#0f172a" style={{ pointerEvents: "none" }}>
                #{s.id}
              </text>
              {isHover && (
                <g transform="translate(12, 12)" style={{ pointerEvents: "none" }}>
                  <rect width={140} height={52} rx={6} fill="#0f172a" opacity={0.94} />
                  <text x={8} y={16} fontSize={10} fill="white" fontWeight={600}>Station #{s.id}</text>
                  <text x={8} y={30} fontSize={10} fill="#cbd5e1">
                    ({s.x.toFixed(1)}, {s.y.toFixed(1)})
                  </text>
                  <text x={8} y={44} fontSize={10} fill="#cbd5e1">demand: {s.demand}</text>
                </g>
              )}
            </g>
          );
        })}

        {/* depot */}
        <g transform={`translate(${depotScreen.x},${depotScreen.y})`} filter="url(#softShadow)" style={{ pointerEvents: "none" }}>
          <rect x={-10} y={-10} width={20} height={20} fill="#0f172a" rx={4} />
          <text textAnchor="middle" dy="0.35em" fontSize={10} fill="white" fontWeight={700}>D</text>
          <text x={14} y={4} fontSize={10} fill="#475569" fontWeight={600}>Depot</text>
        </g>

        {/* empty state */}
        {showEmptyHint && (
          <g style={{ pointerEvents: "none" }} opacity="0.85">
            <g transform={`translate(${width / 2}, ${height / 2 - 10})`}>
              <circle r="36" fill="white" stroke="#e2e8f0" />
              <g transform="translate(-12,-12)" stroke="#94a3b8" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v6M12 16v6M2 12h6M16 12h6" />
                <circle cx="12" cy="12" r="4" />
              </g>
            </g>
            <text x={width / 2} y={height / 2 + 38} textAnchor="middle" fontSize="13" fontWeight="600" fill="#334155">
              Click anywhere to add a station
            </text>
            <text x={width / 2} y={height / 2 + 56} textAnchor="middle" fontSize="11" fill="#64748b">
              Right-click to delete · Shift-drag to pan · Scroll to zoom
            </text>
          </g>
        )}
      </svg>

      {/* Floating zoom / reset controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 bg-white/85 backdrop-blur-sm rounded-lg border border-slate-200 p-1 shadow-sm">
        <button
          onClick={() => setZoom((z) => Math.min(8, z * 1.2))}
          className="w-7 h-7 rounded text-slate-600 hover:bg-slate-100 flex items-center justify-center"
          title="Zoom in"
          aria-label="Zoom in"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(0.2, z / 1.2))}
          className="w-7 h-7 rounded text-slate-600 hover:bg-slate-100 flex items-center justify-center"
          title="Zoom out"
          aria-label="Zoom out"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14"/></svg>
        </button>
        <button
          onClick={resetView}
          className="w-7 h-7 rounded text-slate-600 hover:bg-slate-100 flex items-center justify-center"
          title="Reset view"
          aria-label="Reset view"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
        </button>
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-3 left-3 text-[10px] font-mono text-slate-500 bg-white/80 backdrop-blur-sm border border-slate-200 rounded px-1.5 py-0.5">
        {(zoom * 100).toFixed(0)}%
      </div>

      {/* Hint chip */}
      <div className="absolute bottom-3 right-3 hidden sm:flex items-center gap-1.5 text-[10.5px] text-slate-500 bg-white/85 backdrop-blur-sm border border-slate-200 rounded-full px-2.5 py-1">
        <kbd className="font-mono text-[10px] px-1 rounded bg-slate-100 border border-slate-200">click</kbd>
        <span>add</span>
        <span className="text-slate-300">·</span>
        <kbd className="font-mono text-[10px] px-1 rounded bg-slate-100 border border-slate-200">click</kbd>
        <span>edit</span>
        <span className="text-slate-300">·</span>
        <kbd className="font-mono text-[10px] px-1 rounded bg-slate-100 border border-slate-200">right-click</kbd>
        <span>delete</span>
      </div>

      <StationDialog
        open={dialog !== null}
        mode={dialog?.mode ?? "add"}
        initial={
          dialog
            ? { x: dialog.x, y: dialog.y, demand: dialog.demand }
            : { x: 0, y: 0, demand: 1000 }
        }
        onCancel={() => setDialog(null)}
        onSubmit={(v: StationDialogValue) => {
          if (!dialog) return;
          if (dialog.mode === "add") {
            addStation(v.x, v.y, v.demand);
          } else {
            updateStation(dialog.id, { x: v.x, y: v.y, demand: v.demand });
          }
          setDialog(null);
        }}
        onDelete={
          dialog?.mode === "edit"
            ? () => {
                const id = dialog.id;
                setDialog(null);
                softDelete(id);
              }
            : undefined
        }
      />

      {recentlyDeleted && (
        <div className="toast" role="status">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
          </svg>
          <span>Station removed</span>
          <button onClick={undoDelete}>Undo</button>
        </div>
      )}
    </div>
  );
}
