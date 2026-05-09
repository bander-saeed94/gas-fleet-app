export type StationIn = { id: number; x: number; y: number; demand: number };
export type StationOut = { x: number; y: number; demand?: number; id?: number };

export type RouteOut = {
  truck_id: number;
  load: number;
  distance: number;
  sequence: StationOut[];
};

export type QaoaParamsRequest = {
  p: number;
  shots: number;
  optimizer: string;
  // QNN-VQC enhancements (all optional; backend defaults to legacy QAOA when omitted)
  reupload?: boolean;
  observable_mode?: "fixed" | "trainable";
  normalize_weights?: boolean;
  adam_lr?: number;
  adam_epochs?: number;
  adam_pshift_step?: number;
};

export type SolveRequest = {
  num_trucks: number;
  truck_capacity: number;
  depot: [number, number];
  stations: StationIn[];
  solver: "qaoa" | "classical";
  qaoa_params?: QaoaParamsRequest;
};

export type SolveResponse = {
  day_id: string;
  solver: string;
  solve_time_ms: number;
  total_distance: number;
  routes: RouteOut[];
  feasible: boolean;
  meta?: SolveMeta;
};

export type SolveMeta = {
  algo?: string;
  qaoa_fallback?: string;
  dropped_routes?: number;
  [key: string]: unknown;
};

export type DaySummary = {
  id: string;
  created_at: string;
  num_trucks: number;
  truck_capacity: number;
  solver: string;
  total_distance: number;
  solve_time_ms: number;
};

export type DayDetail = DaySummary & {
  request: SolveRequest;
  response: SolveResponse;
};
