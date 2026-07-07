import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(electronRoot, '../..');
const outputDir = path.join(electronRoot, 'resources', 'opencode-cli');
const cacheRoot = path.join(electronRoot, '.cache', 'opencode-cli');
const rootPackagePath = path.join(workspaceRoot, 'package.json');

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

const fetchLatestVersion = async () => {
  console.log('[electron] fetching latest OpenCode CLI version from GitHub...');
  const response = await fetch('https://api.github.com/repos/anomalyco/opencode/releases/latest', {
    headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'ocelot-build' },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch latest OpenCode release: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  const tag = data.tag_name;
  if (typeof tag !== 'string' || !tag.startsWith('v')) {
    throw new Error(`Unexpected tag_name from GitHub API: ${tag}`);
  }
  const version = tag.slice(1); // strip leading 'v'
  console.log(`[electron] latest OpenCode CLI version: ${version}`);
  return version;
};

const readPinnedSdkVersion = () => {
  const pkg = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));
  const version = pkg.dependencies?.['@opencode-ai/sdk'];
  if (typeof version !== 'string' || !version.trim()) return null;
  const trimmed = version.trim();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(trimmed)) return null;
  return trimmed;
};

// Resolve version: env var (explicit) > GitHub latest > pinned SDK version in package.json
const resolveVersion = async () => {
  const envVersion = process.env.OCELOT_OPENCODE_CLI_VERSION?.trim();
  if (envVersion && envVersion !== 'latest') {
    if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(envVersion)) {
      throw new Error(`Invalid OCELOT_OPENCODE_CLI_VERSION: ${envVersion}`);
    }
    return envVersion;
  }
  // Always try to get latest from GitHub unless a pinned version is set in package.json
  // and no env override is present
  const pinnedVersion = readPinnedSdkVersion();
  if (!pinnedVersion) {
    return await fetchLatestVersion();
  }
  // pinned version exists — still prefer GitHub latest so builds always bundle newest opencode
  return await fetchLatestVersion().catch((err) => {
    console.warn(`[electron] could not fetch latest version (${err.message}), falling back to pinned: ${pinnedVersion}`);
    return pinnedVersion;
  });
};

const artifactForCurrentPlatform = () => {
  const platform = process.platform;
  const arch = process.env.ELECTRON_BUILDER_ARCH || process.arch;
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

const outputBinaryPath = (binaryName) => path.join(outputDir, binaryName);

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

const ensureExecutable = (filePath) => {
  if (process.platform !== 'win32') {
    fs.chmodSync(filePath, 0o755);
  }
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

const main = async () => {
  const version = await resolveVersion();
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid OpenCode CLI version: ${version}`);
  }

  const artifact = artifactForCurrentPlatform();
  const outputBinary = outputBinaryPath(artifact.binary);
  const existingVersion = readBinaryVersion(outputBinary);
  if (existingVersion === version) {
    console.log(`[electron] bundled OpenCode CLI already prepared: ${outputBinary} (${version})`);
    return;
  }

  const cacheDir = path.join(cacheRoot, version, `${process.platform}-${process.arch}`);
  const archivePath = path.join(cacheDir, artifact.name);
  const url = `https://github.com/anomalyco/opencode/releases/download/v${version}/${artifact.name}`;
  if (!fs.existsSync(archivePath)) {
    console.log(`[electron] downloading OpenCode CLI ${version}: ${artifact.name}`);
    await download(url, archivePath);
  } else {
    console.log(`[electron] using cached OpenCode CLI archive: ${archivePath}`);
  }

  const extractDir = path.join(cacheDir, 'extract');
  extractArchive(archivePath, extractDir);
  const extractedBinary = findBinary(extractDir, artifact.binary);
  if (!extractedBinary) {
    throw new Error(`Archive ${archivePath} did not contain ${artifact.binary}`);
  }

  fs.mkdirSync(outputDir, { recursive: true });
  for (const entry of fs.readdirSync(outputDir)) {
    if (entry === '.gitkeep') continue;
    fs.rmSync(path.join(outputDir, entry), { recursive: true, force: true });
  }
  fs.copyFileSync(extractedBinary, outputBinary);
  ensureExecutable(outputBinary);

  const preparedVersion = readBinaryVersion(outputBinary);
  if (preparedVersion !== version) {
    throw new Error(`Prepared OpenCode CLI version mismatch: expected ${version}, got ${preparedVersion || 'unknown'}`);
  }

  console.log(`[electron] prepared OpenCode CLI ${version}: ${outputBinary}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
