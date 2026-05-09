import { useEffect, useRef, useState } from "react";
import Modal from "./Modal";

export type StationDialogValue = { x: number; y: number; demand: number };

type Props = {
  open: boolean;
  /** "add" pre-fills coordinates from the click location; "edit" pre-fills from existing station. */
  mode: "add" | "edit";
  initial: StationDialogValue;
  onCancel: () => void;
  onSubmit: (v: StationDialogValue) => void;
  onDelete?: () => void;
};

export default function StationDialog({
  open,
  mode,
  initial,
  onCancel,
  onSubmit,
  onDelete,
}: Props) {
  const [x, setX] = useState(initial.x.toFixed(1));
  const [y, setY] = useState(initial.y.toFixed(1));
  const [demand, setDemand] = useState(String(initial.demand || 1000));
  const [error, setError] = useState<string | null>(null);
  const demandRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setX(initial.x.toFixed(1));
      setY(initial.y.toFixed(1));
      setDemand(String(initial.demand || 1000));
      setError(null);
    }
  }, [open, initial.x, initial.y, initial.demand]);

  function submit() {
    const xn = Number(x);
    const yn = Number(y);
    const dn = Number(demand);
    if (!Number.isFinite(xn) || !Number.isFinite(yn)) {
      setError("Coordinates must be numbers.");
      return;
    }
    if (!Number.isFinite(dn) || dn <= 0) {
      setError("Demand must be a positive number.");
      return;
    }
    onSubmit({ x: xn, y: yn, demand: dn });
  }

  return (
    <Modal
      open={open}
      onClose={onCancel}
      initialFocusRef={demandRef}
      title={mode === "add" ? "Add station" : "Edit station"}
      description={
        mode === "add"
          ? "Set the demand and (optionally) refine the coordinates."
          : "Update coordinates or daily demand."
      }
      footer={
        <>
          {mode === "edit" && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="btn btn-danger-ghost mr-auto"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
              </svg>
              Delete
            </button>
          )}
          <button type="button" onClick={onCancel} className="btn btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={submit} className="btn btn-primary">
            {mode === "add" ? "Add station" : "Save"}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="space-y-3"
      >
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Daily demand (L)
          </label>
          <input
            ref={demandRef}
            type="number"
            inputMode="numeric"
            min={1}
            step="100"
            value={demand}
            onChange={(e) => setDemand(e.target.value)}
            className="input"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              X
            </label>
            <input
              type="number"
              step="0.1"
              value={x}
              onChange={(e) => setX(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Y
            </label>
            <input
              type="number"
              step="0.1"
              value={y}
              onChange={(e) => setY(e.target.value)}
              className="input"
            />
          </div>
        </div>
        {error && (
          <div className="text-[12px] text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2">
            {error}
          </div>
        )}
        {/* invisible submit so Enter works */}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
