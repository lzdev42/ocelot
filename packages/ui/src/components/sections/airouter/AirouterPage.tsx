import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { NumberInput } from '@/components/ui/number-input';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { toast } from '@/components/ui';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { runtimeFetch } from '@/lib/runtime-fetch';
import {
  useAirouterStore,
  type AirouterConfig,
  type RouteEntry,
  type ParamValue,
  type AirouterLogEntry,
} from '@/stores/useAirouterStore';

const emptyRoute = (): RouteEntry => ({
  key: '',
  name: '',
  endpoint: '',
  model_id: '',
  apikey: '',
  params: {},
  max_retries: 3,
  timeout: 60000,
  enabled: true,
  fallback: [],
});

const configToEntries = (config: AirouterConfig | null): RouteEntry[] => {
  if (!config?.routes) return [];
  return Object.entries(config.routes).map(([key, value]) => ({
    key,
    name: value.name ?? '',
    endpoint: value.endpoint ?? '',
    model_id: value.model_id ?? '',
    apikey: value.apikey ?? '',
    params: value.params ?? {},
    max_retries: value.max_retries ?? 3,
    timeout: value.timeout ?? 60000,
    enabled: value.enabled !== false,
    fallback: value.fallback ?? [],
  }));
};

const readApiError = async (response: Response, fallback: string): Promise<string> => {
  const data = await response.json().catch(() => null) as { error?: unknown } | null;
  return typeof data?.error === 'string' && data.error.trim() ? data.error : fallback;
};

// AI Router logs store timestamps in UTC (ISO 8601); convert to the user's
// local system time for display. Format matches the previous HH:MM:SS slice.
const formatLogTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

// ===== Params Editor =====
const ParamsEditor: React.FC<{
  params: Record<string, ParamValue>;
  onChange: (params: Record<string, ParamValue>) => void;
}> = ({ params, onChange }) => {
  const { t } = useI18n();
  const [newParamName, setNewParamName] = React.useState('');
  const [newParamType, setNewParamType] = React.useState<'string' | 'number' | 'boolean'>('string');
  const [newParamValue, setNewParamValue] = React.useState('');

  const addParam = () => {
    const name = newParamName.trim();
    if (!name) return;
    let value: ParamValue;
    if (newParamType === 'number') {
      value = Number(newParamValue);
      if (!Number.isFinite(value)) value = 0;
    } else if (newParamType === 'boolean') {
      value = newParamValue === 'true';
    } else {
      value = newParamValue;
    }
    onChange({ ...params, [name]: value });
    setNewParamName('');
    setNewParamValue('');
  };

  const removeParam = (name: string) => {
    const next = { ...params };
    delete next[name];
    onChange(next);
  };

  const paramEntries = Object.entries(params);

  return (
    <div className="space-y-2">
      {paramEntries.length > 0 && (
        <div className="space-y-1">
          {paramEntries.map(([name, value]) => (
            <div key={name} className="flex items-center gap-2 pl-3 border-l border-border/60">
              <code className="text-xs font-mono text-foreground flex-1 truncate">{name}</code>
              <span className="text-xs text-muted-foreground/60">
                {typeof value === 'boolean' ? 'bool' : typeof value}
              </span>
              <code className="text-xs font-mono text-[var(--primary-base)] max-w-[40%] truncate">
                {String(value)}
              </code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeParam(name)}
                className="h-5 w-5 flex-shrink-0"
                aria-label={t('settings.airouter.page.actions.removeParam')}
              >
                <Icon name="close" className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 pl-3 border-l border-border/60">
        <Input
          value={newParamName}
          onChange={(e) => setNewParamName(e.target.value)}
          placeholder={t('settings.airouter.page.field.paramName')}
          className="h-7 flex-1 font-mono text-xs"
        />
        <select
          value={newParamType}
          onChange={(e) => setNewParamType(e.target.value as 'string' | 'number' | 'boolean')}
          className="h-7 rounded-md border border-border bg-transparent text-xs px-1"
        >
          <option value="string">str</option>
          <option value="number">num</option>
          <option value="boolean">bool</option>
        </select>
        <Input
          value={newParamValue}
          onChange={(e) => setNewParamValue(e.target.value)}
          placeholder={t('settings.airouter.page.field.paramValue')}
          className="h-7 flex-1 font-mono text-xs"
          onKeyDown={(e) => { if (e.key === 'Enter') addParam(); }}
        />
        <Button variant="ghost" size="xs" onClick={addParam} className="!font-normal">
          <Icon name="add" className="h-3.5 w-3.5" />
        </Button>
      </div>
      {newParamType === 'boolean' && (
        <p className="text-xs text-muted-foreground px-4">
          {t('settings.airouter.page.hint.paramBoolean')}
        </p>
      )}
    </div>
  );
};

// ===== Fallback Editor =====
const FallbackEditor: React.FC<{
  fallback: string[];
  routeKeys: string[];
  onChange: (fallback: string[]) => void;
}> = ({ fallback, routeKeys, onChange }) => {
  const { t } = useI18n();

  const toggle = (key: string) => {
    if (fallback.includes(key)) {
      onChange(fallback.filter((k) => k !== key));
    } else {
      onChange([...fallback, key]);
    }
  };

  if (routeKeys.length === 0) {
    return (
      <p className="text-xs text-muted-foreground px-4">
        {t('settings.airouter.page.hint.fallbackEmpty')}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {routeKeys.map((key) => (
        <label
          key={key}
          className={`flex items-center gap-1.5 px-2 py-1 rounded border cursor-pointer text-xs font-mono transition-colors ${
            fallback.includes(key)
              ? 'border-[var(--primary-base)] bg-[var(--primary-base)]/10 text-foreground'
              : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          <Checkbox
            checked={fallback.includes(key)}
            onChange={() => toggle(key)}
            ariaLabel={key}
          />
          {key}
        </label>
      ))}
    </div>
  );
};

// ===== Route Card (collapsible) =====
const RouteCard: React.FC<{
  entry: RouteEntry;
  allRouteKeys: string[];
  onPatch: (patch: Partial<RouteEntry>) => void;
  onRemove: () => void;
}> = ({ entry, allRouteKeys, onPatch, onRemove }) => {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = React.useState(false);

  const otherKeys = allRouteKeys.filter((k) => k !== entry.key);

  return (
    <div className="rounded-lg border border-border bg-[var(--surface-elevated)]">
      {/* Card Header (always visible) */}
      <div className="flex items-center justify-between p-4 pb-0">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <Icon
            name={collapsed ? 'arrow-right-s' : 'arrow-down-s'}
            className="h-4 w-4 text-muted-foreground flex-shrink-0"
          />
          <Checkbox
            checked={entry.enabled}
            onChange={(v) => onPatch({ enabled: v })}
            ariaLabel={t('settings.airouter.page.field.routeEnabled')}
          />
          <span className={`typography-ui-label font-medium truncate ${entry.enabled ? 'text-foreground' : 'text-muted-foreground/60'}`}>
            {entry.name || entry.key || t('settings.airouter.page.section.newRoute')}
          </span>
          {entry.key && (
            <code className="text-xs font-mono text-muted-foreground/60 truncate hidden sm:inline">
              {entry.key}
            </code>
          )}
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          className="h-7 w-7 flex-shrink-0"
          aria-label={t('settings.airouter.page.actions.removeRoute')}
        >
          <Icon name="close" className="h-4 w-4" />
        </Button>
      </div>

      {/* Card Body (collapsible) */}
      {!collapsed && (
        <div className="p-4 pt-3 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground typography-ui-label">
                {t('settings.airouter.page.field.modelName')}
              </label>
              <Input
                value={entry.name}
                onChange={(e) => onPatch({ name: e.target.value })}
                placeholder={t('settings.airouter.page.field.modelNamePlaceholder')}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground typography-ui-label">
                {t('settings.airouter.page.field.modelId')}
              </label>
              <Input
                value={entry.key}
                onChange={(e) => onPatch({ key: e.target.value })}
                placeholder={t('settings.airouter.page.field.modelIdPlaceholder')}
                className="h-7 font-mono text-xs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground typography-ui-label">
              {t('settings.airouter.page.field.endpoint')}
            </label>
            <Input
              value={entry.endpoint}
              onChange={(e) => onPatch({ endpoint: e.target.value })}
              placeholder={t('settings.airouter.page.field.endpointPlaceholder')}
              className="h-7 font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground typography-ui-label">
                {t('settings.airouter.page.field.apiKey')}
              </label>
              <Input
                value={entry.apikey}
                onChange={(e) => onPatch({ apikey: e.target.value })}
                placeholder={t('settings.airouter.page.field.apiKeyPlaceholder')}
                type="password"
                className="h-7 font-mono text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground typography-ui-label">
                {t('settings.airouter.page.field.modelIdOriginal')}
              </label>
              <Input
                value={entry.model_id}
                onChange={(e) => onPatch({ model_id: e.target.value })}
                placeholder={t('settings.airouter.page.field.modelIdOriginalPlaceholder')}
                className="h-7 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                {t('settings.airouter.page.hint.modelIdOriginal')}
              </p>
            </div>
          </div>

          {/* Params */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-medium text-muted-foreground typography-ui-label">
                {t('settings.airouter.page.section.params')}
              </h4>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Icon name="information" className="h-3 w-3 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent sideOffset={8} className="max-w-sm">
                  <p>{t('settings.airouter.page.tooltip.params')}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <ParamsEditor
              params={entry.params}
              onChange={(params) => onPatch({ params })}
            />
          </div>

          {/* Fallback */}
          {otherKeys.length > 0 && (
            <div className="space-y-1.5">
              <h4 className="text-xs font-medium text-muted-foreground typography-ui-label">
                {t('settings.airouter.page.section.fallback')}
              </h4>
              <FallbackEditor
                fallback={entry.fallback}
                routeKeys={otherKeys}
                onChange={(fallback) => onPatch({ fallback })}
              />
            </div>
          )}

          {/* Timeout & Retries */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground typography-ui-label">
                {t('settings.airouter.page.field.timeout')}
              </label>
              <NumberInput
                value={entry.timeout}
                onValueChange={(v) => onPatch({ timeout: v })}
                min={0}
                step={1000}
                fallbackValue={60000}
                className="h-7"
              />
              <p className="text-xs text-muted-foreground">{t('settings.airouter.page.hint.timeout')}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground typography-ui-label">
                {t('settings.airouter.page.field.maxRetries')}
              </label>
              <NumberInput
                value={entry.max_retries}
                onValueChange={(v) => onPatch({ max_retries: v })}
                min={0}
                step={1}
                fallbackValue={3}
                className="h-7"
              />
              <p className="text-xs text-muted-foreground">{t('settings.airouter.page.hint.maxRetries')}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ===== Log Panel =====
const LogPanel: React.FC = () => {
  const { t } = useI18n();
  const [logs, setLogs] = React.useState<AirouterLogEntry[]>([]);
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const abortRef = React.useRef<AbortController | null>(null);

  const fetchLogs = React.useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await runtimeFetch('/api/airouter/logs', { signal: controller.signal });
      if (res.ok) {
        const data = (await res.json()) as AirouterLogEntry[];
        setLogs(data);
      }
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    if (!autoRefresh) return;
    void fetchLogs();
    const interval = setInterval(() => void fetchLogs(), 2000);
    return () => { clearInterval(interval); abortRef.current?.abort(); };
  }, [autoRefresh, fetchLogs]);

  const clearLogs = async () => {
    try {
      await runtimeFetch('/api/airouter/logs', { method: 'DELETE' });
      setLogs([]);
    } catch {
      // ignore
    }
  };

  const levelColor = (level: string) => {
    if (level === 'error') return 'text-[var(--status-error)]';
    if (level === 'warn') return 'text-[var(--status-warning)]';
    return 'text-muted-foreground';
  };

  return (
    <div className="rounded-lg border border-border bg-[var(--surface-elevated)]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
        <div className="flex items-center gap-2">
          <Icon name="terminal" className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium typography-ui-label text-foreground">
            {t('settings.airouter.page.section.logs')}
          </span>
          <span className="text-xs text-muted-foreground/60">{logs.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
            <Checkbox checked={autoRefresh} onChange={setAutoRefresh} ariaLabel="auto-refresh" />
            {t('settings.airouter.page.field.autoRefresh')}
          </label>
          <Button variant="ghost" size="xs" onClick={clearLogs} className="!font-normal">
            <Icon name="close" className="h-3 w-3 mr-0.5" />
            {t('settings.airouter.page.actions.clearLogs')}
          </Button>
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto p-2 space-y-0.5 font-mono text-xs">
        {logs.length === 0 ? (
          <p className="text-muted-foreground/50 px-2 py-4 text-center">
            {t('settings.airouter.page.empty.logs')}
          </p>
        ) : (
          logs.slice().reverse().map((log, i) => (
            <div key={i} className="flex gap-2 px-1 py-0.5">
              <span className="text-muted-foreground/40 flex-shrink-0">
                {formatLogTime(log.time)}
              </span>
              <span className={`flex-shrink-0 w-10 ${levelColor(log.level)}`}>
                {log.level.toUpperCase()}
              </span>
              <span className="text-foreground break-all">{log.message}</span>
              {log.data && (
                <span className="text-muted-foreground/60 break-all">{log.data.slice(0, 200)}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ===== Main Page =====
export const AirouterPage: React.FC = () => {
  const { t } = useI18n();
  const setConfig = useAirouterStore((s) => s.setConfig);

  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [entries, setEntries] = React.useState<RouteEntry[]>([]);
  const [enabled, setEnabled] = React.useState(false);
  const [dnsEnabled, setDnsEnabled] = React.useState(false);
  const [dnsServers, setDnsServers] = React.useState('223.5.5.5');
  const [dnsTimeout, setDnsTimeout] = React.useState(3000);

  React.useEffect(() => {
    const abort = new AbortController();
    void (async () => {
      try {
        const res = await runtimeFetch('/api/airouter/config', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: abort.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as Partial<AirouterConfig>;
        const normalized: AirouterConfig = {
          enabled: data.enabled === true,
          routes: data.routes ?? {},
          dns: {
            enabled: data.dns?.enabled === true,
            servers: data.dns?.servers ?? ['223.5.5.5'],
            timeout: data.dns?.timeout ?? 3000,
          },
        };
        setConfig(normalized);
        setEnabled(normalized.enabled);
        setEntries(configToEntries(normalized));
        setDnsEnabled(normalized.dns.enabled);
        setDnsServers(normalized.dns.servers.join(', '));
        setDnsTimeout(normalized.dns.timeout);
      } catch {
        // ignore
      } finally {
        setIsLoading(false);
      }
    })();
    return () => abort.abort();
  }, [setConfig]);

  const updateEntry = (index: number, patch: Partial<RouteEntry>) => {
    setEntries((prev) => prev.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  };

  const addRoute = () => {
    setEntries((prev) => [...prev, emptyRoute()]);
  };

  const removeRoute = (index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index));
  };

  const buildConfig = (): AirouterConfig => {
    const routes: AirouterConfig['routes'] = {};
    for (const entry of entries) {
      const key = entry.key.trim();
      if (!key) continue;
      const endpoint = entry.endpoint.trim();
      if (!endpoint) continue;
      routes[key] = {
        name: entry.name.trim(),
        endpoint,
        model_id: entry.model_id.trim(),
        apikey: entry.apikey,
        params: entry.params,
        max_retries: entry.max_retries,
        timeout: entry.timeout,
        enabled: entry.enabled,
        fallback: entry.fallback,
      };
    }
    return {
      enabled,
      routes,
      dns: {
        enabled: dnsEnabled,
        servers: dnsServers.split(',').map((s) => s.trim()).filter(Boolean),
        timeout: dnsTimeout,
      },
    };
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const cfg = buildConfig();
      const res = await runtimeFetch('/api/airouter/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(cfg),
      });
      if (!res.ok) {
        const msg = await readApiError(res, t('settings.airouter.page.toast.saveFailed'));
        toast.error(msg);
        return;
      }
      setConfig(cfg);
      toast.success(t('settings.airouter.page.toast.saved'));
    } catch {
      toast.error(t('settings.airouter.page.toast.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <SettingsPageLayout>
        <div className="flex items-center justify-center py-12">
          <Icon name="loader" className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </SettingsPageLayout>
    );
  }

  const allRouteKeys = entries.map((e) => e.key.trim()).filter(Boolean);

  return (
    <ScrollableOverlay outerClassName="h-full" className="w-full">
      <div className="mx-auto w-full max-w-3xl p-3 sm:p-6 sm:pt-8 space-y-6">
        <div className="space-y-1">
          <h2 className="typography-ui-header font-semibold text-foreground">
            {t('settings.airouter.page.title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('settings.airouter.page.description')}
          </p>
        </div>

        <div data-settings-item="airouter.enabled" className="space-y-3">
          <label className="flex items-center gap-2 typography-ui-label text-foreground">
            <Checkbox
              checked={enabled}
              onChange={setEnabled}
              ariaLabel={t('settings.airouter.page.field.enableAria')}
            />
            {t('settings.airouter.page.field.enable')}
          </label>
          <p className="text-xs text-muted-foreground px-6">
            {t('settings.airouter.page.hint.enable')}
          </p>
        </div>

        <div data-settings-item="airouter.routes" className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <h3 className="typography-ui-header font-medium text-foreground">
                {t('settings.airouter.page.section.routes')}
              </h3>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Icon name="information" className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent sideOffset={8} className="max-w-sm">
                  <p>{t('settings.airouter.page.tooltip.routes')}</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <Button onClick={addRoute} size="xs" variant="ghost" className="!font-normal">
              <Icon name="add" className="h-3.5 w-3.5 mr-1" />
              {t('settings.airouter.page.actions.addRoute')}
            </Button>
          </div>

          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center rounded-lg border border-dashed border-border">
              <Icon name="shuffle" className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="typography-ui-label text-muted-foreground">
                {t('settings.airouter.page.empty.title')}
              </p>
              <p className="typography-meta text-muted-foreground/70 mt-0.5">
                {t('settings.airouter.page.empty.description')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {entries.map((entry, index) => (
                <RouteCard
                  key={index}
                  entry={entry}
                  allRouteKeys={allRouteKeys}
                  onPatch={(patch) => updateEntry(index, patch)}
                  onRemove={() => removeRoute(index)}
                />
              ))}
            </div>
          )}
        </div>

        <div data-settings-item="airouter.dns" className="space-y-3">
          <h3 className="typography-ui-header font-medium text-foreground px-1">
            {t('settings.airouter.page.section.dns')}
          </h3>
          <section className="px-2 pb-2 pt-0 space-y-3">
            <label className="flex items-center gap-2 typography-ui-label text-foreground">
              <Checkbox
                checked={dnsEnabled}
                onChange={setDnsEnabled}
                ariaLabel={t('settings.airouter.page.field.dnsEnableAria')}
              />
              {t('settings.airouter.page.field.dnsEnable')}
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground typography-ui-label">
                  {t('settings.airouter.page.field.dnsServers')}
                </label>
                <Input
                  value={dnsServers}
                  onChange={(e) => setDnsServers(e.target.value)}
                  placeholder="223.5.5.5, 8.8.8.8"
                  disabled={!dnsEnabled}
                  className="h-7 font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground typography-ui-label">
                  {t('settings.airouter.page.field.dnsTimeout')}
                </label>
                <NumberInput
                  value={dnsTimeout}
                  onValueChange={setDnsTimeout}
                  min={100}
                  step={500}
                  fallbackValue={3000}
                  disabled={!dnsEnabled}
                  className="h-7"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Log Panel */}
        <LogPanel />

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving} size="sm">
            {isSaving ? t('settings.common.actions.saving') : t('settings.common.actions.saveChanges')}
          </Button>
        </div>
      </div>
    </ScrollableOverlay>
  );
};
