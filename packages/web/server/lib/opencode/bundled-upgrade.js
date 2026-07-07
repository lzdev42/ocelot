import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const GITHUB_LATEST_URL = 'https://api.github.com/repos/anomalyco/opencode/releases/latest';

const artifactForCurrentPlatform = () => {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'darwin') {
    if (arch === 'arm64') return { name: 'opencode-darwin-arm64.zip', binary: 'opencode' };
    if (arch === 'x64') return { name: 'opencode-darwin-x64-baseline.zip', binary: 'opencode' };
  }
  if (platform === 'win32') {
    if (arch === 'arm64') return { name: 'opencode-windows-arm64.zip', binary: 'opencode.exe' };
    if (arch === 'x64') return { name: 'opencode-windows-x64-baseline.zip', binary: 'opencode.exe' };
  }
  if (platform === 'linux') {
    if (arch === 'arm64') return { name: 'opencode-linux-arm64.tar.gz', binary: 'opencode' };
    if (arch === 'x64') return { name: 'opencode-linux-x64-baseline.tar.gz', binary: 'opencode' };
  }
  throw new Error(`No OpenCode CLI artifact mapping for ${platform}/${arch}`);
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    windowsHide: true,
    ...options,
  });
  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr.trim()}` : '';
    const stdout = result.stdout ? `\n${result.stdout.trim()}` : '';
    throw new Error(`Command failed: ${command} ${args.join(' ')}${stderr}${stdout}`);
  }
  return result;
};

const download = async (url, destination) => {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const temp = `${destination}.tmp`;
  fs.writeFileSync(temp, Buffer.from(await response.arrayBuffer()));
  fs.renameSync(temp, destination);
};

const extractArchive = (archivePath, destination) => {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination, { recursive: true });
  if (archivePath.endsWith('.zip')) {
    if (process.platform === 'win32') {
      run('powershell.exe', [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath ${JSON.stringify(archivePath)} -DestinationPath ${JSON.stringify(destination)} -Force`,
      ]);
      return;
    }
    run('unzip', ['-q', archivePath, '-d', destination]);
    return;
  }
  if (archivePath.endsWith('.tar.gz')) {
    run('tar', ['-xzf', archivePath, '-C', destination]);
    return;
  }
  throw new Error(`Unsupported OpenCode CLI archive: ${archivePath}`);
};

const findBinary = (root, binaryName) => {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === binaryName.toLowerCase()) {
      return fullPath;
    }
    if (entry.isDirectory()) {
      const found = findBinary(fullPath, binaryName);
      if (found) return found;
    }
  }
  return null;
};

const ensureExecutable = (filePath) => {
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755);
  }
};

const readBinaryVersion = (binaryPath) => {
  if (!fs.existsSync(binaryPath)) return null;
  const result = spawnSync(binaryPath, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15000,
    windowsHide: true,
  });
  if (result.status !== 0) return null;
  return (result.stdout || '').trim().split(/\s+/)[0] || null;
};

export const fetchLatestBundledVersion = async () => {
  const response = await fetch(GITHUB_LATEST_URL, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ocelot-bundled-upgrade' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub releases responded with ${response.status}`);
  }
  const payload = await response.json();
  const tag = typeof payload?.tag_name === 'string' ? payload.tag_name.trim() : '';
  return tag.replace(/^v/, '');
};

export const upgradeBundledOpenCode = async ({ targetVersion, resolveBundledPath, clearResolvedBinary, restartOpenCode }) => {
  if (typeof resolveBundledPath !== 'function') {
    throw new Error('resolveBundledPath is required');
  }
  if (typeof clearResolvedBinary !== 'function') {
    throw new Error('clearResolvedBinary is required');
  }
  if (typeof restartOpenCode !== 'function') {
    throw new Error('restartOpenCode is required');
  }

  const version = typeof targetVersion === 'string' && targetVersion.trim().length > 0
    ? targetVersion.trim()
    : await fetchLatestBundledVersion();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid OpenCode CLI version: ${version}`);
  }

  const bundledPath = resolveBundledPath();
  if (!bundledPath) {
    throw new Error('Bundled OpenCode CLI binary not found');
  }

  const currentVersion = readBinaryVersion(bundledPath);
  if (currentVersion === version) {
    return { success: true, version, message: `Bundled OpenCode CLI already at version ${version}`, restarted: false };
  }

  const artifact = artifactForCurrentPlatform();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocelot-opencode-upgrade-'));
  const archivePath = path.join(tempDir, artifact.name);
  const extractDir = path.join(tempDir, 'extract');
  const backupPath = path.join(tempDir, `backup-${artifact.binary}`);
  const url = `https://github.com/anomalyco/opencode/releases/download/v${version}/${artifact.name}`;

  try {
    await download(url, archivePath);
    extractArchive(archivePath, extractDir);
    const extractedBinary = findBinary(extractDir, artifact.binary);
    if (!extractedBinary) {
      throw new Error(`Archive did not contain ${artifact.binary}`);
    }
    ensureExecutable(extractedBinary);

    const extractedVersion = readBinaryVersion(extractedBinary);
    if (extractedVersion !== version) {
      throw new Error(`Downloaded OpenCode CLI version mismatch: expected ${version}, got ${extractedVersion || 'unknown'}`);
    }

    fs.copyFileSync(bundledPath, backupPath);

    try {
      fs.copyFileSync(extractedBinary, bundledPath);
      ensureExecutable(bundledPath);
    } catch (replaceError) {
      throw new Error(`Failed to replace bundled binary: ${replaceError instanceof Error ? replaceError.message : replaceError}`);
    }

    clearResolvedBinary();

    let restartError = null;
    try {
      await restartOpenCode();
    } catch (error) {
      restartError = error;
    }

    const actualVersion = readBinaryVersion(bundledPath);
    if (actualVersion !== version || restartError) {
      try {
        fs.copyFileSync(backupPath, bundledPath);
        ensureExecutable(bundledPath);
        clearResolvedBinary();
        await restartOpenCode().catch(() => {});
      } catch (rollbackError) {
        return {
          success: false,
          version,
          error: `Upgrade failed and rollback also failed: ${restartError?.message || 'unknown restart error'}. Rollback: ${rollbackError instanceof Error ? rollbackError.message : rollbackError}. Manual restart may be required.`,
        };
      }

      return {
        success: false,
        version,
        error: restartError instanceof Error
          ? `Binary replaced but restart failed (rolled back): ${restartError.message}`
          : 'Binary replaced but restart failed (rolled back)',
      };
    }

    fs.rmSync(tempDir, { recursive: true, force: true });
    return { success: true, version, restarted: true };
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
};
