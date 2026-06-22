import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';

const ALLOWLIST = new Set([
  '.env.example',
  '.env.production',
  'server/.env.example',
  'README.md',
  'AGENTS.md',
  '.gitignore',
  'scripts/check-secrets.ts',
  '.github/workflows/secret-scan.yml',
]);

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  '.vercel',
  '.wrangler',
  '.kimi-code',
  '.next',
]);

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp4',
  '.webm',
  '.mp3',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.exe',
  '.dll',
]);

const PATTERNS = [
  { name: 'MongoDB URI', regex: /mongodb\+srv:\/\/[^\s'"`]+/ },
  { name: 'MONGODB_URI assignment', regex: /MONGODB_URI\s*=\s*[^\s'"`]+/ },
  { name: 'API_KEY assignment', regex: /API_KEY\s*=\s*[^\s'"`]+/ },
];

function isBinary(filePath: string): boolean {
  return BINARY_EXTENSIONS.has(extname(filePath).toLowerCase());
}

function walk(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function getTrackedFiles(): string[] {
  try {
    const output = execSync('git ls-files', {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });
    return output
      .split('\n')
      .filter(Boolean)
      .map((file) => resolve(process.cwd(), file));
  } catch {
    return walk(process.cwd());
  }
}

const files = getTrackedFiles();
let findings = 0;

for (const file of files) {
  const rel = relative(process.cwd(), file).replace(/\\/g, '/');
  if (ALLOWLIST.has(rel)) continue;
  if (SKIP_DIRS.has(rel.split('/')[0])) continue;
  if (isBinary(file)) continue;

  if (rel.includes('.env') && !rel.endsWith('.example')) {
    console.error(`🚫 Found potential env file in repo: ${rel}`);
    findings++;
    continue;
  }

  let content: string;
  try {
    content = readFileSync(file, 'utf-8');
  } catch {
    continue;
  }

  for (const { name, regex } of PATTERNS) {
    const match = content.match(regex);
    if (match) {
      console.error(`🚫 ${name} detected in ${rel}`);
      findings++;
    }
  }
}

if (findings > 0) {
  console.error(`\n${findings} potential secret(s) found. Remove them before committing.`);
  process.exit(1);
}

console.log('✅ No obvious secrets detected in tracked files.');
