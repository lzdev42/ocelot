import { create } from 'zustand';

export type ParamValue = string | number | boolean;

export type RouteEntry = {
  key: string;
  name: string;
  endpoint: string;
  model_id: string;
  apikey: string;
  params: Record<string, ParamValue>;
  max_retries: number;
  timeout: number;
  enabled: boolean;
  fallback: string[];
};

export type AirouterConfig = {
  enabled: boolean;
  routes: Record<string, Omit<RouteEntry, 'key'>>;
  dns: {
    enabled: boolean;
    servers: string[];
    timeout: number;
  };
};

export type AirouterLogEntry = {
  time: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data: string | null;
};

interface AirouterState {
  config: AirouterConfig | null;
  setConfig: (config: AirouterConfig | null) => void;
}

export const useAirouterStore = create<AirouterState>((set) => ({
  config: null,
  setConfig: (config) => set({ config }),
}));
