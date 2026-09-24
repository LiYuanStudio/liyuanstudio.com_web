import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import sharp from 'sharp';
import { defaults, layouts, materials, palettes, renderSvg, resolveAppearance, validateOptions } from './render.js';

const cli = resolve('scripts/art-generator/index.ts');
const run = (...args: string[]) => execFileSync(process.execPath, ['--import', 'tsx', cli, ...args], { encoding: 'utf8' });
async function testDirectory(prefix: string): Promise<string> {
  await mkdir(resolve('artifacts/art'), { recursive: true });
  return mkdtemp(resolve(`artifacts/art/${prefix}-`));
}

test('reject invalid and unknown model parameters before rendering', () => {
  for (const value of [null, [], { width: 100000 }, { seed: -1 }, { exposure: NaN }, { palette: 'toString' }, { layout: '<svg>' }, { productX: 101 }, { density: 1.5 }, { extra: true }]) {
    assert.throws(() => validateOptions(value));
  }
});

test('seeded composition is reproducible, seeds and layouts change the artwork', () => {
  const baseline = renderSvg(defaults);
  assert.equal(renderSvg(defaults), baseline);
  assert.notEqual(renderSvg({ ...defaults, seed: defaults.seed + 1 }), baseline);
  assert.notEqual(renderSvg({ ...defaults, layout: 'eddy' }), baseline);
  assert.notEqual(renderSvg({ ...defaults, palette: 'jade' }), baseline);
});

test('material colors keep wood within natural warm hues and permit explicit artistic tinting', () => {
  for (const palette of Object.keys(palettes) as (keyof typeof palettes)[]) {
    const appearance = resolveAppearance({ ...defaults, material: 'wood', palette });
    assert.ok(appearance.hue >= 20 && appearance.hue <= 42);
  }
  assert.equal(resolveAppearance({ ...defaults, material: 'wood', palette: 'iris', colorMode: 'expressive' }).hue, palettes.iris.hue);
  assert.equal(resolveAppearance({ ...defaults, material: 'brushed', palette: 'cobalt' }).label, '冷银拉丝');
  assert.throws(() => validateOptions({ colorMode: 'random' }));
});

test('materials are reproducible under the same seed and render distinct, midtone surfaces', async () => {
  const fingerprints = new Set<string>();
  for (const material of materials) {
    const options = { ...defaults, width: 320, height: 256, material };
    const svg = renderSvg(options);
    assert.equal(svg, renderSvg(options));
    const buffer = await sharp(Buffer.from(svg)).png().toBuffer();
    const stats = await sharp(buffer).stats();
    assert.ok(stats.channels.slice(0, 3).every(channel => channel.mean > 65 && channel.mean < 215));
    assert.ok(stats.channels.slice(0, 3).some(channel => channel.stdev > 2));
    fingerprints.add(buffer.toString('base64'));
  }
  assert.equal(fingerprints.size, materials.length);
  assert.throws(() => validateOptions({ material: 'chrome' }));
});

test('CLI exports correct dimensions, replays config and refuses to overwrite', async () => {
  const root = await testDirectory('test');
  const first = join(root, 'first');
  const second = join(root, 'replay');
  const result = JSON.parse(run('--out', first, '--width', '640', '--height', '360', '--seed', '7'));
  assert.equal(result.ok, true);
  const png = await readFile(join(first, 'image.png'));
  const meta = await sharp(png).metadata();
  assert.equal(meta.width, 640);
  assert.equal(meta.height, 360);
  run('--out', second, '--config', join(first, 'config.json'));
  assert.deepEqual(await readFile(join(second, 'image.png')), png);
  const refusal = spawnSync(process.execPath, ['--import', 'tsx', cli, '--out', first], { encoding: 'utf8' });
  assert.equal(refusal.status, 1);
  assert.match(refusal.stderr, /输出目录已存在/);
  assert.deepEqual(await readFile(join(first, 'image.png')), png);
});

test('product is embedded, remains visible at the edge and is not tinted', async () => {
  const root = await testDirectory('product-test');
  const input = join(root, 'product.png');
  await sharp({ create: { width: 100, height: 100, channels: 4, background: '#ff0000' } }).png().toFile(input);
  const config = join(root, 'input.json');
  await writeFile(config, JSON.stringify({ product: 'product.png', width: 400, height: 400, productScale: 50, productX: 100, productY: 100 }));
  const out = join(root, 'result');
  run('--config', config, '--out', out);
  const pixel = await sharp(join(out, 'image.png')).extract({ left: 399, top: 399, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  assert.deepEqual([...pixel], [255, 0, 0]);
  const manifest = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8'));
  assert.match(manifest.inputSha256, /^[a-f0-9]{64}$/);
  assert.match(await readFile(join(out, 'image.svg'), 'utf8'), /data:image\/png;base64,/);
});

test('all 240 palette/layout combinations produce valid SVG colors and distinct compositions', () => {
  const compositions = new Set<string>();
  for (const layout of layouts) for (const palette of Object.keys(palettes) as (keyof typeof palettes)[]) {
    const svg = renderSvg({ ...defaults, layout, palette });
    assert.ok(!svg.includes('NaN'));
    const colors = [...svg.matchAll(/(?:stop-color|fill)="(#[^"]+)"/g)];
    assert.ok(colors.length > 0);
    for (const [, color] of colors) assert.match(color, /^#[a-f0-9]{6}$/);
    compositions.add(svg);
  }
  assert.equal(compositions.size, 240);
});

test('batch cycles layouts and palettes, creates a contact sheet and replayable individual configs', async () => {
  const root = await testDirectory('batch-test');
  const out = join(root, 'collection');
  const result = JSON.parse(run('--out', out, '--batch', '3', '--varyPalette', '--width', '320', '--height', '256', '--palette', 'vermilion'));
  assert.equal(result.count, 3);
  assert.deepEqual(result.items.map((item: { layout: string }) => item.layout), ['sweep', 'eddy', 'cross']);
  assert.deepEqual(result.items.map((item: { palette: string }) => item.palette), ['vermilion', 'rose', 'berry']);
  const sheet = await sharp(result.contactSheet).metadata();
  assert.equal(sheet.width, 1224);
  const replay = join(root, 'replay');
  run('--out', replay, '--config', result.items[1].outputs.config);
  assert.deepEqual(await readFile(join(replay, 'image.png')), await readFile(result.items[1].outputs.png));
  const fixed = JSON.parse(run('--out', join(root, 'fixed'), '--batch', '2', '--layout', 'fan', '--width', '256', '--height', '256'));
  assert.ok(fixed.items.every((item: { layout: string; palette: string }) => item.layout === 'fan' && item.palette === 'cobalt'));
  const varied = JSON.parse(run('--out', join(root, 'materials'), '--batch', '4', '--varyMaterial', '--layout', 'sweep', '--width', '256', '--height', '256'));
  assert.deepEqual(varied.items.map((item: { material: string }) => item.material), materials);
});
