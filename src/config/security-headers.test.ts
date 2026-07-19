import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readContentSecurityPolicy(): Map<string, string[]> {
  const headers = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf8');
  const cspHeader = headers
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith('Content-Security-Policy:'));

  if (!cspHeader) {
    throw new Error('Content-Security-Policy header is missing');
  }

  const policy = cspHeader.slice('Content-Security-Policy:'.length).trim();
  return new Map(
    policy.split(';').map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

describe('production security headers', () => {
  it('allows blob image previews without weakening core CSP directives', () => {
    const directives = readContentSecurityPolicy();

    expect(directives.get('img-src')).toEqual(["'self'", 'data:', 'blob:', 'https:']);
    expect(directives.get('default-src')).toEqual(["'self'"]);
    expect(directives.get('base-uri')).toEqual(["'none'"]);
    expect(directives.get('object-src')).toEqual(["'none'"]);
    expect(directives.get('frame-ancestors')).toEqual(["'none'"]);
    expect(directives.get('form-action')).toEqual(["'self'"]);
  });
});
