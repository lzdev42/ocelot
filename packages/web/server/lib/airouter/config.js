import fs from 'fs';
import path from 'path';
import os from 'os';

const DEFAULT_CONFIG_DIR = path.join(os.homedir(), '.config', 'ocelot');
const CONFIG_FILE_NAME = 'airouter-config.json';

const DEFAULT_CONFIG = {
  routes: {},
  dns: {
    enabled: false,
    servers: ['223.5.5.5'],
    timeout: 3000,
  },
  enabled: false,
};

export function getConfigPath(configDir) {
  const dir = configDir || DEFAULT_CONFIG_DIR;
  return path.join(dir, CONFIG_FILE_NAME);
}

const normalizeParams = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }
  const params = {};
  for (const [key, value] of Object.entries(input)) {
    if (!key) continue;
    const type = typeof value;
    if (type === 'string' || type === 'number' || type === 'boolean') {
      params[key] = value;
    }
  }
  return params;
};

const normalizeRouteValue = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const endpoint = typeof value.endpoint === 'string' ? value.endpoint : '';
  if (!endpoint.trim()) return null;

  return {
    name: typeof value.name === 'string' ? value.name : '',
    endpoint: endpoint.trim(),
    model_id: typeof value.model_id === 'string' ? value.model_id : '',
    apikey: typeof value.apikey === 'string' ? value.apikey : '',
    params: normalizeParams(value.params),
    max_retries: Number.isFinite(value.max_retries) && value.max_retries >= 0
      ? Math.trunc(value.max_retries)
      : 3,
    timeout: Number.isFinite(value.timeout) && value.timeout > 0
      ? Math.trunc(value.timeout)
      : 60000,
    enabled: value.enabled !== false,
    fallback: Array.isArray(value.fallback)
      ? value.fallback.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.trim())
      : [],
  };
};

export function normalizeConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      routes: {},
      dns: { ...DEFAULT_CONFIG.dns, servers: [...DEFAULT_CONFIG.dns.servers] },
      enabled: false,
    };
  }

  const rawRoutes = input.routes && typeof input.routes === 'object' && !Array.isArray(input.routes)
    ? input.routes
    : {};

  const routes = {};
  for (const [key, value] of Object.entries(rawRoutes)) {
    if (!key.trim()) continue;
    const normalized = normalizeRouteValue(value);
    if (!normalized) continue;
    routes[key.trim()] = normalized;
  }

  const dnsInput = input.dns && typeof input.dns === 'object' && !Array.isArray(input.dns) ? input.dns : {};
  const dns = {
    enabled: dnsInput.enabled === true,
    servers: Array.isArray(dnsInput.servers)
      ? dnsInput.servers.filter((s) => typeof s === 'string' && s.length > 0)
      : [...DEFAULT_CONFIG.dns.servers],
    timeout: Number.isFinite(dnsInput.timeout) && dnsInput.timeout > 0
      ? Math.trunc(dnsInput.timeout)
      : DEFAULT_CONFIG.dns.timeout,
  };

  return {
    routes,
    dns,
    enabled: input.enabled === true,
  };
}

export async function loadConfig(configDir) {
  const configPath = getConfigPath(configDir);
  try {
    const raw = await fs.promises.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeConfig(parsed);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return normalizeConfig(DEFAULT_CONFIG);
    }
    throw new Error(`Failed to load airouter config at ${configPath}: ${error?.message || error}`);
  }
}

export async function saveConfig(configDir, config) {
  const configPath = getConfigPath(configDir);
  const dir = path.dirname(configPath);
  await fs.promises.mkdir(dir, { recursive: true });
  const normalized = normalizeConfig(config);
  await fs.promises.writeFile(configPath, JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}
