import type { DayDetail, DaySummary, SolveRequest, SolveResponse } from "../types";

const BASE = import.meta.env.VITE_API_BASE ?? "/api";

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    let detail = text;
    try {
      const body = JSON.parse(text);
      if (body && typeof body === "object" && "detail" in body) {
        detail = String((body as { detail: unknown }).detail);
      }
    } catch {
      // not JSON; keep raw text
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function solve(req: SolveRequest): Promise<SolveResponse> {
  const res = await fetch(`${BASE}/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return jsonOrThrow<SolveResponse>(res);
}

export async function listDays(): Promise<DaySummary[]> {
  return jsonOrThrow<DaySummary[]>(await fetch(`${BASE}/days`));
}

export async function getDay(id: string): Promise<DayDetail> {
  return jsonOrThrow<DayDetail>(await fetch(`${BASE}/days/${id}`));
}

export async function deleteDay(id: string): Promise<void> {
  const res = await fetch(`${BASE}/days/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
