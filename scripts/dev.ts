import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import process from 'node:process';

const API_PORT = 3000;
const API_HEALTH_URL = `http://localhost:${API_PORT}/api/health`;
const VITE_PORTS = [5173, 5174, 5175];

function log(message: string) {
  // eslint-disable-next-line no-console
  console.log(`[dev] ${message}`);
}

function run(command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv }) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: { ...process.env, ...options?.env },
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', (err) => reject(err));
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

async function getProcessName(pid: number): Promise<string | null> {
  if (process.platform === 'win32') {
    const { stdout } = await run('wmic', ['process', 'where', `ProcessId=${pid}`, 'get', 'Name']);
    const match = stdout.split('\n').find((line) => line.trim() && !line.includes('Name'));
    return match?.trim() ?? null;
  }
  // macOS / Linux
  try {
    const { stdout } = await run('ps', ['-p', String(pid), '-o', 'comm=']);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function getListeningPids(port: number): Promise<number[]> {
  if (process.platform === 'win32') {
    const { stdout } = await run('netstat', ['-ano']);
    const pids = new Set<number>();
    for (const line of stdout.split('\n')) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const local = parts[1] ?? '';
      const pid = Number(parts[parts.length - 1]);
      if (!local.endsWith(`:${port}`) || Number.isNaN(pid)) continue;
      pids.add(pid);
    }
    return Array.from(pids);
  }
  // macOS / Linux
  const { stdout } = await run('lsof', ['-i', `TCP:${port}`, '-sTCP:LISTEN', '-t']);
  return stdout
    .split('\n')
    .map((s) => Number(s.trim()))
    .filter((n) => !Number.isNaN(n));
}

async function killStaleNode(port: number) {
  const pids = await getListeningPids(port);
  for (const pid of pids) {
    if (pid === process.pid) continue;
    const name = await getProcessName(pid);
    if (name?.toLowerCase().includes('node')) {
      log(`killing stale node process ${pid} (${name}) on port ${port}`);
      if (process.platform === 'win32') {
        await run('taskkill', ['//F', '//PID', String(pid)]);
      } else {
        await run('kill', ['-9', String(pid)]);
      }
    } else if (name) {
      log(`port ${port} is held by ${name} (pid ${pid}) — not killing`);
    }
  }
}

async function waitForApi(timeoutMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(API_HEALTH_URL);
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await setTimeout(300);
  }
  return false;
}

function startProcess(label: string, command: string, args: string[]) {
  log(`starting ${label}: ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    stdio: 'inherit',
    // npm is a .cmd on Windows; shell is required to resolve it.
    shell: process.platform === 'win32',
  });
  child.on('error', (err) => {
    log(`failed to start ${label}: ${err.message}`);
  });
  return child;
}

async function cleanup(children: ChildProcess[]) {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
      // Give it a moment, then force kill on Windows
      await setTimeout(500);
      if (!child.killed && process.platform === 'win32') {
        try {
          await run('taskkill', ['//F', '//T', '//PID', String(child.pid)]);
        } catch {
          // ignore
        }
      }
    }
  }
}

async function main() {
  log('cleaning up stale ports...');
  await killStaleNode(API_PORT);
  for (const port of VITE_PORTS) {
    await killStaleNode(port);
  }

  const api = startProcess('api', 'npm', ['run', 'dev:api']);

  log('waiting for backend health...');
  const healthy = await waitForApi();
  if (!healthy) {
    log('backend did not become ready in time');
    await cleanup([api]);
    process.exit(1);
  }
  log('backend ready');

  const web = startProcess('web', 'npm', ['run', 'dev:web']);

  const shutdown = async (signal: string) => {
    log(`received ${signal}, shutting down...`);
    await cleanup([web, api]);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Keep the script alive while children run
  await new Promise(() => {});
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
