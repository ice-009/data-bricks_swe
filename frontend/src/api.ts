import type { Accuracy, DayAhead, HorizonCurve, Meta } from "./types";

const BASE = import.meta.env.VITE_API_BASE ?? "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}, signal?: AbortSignal) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  const url = `${BASE}/api${path}${qs.size ? `?${qs}` : ""}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(typeof body.detail === "string" ? body.detail : `Request failed (${res.status})`, res.status);
  }
  return (await res.json()) as T;
}

export const api = {
  meta: (signal?: AbortSignal) => get<Meta>("/meta", {}, signal),
  dayAhead: (deliveryDate: string, gate: string, signal?: AbortSignal) =>
    get<DayAhead>("/day-ahead", { delivery_date: deliveryDate, gate }, signal),
  accuracy: (opts: { gate?: string; horizonH?: number }, signal?: AbortSignal) =>
    get<Accuracy>("/accuracy", { gate: opts.gate, horizon_h: opts.horizonH }, signal),
  horizonCurve: (signal?: AbortSignal) => get<HorizonCurve>("/horizon-curve", {}, signal),
};
