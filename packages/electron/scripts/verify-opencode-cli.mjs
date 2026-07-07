import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(__dirname, '..');


const binaryName = () => process.platform === 'win32' ? 'opencode.exe' : 'opencode';

const runVersion = (binaryPath) => {
  const result = spawnSync(binaryPath, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15000,
    windowsHide: true,
  });
  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr.trim()}` : '';
    const stdout = result.stdout ? `\n${result.stdout.trim()}` : '';
    throw new Error(`Failed to run bundled OpenCode CLI: ${binaryPath}${stderr}${stdout}`);
  }
  return (result.stdout || '').trim().split(/\s+/)[0] || '';
};

const canExecuteCrossArch = (targetArch) => {
  if (!targetArch || targetArch === process.arch) return true;
  if (process.platform === 'darwin' && process.arch === 'arm64' && targetArch === 'x64') return true;
  return false;
};

const assertBinary = (binaryPath) => {
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Bundled OpenCode CLI not found: ${binaryPath}`);
  }
  const stat = fs.statSync(binaryPath);
  if (!stat.isFile()) {
    throw new Error(`Bundled OpenCode CLI is not a file: ${binaryPath}`);
  }
  if (process.platform !== 'win32' && (stat.mode & 0o111) === 0) {
    throw new Error(`Bundled OpenCode CLI is not executable: ${binaryPath}`);
  }

  const targetArch = process.env.ELECTRON_BUILDER_ARCH;
  if (!canExecuteCrossArch(targetArch)) {
    console.log(`[electron] skipped executing bundled OpenCode CLI for cross-compilation (target: ${targetArch}, host: ${process.arch}): ${binaryPath}`);
    return;
  }

  const actualVersion = runVersion(binaryPath);
  if (!actualVersion) {
    throw new Error(`Bundled OpenCode CLI at ${binaryPath} did not report a version`);
  }
  console.log(`[electron] verified bundled OpenCode CLI ${actualVersion}: ${binaryPath}`);
};

const findPackagedBinaries = () => {
  const distDir = path.join(electronRoot, 'dist');
  if (!fs.existsSync(distDir)) return [];

  const candidates = [];
  const targetBinary = binaryName().toLowerCase();
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      if (!entry.isFile() || entry.name.toLowerCase() !== targetBinary) continue;
      const parent = path.basename(path.dirname(fullPath)).toLowerCase();
      if (parent === 'opencode-cli') {
        candidates.push(fullPath);
      }
    }
  };
  visit(distDir);
  return candidates;
};

const usage = () => {
  console.error('Usage: node scripts/verify-opencode-cli.mjs --staged|--packaged');
  process.exit(2);
};

const main = () => {
  const mode = process.argv[2];
  if (mode !== '--staged' && mode !== '--packaged') usage();

  if (mode === '--staged') {
    assertBinary(path.join(electronRoot, 'resources', 'opencode-cli', binaryName()));
    return;
  }

  const packagedBinaries = findPackagedBinaries();
  if (packagedBinaries.length === 0) {
    throw new Error('No packaged OpenCode CLI found under packages/electron/dist');
  }
  for (const packagedBinary of packagedBinaries) {
    assertBinary(packagedBinary);
  }
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
