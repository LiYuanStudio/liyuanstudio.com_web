import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');

function readWorkflow(name: string): string {
  return readFileSync(resolve(root, '.github/workflows', name), 'utf8');
}

function concurrencyGroup(source: string): string | null {
  const match = source.match(/concurrency:\s*\n\s*group:\s*([^\s]+)/u);
  return match?.[1] ?? null;
}

function stepBody(source: string, name: string): string {
  const marker = `- name: ${name}`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const after = source.slice(start + marker.length);
  const next = after.search(/\n\s*- name:/u);
  return next < 0 ? after : after.slice(0, next);
}

describe('release workflow structure', () => {
  const deploy = readWorkflow('deploy.yml');
  const promote = readWorkflow('promote.yml');
  const deployConsole = readWorkflow('deploy-console.yml');

  it('uses distinct concurrency groups for gray builds and production promotes', () => {
    expect(concurrencyGroup(deploy)).toBe('gray-release');
    expect(concurrencyGroup(promote)).toBe('production-release');
    expect(concurrencyGroup(deploy)).not.toBe(concurrencyGroup(promote));
  });

  it('aborts promote when pending status write fails instead of continue-on-error', () => {
    const pendingStep = stepBody(promote, 'Mark production deployment pending');
    expect(pendingStep).toMatch(/state:\s*'pending'/u);
    expect(pendingStep).not.toMatch(/continue-on-error:\s*true/u);
  });

  it('records previous successful production SHA before deploying targets', () => {
    expect(promote).toContain('Record previous successful production');
    expect(promote).toMatch(/core\.setOutput\('sha', deployment\.sha\)/u);
    expect(promote).toMatch(/core\.setOutput\('found', 'true'\)/u);
  });

  it('compensates changed targets and records rollback semantics in status descriptions', () => {
    expect(promote).toContain('Compensate changed targets after partial failure');
    expect(promote).toContain('rollback_vercel');
    expect(promote).toContain('rollback_cloudflare');
    expect(promote).toContain('Mark production deployment failed or partial');
    expect(promote).toMatch(/partial:/u);
    expect(promote).toMatch(/compensated:/u);
    expect(promote).toContain('Fail job when production targets did not both succeed');
  });

  it('deploys production targets independently so partial success can be detected', () => {
    const vercelStep = stepBody(promote, 'Deploy API to Vercel production');
    const cloudflareStep = stepBody(promote, 'Deploy frontend to Cloudflare Pages production');
    expect(vercelStep).toMatch(/continue-on-error:\s*true/u);
    expect(cloudflareStep).toMatch(/continue-on-error:\s*true/u);
  });

  it('pins Vercel CLI through a shared VERCEL_CLI_VERSION env', () => {
    expect(deploy).toMatch(/VERCEL_CLI_VERSION:\s*50\.28\.0/u);
    expect(promote).toMatch(/VERCEL_CLI_VERSION:\s*50\.28\.0/u);
    expect(deploy).toMatch(/vercel@\$\{VERCEL_CLI_VERSION\}/u);
    expect(promote).toMatch(/vercel@\$\{VERCEL_CLI_VERSION\}/u);
    expect(deploy).not.toMatch(/vercel@50\.28\.0/u);
    expect(promote).not.toMatch(/vercel@50\.28\.0/u);
  });

  it('scans secrets before deploying the deploy-console worker', () => {
    expect(concurrencyGroup(deployConsole)).toBe('deploy-console-worker');
    expect(deployConsole).toContain('npm run check:secrets');
    expect(deployConsole).toContain('npm run build:deploy-console');
    expect(deployConsole).toContain('npm run test:deploy-console');
    expect(deployConsole).toContain('npm run deploy --workspace=deploy-console');
    const secretsStep = stepBody(deployConsole, 'Scan for secrets');
    const typecheckStep = stepBody(deployConsole, 'Typecheck and test');
    expect(secretsStep).toContain('npm run check:secrets');
    expect(typecheckStep).toContain('npm run build:deploy-console');
    expect(deployConsole.indexOf('Scan for secrets'))
      .toBeLessThan(deployConsole.indexOf('Typecheck and test'));
  });
});
