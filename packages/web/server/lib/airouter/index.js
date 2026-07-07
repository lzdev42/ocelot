import express from 'express';
import { loadConfig, saveConfig, normalizeConfig } from './config.js';
import { createAirouterRoutes, getLogs, clearLogs } from './routes.js';
import { injectAirouterProvider, removeAirouterProvider } from './provider-inject.js';

export function createAirouterRouter({ webPort, configDir, refreshFn }) {
  const router = express.Router();
  router.use(express.json({ limit: '50mb' }));

  let currentConfig = null;
  const ensureConfig = async () => {
    if (!currentConfig) {
      currentConfig = await loadConfig(configDir);
    }
    return currentConfig;
  };

  router.get('/config', async (_req, res) => {
    try {
      const config = await ensureConfig();
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: error?.message || 'Failed to load airouter config' });
    }
  });

  router.put('/config', async (req, res) => {
    try {
      const normalized = normalizeConfig(req.body);
      await saveConfig(configDir, normalized);
      currentConfig = normalized;

      if (normalized.enabled) {
        await injectAirouterProvider(webPort, normalized.routes, configDir, refreshFn);
      } else {
        await removeAirouterProvider(configDir, refreshFn);
      }

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error?.message || 'Failed to save airouter config' });
    }
  });

  router.get('/health', async (_req, res) => {
    try {
      const config = await ensureConfig();
      res.json({ status: 'ok', enabled: Boolean(config.enabled) });
    } catch (error) {
      res.status(500).json({ status: 'error', error: error?.message || 'Failed to load airouter config' });
    }
  });

  router.get('/logs', (_req, res) => {
    res.json(getLogs());
  });

  router.delete('/logs', (_req, res) => {
    clearLogs();
    res.json({ success: true });
  });

  router.get('/v1/models', async (_req, res) => {
    try {
      const config = await ensureConfig();
      const routes = config.routes || {};
      const modelsList = Object.entries(routes)
        .filter(([, r]) => r.enabled !== false)
        .map(([modelKey]) => ({
          id: modelKey,
          object: 'model',
          created: Math.floor(Date.now() / 1000),
          owned_by: 'airouter',
        }));
      res.json({ object: 'list', data: modelsList });
    } catch (error) {
      res.status(500).json({ error: error?.message || 'Failed to list models' });
    }
  });

  router.post('/v1/chat/completions', async (req, res) => {
    try {
      const config = await ensureConfig();
      if (!config.enabled) {
        return res.status(503).json({ error: 'AiRouter is disabled' });
      }
      const routes = createAirouterRoutes(config);
      await routes.proxyChatCompletion(req, res);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({ error: error?.message || 'AiRouter proxy error' });
      }
    }
  });

  return router;
}
