import { useEffect, useRef } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  /** Width preset; defaults to "sm". */
  size?: "sm" | "md";
  /** Hide the close (X) button in the header. */
  hideClose?: boolean;
  /** Called when the dialog has finished mounting; useful to focus a field. */
  initialFocusRef?: React.RefObject<HTMLElement>;
};

export default function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "sm",
  hideClose = false,
  initialFocusRef,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => {
      const target =
        initialFocusRef?.current ??
        (containerRef.current?.querySelector(
          "input,textarea,select,button",
        ) as HTMLElement | null);
      target?.focus();
    }, 30);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open, onClose, initialFocusRef]);

  if (!open) return null;

  const widthClass = size === "md" ? "max-w-md" : "max-w-sm";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : undefined}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-slate-900/35 backdrop-blur-[2px] animate-[fadeIn_0.12s_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={containerRef}
        className={`relative w-full ${widthClass} bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-[modalIn_0.14s_ease-out] flex flex-col max-h-[calc(100vh-2rem)]`}
      >
        {(title || !hideClose) && (
          <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2 shrink-0">
            <div className="min-w-0">
              {title && (
                <div className="text-sm font-semibold text-slate-900 leading-tight">
                  {title}
                </div>
              )}
              {description && (
                <div className="text-xs text-slate-500 mt-0.5 leading-snug">
                  {description}
                </div>
              )}
            </div>
            {!hideClose && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="p-1 -mt-0.5 -mr-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            )}
          </div>
        )}
        <div className="px-4 pb-3 overflow-y-auto scroll-thin">{children}</div>
        {footer && (
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
