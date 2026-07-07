import React from 'react';
import { isDesktopShell, requestFileAccess, startDesktopWindowDrag } from '@/lib/desktop';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Icon } from "@/components/icon/Icon";
import { updateDesktopSettings } from '@/lib/persistence';
import { copyTextToClipboard } from '@/lib/clipboard';
import { restartDesktopApp } from '@/lib/desktop';
import { cn } from '@/lib/utils';
import { RemoteConnectionForm } from './RemoteConnectionForm';
import { desktopHostsGet, desktopHostsSet } from '@/lib/desktopHosts';
import { useI18n } from '@/lib/i18n';
import { runtimeFetch } from '@/lib/runtime-fetch';

const INSTALL_COMMAND = 'curl -fsSL https://opencode.ai/install | bash';
const DOCS_URL = 'https://opencode.ai/docs';

type OnboardingPlatform = 'macos' | 'linux' | 'windows' | 'unknown';

type ChooserScreenProps = {
  /** Callback when CLI becomes available */
  onCliAvailable?: () => void;
};

function BashCommand({ onCopy, copyTitle }: { onCopy: () => void; copyTitle: string }) {
  return (
    <div className="flex items-center justify-between gap-3 w-full">
      <code className="flex-1 text-left overflow-x-auto whitespace-nowrap">
        <span style={{ color: 'var(--syntax-keyword)' }}>curl</span>
        <span className="text-muted-foreground"> -fsSL </span>
        <span style={{ color: 'var(--syntax-string)' }}>https://opencode.ai/install</span>
        <span className="text-muted-foreground"> | </span>
        <span style={{ color: 'var(--syntax-keyword)' }}>bash</span>
      </code>
      <button
        onClick={onCopy}
        className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title={copyTitle}
        aria-label={copyTitle}
      >
        <Icon name="file-copy" className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ChooserScreen({ onCliAvailable }: ChooserScreenProps) {
  const { t } = useI18n();
  const [copied, setCopied] = React.useState(false);
  const [isDesktopApp, setIsDesktopApp] = React.useState(false);
  const [isApplyingPath, setIsApplyingPath] = React.useState(false);
  const [isStartingOpenCode, setIsStartingOpenCode] = React.useState(false);
  const [localCheckPhase, setLocalCheckPhase] = React.useState<'idle' | 'checking' | 'starting'>('idle');
  const [startError, setStartError] = React.useState<string | null>(null);
  const [opencodeBinary, setOpencodeBinary] = React.useState('');
  const [platform, setPlatform] = React.useState<OnboardingPlatform>('unknown');
  const [activeTab, setActiveTab] = React.useState<'local' | 'bundled' | 'remote'>('local');
  const [advancedOpen, setAdvancedOpen] = React.useState(false);
  const announceGuardRef = React.useRef(false);
  const [troubleOpen, setTroubleOpen] = React.useState(false);

  React.useEffect(() => {
    setIsDesktopApp(isDesktopShell());
  }, []);

  React.useEffect(() => {
    if (typeof navigator === 'undefined') {
      setPlatform('unknown');
      return;
    }

    const ua = navigator.userAgent || '';
    if (/Windows/i.test(ua)) setPlatform('windows');
    else if (/Macintosh|Mac OS X/i.test(ua)) setPlatform('macos');
    else if (/Linux/i.test(ua)) setPlatform('linux');
    else setPlatform('unknown');
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await runtimeFetch('/api/config/settings', { method: 'GET', headers: { Accept: 'application/json' } });
        if (!response.ok) return;
        const data = (await response.json().catch(() => null)) as null | { opencodeBinary?: unknown };
        if (!data || cancelled) return;
        const value = typeof data.opencodeBinary === 'string' ? data.opencodeBinary.trim() : '';
        if (value) setOpencodeBinary(value);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDragStart = React.useCallback(async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.app-region-no-drag')) return;
    if (target.closest('button, a, input, select, textarea, code, summary, details')) return;
    if (e.button !== 0) return;
    if (isDesktopApp) {
      await startDesktopWindowDrag();
    }
  }, [isDesktopApp]);

  const persistFirstChoice = React.useCallback(async (choice: 'local' | 'remote' | 'bundled') => {
    if (!isDesktopApp) return;
    console.log('[ChooserScreen][persistFirstChoice] choice=', choice);
    try {
      const config = await desktopHostsGet();
      console.log('[ChooserScreen][persistFirstChoice] current config=', config);
      // Both 'local' and 'bundled' use the local desktop host. 'remote' leaves
      // defaultHostId alone (the RemoteConnectionForm saves its own host entry).
      const defaultHostId = choice === 'remote' ? config.defaultHostId : 'local';
      await desktopHostsSet({
        ...config,
        defaultHostId,
        initialHostChoiceCompleted: true,
      });
      console.log('[ChooserScreen][persistFirstChoice] desktopHostsSet succeeded');
    } catch (err) {
      console.error('[ChooserScreen][persistFirstChoice] error=', err);
      throw err;
    }
  }, [isDesktopApp]);

  const announceAvailable = React.useCallback(async (choice: 'local' | 'remote' | 'bundled' = 'local') => {
    if (announceGuardRef.current) {
      console.log('[ChooserScreen][announceAvailable] already announced, skipping');
      return;
    }
    announceGuardRef.current = true;
    console.log('[ChooserScreen][announceAvailable] isDesktopApp=', isDesktopApp, 'choice=', choice);
    if (isDesktopApp) {
      await persistFirstChoice(choice);
    }
    console.log('[ChooserScreen][announceAvailable] calling onCliAvailable');
    onCliAvailable?.();
  }, [isDesktopApp, onCliAvailable, persistFirstChoice]);

  // Probe whether the bundled OpenCode CLI is available in this build.
  // /health returns bundledCliAvailable: true when the bundled binary exists
  // on disk, independent of which source won the resolution priority.
  // (Upstream changed bundled CLI to last-resort, so opencodeBinarySource
  // reflects which source won, not whether bundled exists.)
  const [bundledAvailable, setBundledAvailable] = React.useState<boolean | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await runtimeFetch('/health');
        if (!response.ok) {
          if (!cancelled) setBundledAvailable(null);
          return;
        }
        const data = (await response.json()) as { bundledCliAvailable?: unknown };
        if (cancelled) return;
        setBundledAvailable(data.bundledCliAvailable === true);
      } catch {
        if (!cancelled) setBundledAvailable(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startManagedOpenCodeApi = React.useCallback(async (source?: string): Promise<boolean> => {
    try {
      const body: Record<string, string> = {};
      if (source) body.source = source;
      const response = await runtimeFetch('/api/opencode/start', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `HTTP ${response.status}`);
      }
      const data = (await response.json()) as { ready?: boolean; started?: boolean };
      return data.ready === true || data.started === true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw error instanceof Error ? error : new Error(message);
    }
  }, []);

  const handleCheckLocal = React.useCallback(async () => {
    setStartError(null);
    setLocalCheckPhase('checking');
    try {
      const healthResponse = await runtimeFetch('/health');
      if (healthResponse.ok) {
        const health = (await healthResponse.json()) as { openCodeRunning?: unknown; opencodeBinaryResolved?: unknown };
        if (health.openCodeRunning === true) {
          await announceAvailable('local');
          return;
        }
      }

      setLocalCheckPhase('starting');
      setIsStartingOpenCode(true);
      try {
        const ready = await startManagedOpenCodeApi('local');
        if (ready) {
          await announceAvailable('local');
          return;
        }
        setStartError(t('onboarding.localSetup.errors.cliNotReady'));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStartError(message);
      } finally {
        setIsStartingOpenCode(false);
      }
    } catch {
      setStartError(t('onboarding.localSetup.errors.detectionFailed'));
    } finally {
      setLocalCheckPhase('idle');
    }
  }, [announceAvailable, startManagedOpenCodeApi, t]);

  const handleUseBundled = React.useCallback(async () => {
    if (!isDesktopApp) {
      onCliAvailable?.();
      return;
    }
    setStartError(null);
    setIsStartingOpenCode(true);
    try {
      const ready = await startManagedOpenCodeApi('bundled');
      if (ready) {
        await announceAvailable('bundled');
        return;
      }
      setStartError(t('onboarding.localSetup.errors.cliNotReady'));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setStartError(message);
    } finally {
      setIsStartingOpenCode(false);
    }
  }, [isDesktopApp, startManagedOpenCodeApi, announceAvailable, onCliAvailable, t]);

  const handleBrowse = React.useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!isDesktopApp) return;

    try {
      const selected = await requestFileAccess();
      if (selected.success && selected.path && selected.path.trim().length > 0) {
        setOpencodeBinary(selected.path.trim());
      }
    } catch {
      // ignore
    }
  }, [isDesktopApp]);

  const handleApplyPath = React.useCallback(async () => {
    setIsApplyingPath(true);
    try {
      await updateDesktopSettings({ opencodeBinary: opencodeBinary.trim() });
      if (isDesktopApp) {
        await persistFirstChoice('local');
        await restartDesktopApp();
        return;
      }
      await runtimeFetch('/api/config/reload', { method: 'POST' });
    } finally {
      setTimeout(() => setIsApplyingPath(false), 1000);
    }
  }, [isDesktopApp, opencodeBinary, persistFirstChoice]);

  const handleCopy = React.useCallback(async () => {
    const result = await copyTextToClipboard(INSTALL_COMMAND);
    if (result.ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      console.error('Failed to copy:', result.error);
    }
  }, []);

  const docsUrl = DOCS_URL;
  const binaryPlaceholder =
    platform === 'windows'
      ? 'C:\\Users\\you\\AppData\\Roaming\\npm\\opencode.cmd'
      : platform === 'linux'
        ? '/home/you/.bun/bin/opencode'
        : '/Users/you/.bun/bin/opencode';

  const showLocal = !isDesktopApp || activeTab === 'local';
  const showBundled = isDesktopApp && activeTab === 'bundled';

  return (
    <div
      className="app-region-drag h-full flex items-center justify-center bg-transparent p-8 cursor-default select-none overflow-y-auto"
      onMouseDown={handleDragStart}
    >
      <div className="w-full max-w-md space-y-7">
        <header className="text-center space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t('onboarding.chooser.title')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('onboarding.chooser.description')}
          </p>
        </header>

        {isDesktopApp && (
          <div className="app-region-no-drag flex gap-1.5">
            <button
              type="button"
              className={cn(
                'flex-1 px-4 py-2 rounded-lg border transition-colors text-sm',
                activeTab === 'local'
                  ? 'border-[var(--interactive-selection)] text-foreground bg-[var(--interactive-selection)]/10'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground'
              )}
              onClick={() => setActiveTab('local')}
            >
              {t('onboarding.chooser.tabs.localInstall')}
            </button>
            <button
              type="button"
              className={cn(
                'flex-1 px-4 py-2 rounded-lg border transition-colors text-sm',
                activeTab === 'bundled'
                  ? 'border-[var(--interactive-selection)] text-foreground bg-[var(--interactive-selection)]/10'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground'
              )}
              onClick={() => setActiveTab('bundled')}
            >
              {t('onboarding.chooser.tabs.bundled')}
            </button>
            <button
              type="button"
              className={cn(
                'flex-1 px-4 py-2 rounded-lg border transition-colors text-sm',
                activeTab === 'remote'
                  ? 'border-[var(--interactive-selection)] text-foreground bg-[var(--interactive-selection)]/10'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground'
              )}
              onClick={() => setActiveTab('remote')}
            >
              {t('onboarding.chooser.tabs.connectRemote')}
            </button>
          </div>
        )}

        {isDesktopApp && activeTab === 'remote' ? (
          <div className="app-region-no-drag">
            <RemoteConnectionForm
              onBack={() => setActiveTab('local')}
              showBackButton={false}
              onSwitchToLocal={() => setActiveTab('local')}
            />
          </div>
        ) : null}

        {showBundled && (
          <div className="app-region-no-drag space-y-4">
            <div
              className="rounded-lg border border-border bg-background/60 backdrop-blur-sm p-5 space-y-3"
            >
              <div className="flex items-start gap-3">
                <div
                  className="flex-shrink-0 rounded-md p-2"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--primary-base) 10%, transparent)',
                    color: 'var(--primary-base)',
                  }}
                >
                  <Icon name="download-cloud" className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="typography-ui-label font-medium text-foreground">
                    {t('onboarding.chooser.bundled.title')}
                  </h3>
                  <p className="typography-meta text-muted-foreground mt-0.5">
                    {t('onboarding.chooser.bundled.description')}
                  </p>
                  {bundledAvailable === false && (
                    <p className="typography-micro text-muted-foreground/70 mt-1.5">
                      {t('onboarding.chooser.bundled.notDetectedHint')}
                    </p>
                  )}
                </div>
              </div>
              <Button
                type="button"
                onClick={handleUseBundled}
                disabled={bundledAvailable === false || isStartingOpenCode}
                className="w-full"
              >
                {isStartingOpenCode
                  ? t('onboarding.chooser.bundled.actions.starting')
                  : t('onboarding.chooser.bundled.actions.useBundled')}
              </Button>
            </div>
          </div>
        )}

        {showLocal && (
          <div className="space-y-4">
            {platform === 'windows' && (
              <div className="rounded-lg border border-border bg-background/50 p-4">
                <div className="text-sm text-foreground">{t('onboarding.localSetup.windows.title')}</div>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                  <li>{t('onboarding.localSetup.windows.stepRunInstallInWsl')}</li>
                  <li>{t('onboarding.localSetup.windows.stepSetBinaryPath')}</li>
                </ol>
              </div>
            )}

            <p className="text-sm text-muted-foreground text-center leading-relaxed">
              {t('onboarding.localSetup.intro')}
            </p>

            <div className="app-region-no-drag rounded-lg border border-border bg-background/60 backdrop-blur-sm px-4 py-3 font-mono text-sm">
              {copied ? (
                <div className="flex items-center gap-2" style={{ color: 'var(--status-success)' }}>
                  <Icon name="check" className="h-4 w-4" />
                  {t('onboarding.common.status.copiedToClipboard')}
                </div>
              ) : (
                <BashCommand onCopy={handleCopy} copyTitle={t('onboarding.common.copyToClipboard')} />
              )}
            </div>

            <div className="app-region-no-drag flex items-center justify-between">
              <a
                href={docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                {platform === 'windows' ? t('onboarding.localSetup.docs.windows') : t('onboarding.localSetup.docs.default')}
                <Icon name="external-link" className="h-3 w-3" />
              </a>
            </div>

            {startError && (
              <div
                className="app-region-no-drag rounded-lg border px-4 py-3 text-xs"
                style={{
                  borderColor: 'color-mix(in srgb, var(--status-error) 30%, transparent)',
                  backgroundColor: 'color-mix(in srgb, var(--status-error) 6%, transparent)',
                  color: 'var(--status-error)',
                }}
                role="alert"
              >
                {startError}
              </div>
            )}

            <Button
              type="button"
              onClick={handleCheckLocal}
              disabled={localCheckPhase !== 'idle'}
              className="app-region-no-drag w-full"
            >
              {localCheckPhase === 'checking'
                ? t('onboarding.localSetup.actions.checking')
                : localCheckPhase === 'starting'
                  ? t('onboarding.chooser.local.actions.starting')
                  : t('onboarding.localSetup.actions.checkNow')}
            </Button>

            <details
              className="app-region-no-drag group rounded-lg border border-border/60 px-4 open:bg-background/40 transition-colors"
              open={advancedOpen}
              onToggle={(e) => setAdvancedOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="flex items-center justify-between cursor-pointer py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors list-none [&::-webkit-details-marker]:hidden">
                <span>{t('onboarding.localSetup.advanced.title')}</span>
                <Icon name="arrow-down-s" className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="pb-4 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={opencodeBinary}
                    onChange={(e) => setOpencodeBinary(e.target.value)}
                    placeholder={binaryPlaceholder}
                    disabled={isApplyingPath}
                    className="flex-1 font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleBrowse}
                    disabled={isApplyingPath || !isDesktopApp}
                  >
                    {t('onboarding.localSetup.actions.browse')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleApplyPath}
                    disabled={isApplyingPath || !opencodeBinary.trim()}
                  >
                    {t('onboarding.localSetup.actions.apply')}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground/70">
                  {t('onboarding.localSetup.helper.saveAndReload')}
                </p>
              </div>
            </details>

            <details
              className="app-region-no-drag group rounded-lg border border-border/60 px-4 open:bg-background/40 transition-colors"
              open={troubleOpen}
              onToggle={(e) => setTroubleOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className="flex items-center justify-between cursor-pointer py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors list-none [&::-webkit-details-marker]:hidden">
                <span>{t('onboarding.localSetup.troubleshoot.title')}</span>
                <Icon name="arrow-down-s" className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <ul className="pb-4 space-y-1.5 text-xs text-muted-foreground list-disc pl-4">
                {platform === 'windows' ? (
                  <>
                    <li>{t('onboarding.localSetup.windows.hintDetectionFailed')}</li>
                  </>
                ) : (
                  <>
                    <li>{t('onboarding.localSetup.hint.ensurePath')}</li>
                    <li>{t('onboarding.localSetup.hint.setEnv')}</li>
                    <li>{t('onboarding.localSetup.hint.missingRuntime')}</li>
                  </>
                )}
              </ul>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
