import fs from 'fs';
import path from 'path';
import os from 'os';

const OPENCODE_CONFIG_PATH = path.join(os.homedir(), '.config', 'opencode', 'config.json');

async function readOpenCodeConfig() {
  try {
    const raw = await fs.promises.readFile(OPENCODE_CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return {};
    }
    throw new Error(`Failed to read opencode config at ${OPENCODE_CONFIG_PATH}: ${error?.message || error}`);
  }
}

async function writeOpenCodeConfig(config) {
  const dir = path.dirname(OPENCODE_CONFIG_PATH);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(OPENCODE_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function buildModelsFromRoutes(routes) {
  const models = {};
  if (!routes || typeof routes !== 'object' || Array.isArray(routes)) {
    return models;
  }
  for (const [routeKey, routeValue] of Object.entries(routes)) {
    if (!routeValue || routeValue.enabled === false) continue;
    const name = typeof routeValue.name === 'string' && routeValue.name.length > 0
      ? routeValue.name
      : routeKey;
    models[routeKey] = { name };
  }
  return models;
}

export async function injectAirouterProvider(webPort, routes, _configDir, refreshFn) {
  if (!Number.isFinite(webPort) || webPort <= 0) {
    throw new Error('webPort must be a positive number');
  }

  const config = await readOpenCodeConfig();
  const providers = (config && typeof config.provider === 'object' && !Array.isArray(config.provider))
    ? config.provider
    : {};

  providers.airouter = {
    name: 'AiRouter',
    npm: '@ai-sdk/openai-compatible',
    options: {
      baseURL: `http://localhost:${webPort}/v1`,
    },
    models: buildModelsFromRoutes(routes),
  };

  config.provider = providers;
  await writeOpenCodeConfig(config);

  if (typeof refreshFn === 'function') {
    await refreshFn();
  }
  return config;
}

export async function removeAirouterProvider(_configDir, refreshFn) {
  const config = await readOpenCodeConfig();
  if (config && typeof config.provider === 'object' && config.provider !== null) {
    if (Object.prototype.hasOwnProperty.call(config.provider, 'airouter')) {
      delete config.provider.airouter;
      await writeOpenCodeConfig(config);
    }
  }

  if (typeof refreshFn === 'function') {
    await refreshFn();
  }
  return config;
}
