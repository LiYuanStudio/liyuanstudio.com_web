import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import sharp, { type OverlayOptions } from 'sharp';
import { defaults, layouts, materials, palettes, renderSvg, resolveAppearance, validateOptions, type ArtOptions, type ProductLayer } from './render.js';

const numericKeys = ['width', 'height', 'seed', 'density', 'curvature', 'exposure', 'productScale', 'productX', 'productY'] as const;
const stringKeys = ['palette', 'layout', 'material', 'colorMode', 'negativeSpace', 'product'] as const;
const hash = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

async function main(): Promise<void> {
  const parsedArgs = parseArgs({
    options: {
      help: { type: 'boolean' }, describe: { type: 'boolean' }, varyPalette: { type: 'boolean' }, varyMaterial: { type: 'boolean' },
      out: { type: 'string' }, config: { type: 'string' }, batch: { type: 'string' },
      ...Object.fromEntries([...numericKeys, ...stringKeys].map(key => [key, { type: 'string' as const }])),
    },
    strict: true, allowPositionals: false,
  });
  const values: Record<string, string | boolean | undefined> = parsedArgs.values;
  if (values.help) {
    console.log(`车水马龙 · 本地视觉资产生成器

调用：npm run art:generate -- --out artifacts/art/blue-001 [参数]
      npm run art:generate -- --config artifacts/art/blue-001/config.json --out artifacts/art/blue-002

--describe                   输出模型可读的 JSON 参数说明
--out <目录>                 必填；只能创建新目录，拒绝覆盖
--config <JSON>              读取配置；命令行参数优先
--batch <1–48>               批量生成，默认轮换 12 种构图；另含 contact-sheet.png、index.json
--varyPalette               批量时轮换 20 组相似色，从 --palette 指定色组开始
--varyMaterial              批量时轮换 etched / brushed / polymer / wood
--material                  etched 数字蚀纹 | brushed 拉丝 | polymer 磨砂模压 | wood 木理
--colorMode                 material（默认，按材质调整色阶）| expressive（艺术染色）
--width / --height           256–4096 像素，默认 1920 × 1080
--seed                      0–4294967295；同参数、同版本可复现
--palette                   ${Object.keys(palettes).join(' | ')}
--layout                    ${layouts.join(' | ')}
--density                   10–100，数字肌理密度
--curvature / --exposure     0–100，流场弯曲 / 纹理延展
--negativeSpace             left | center | right | none，留白位置
--product <本地图片>         PNG / JPEG / WebP，建议透明 PNG；不自动抠图
--productScale              5–90，产品包围盒占画幅的百分比
--productX / --productY     0–100，在可移动区域内的位置，不裁切

输出：image.png、image.svg、config.json、manifest.json
所有处理在本地完成，无网络请求，不修改网站。详见 scripts/art-generator/README.md。`);
    return;
  }
  if (values.describe) {
    console.log(JSON.stringify({
      name: 'che-shui-ma-long', version: 3, defaults, palettes,
      colorModes: ['material', 'expressive'], paletteBehavior: 'material mode maps wood and metal to compatible finishes; manifest.appearance records actual color',
      layouts, materials, negativeSpace: ['left', 'center', 'right', 'none'],
      batch: { range: [1, 48], cyclesLayoutsUnlessExplicit: true, seedStep: 104729, keepsPalette: true, varyPalette: 'optional boolean flag, cycles all 20 palettes', varyMaterial: 'optional boolean flag, cycles all 4 materials', extraFiles: ['contact-sheet.png', 'index.json'] },
      ranges: { width: [256, 4096], height: [256, 4096], seed: [0, 4294967295], density: [10, 100], curvature: [0, 100], exposure: [0, 100], productScale: [5, 90], productX: [0, 100], productY: [0, 100] },
      allNumericValuesAreIntegers: true,
      output: { directoryMustBeNew: true, files: ['image.png', 'image.svg', 'config.json', 'manifest.json'] },
      product: { formats: ['png', 'jpeg', 'webp'], maxBytes: 20971520, maxPixels: 24000000, path: 'relative to config file, or cwd when passed on CLI', backgroundRemoval: false },
    }, null, 2));
    return;
  }
  if (typeof values.out !== 'string' || !values.out.trim()) throw new Error('缺少 --out <新目录>；使用 --help 查看说明');
  const batch = values.batch === undefined ? 1 : Number(values.batch);
  if (values.varyPalette && values.batch === undefined) throw new Error('--varyPalette 需要同时指定 --batch');
  if (values.varyMaterial && values.batch === undefined) throw new Error('--varyMaterial 需要同时指定 --batch');
  if (values.batch !== undefined && (typeof values.batch !== 'string' || !/^\d+$/.test(values.batch) || !Number.isInteger(batch) || batch < 1 || batch > 48)) throw new Error('batch 必须是 1–48 的整数');
  let supplied: Record<string, unknown> = {};
  let explicitLayout = values.layout !== undefined;
  if (typeof values.config === 'string') {
    const configPath = resolve(values.config);
    if ((await stat(configPath)).size > 65536) throw new Error('配置文件不能超过 64 KB');
    const parsed: unknown = JSON.parse(await readFile(configPath, 'utf8'));
    const checked = validateOptions(parsed);
    explicitLayout ||= Object.hasOwn(parsed as object, 'layout');
    supplied = { ...checked, ...(checked.product ? { product: resolve(dirname(configPath), checked.product) } : {}) };
  }
  for (const key of numericKeys) if (values[key] !== undefined) {
    const value = values[key];
    if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error(`${key} 必须是非负整数`);
    supplied[key] = Number(value);
  }
  for (const key of stringKeys) if (values[key] !== undefined) supplied[key] = values[key];
  const options: ArtOptions = validateOptions(supplied);
  const out = resolve(values.out);
  // Fail early, then use exclusive mkdir/write flags to protect against races.
  try {
    await stat(out);
    throw new Error('输出目录已存在，请选择新目录');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let product: ProductLayer | undefined;
  let inputHash: string | undefined;
  if (options.product) {
    options.product = resolve(options.product);
    const info = await stat(options.product);
    if (!info.isFile() || info.size > 20 * 1024 * 1024) throw new Error('产品图片必须是小于 20 MB 的本地文件');
    const data = await readFile(options.product);
    const decoder = sharp(data, { limitInputPixels: 24000000, failOn: 'error' });
    const metadata = await decoder.metadata();
    if (!metadata.format || !['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages ?? 1) !== 1) throw new Error('仅支持静态 PNG、JPEG、WebP 产品图');
    const converted = await decoder.rotate().resize({ width: options.width, height: options.height, fit: 'inside', withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    product = { png: converted.data, width: converted.info.width, height: converted.info.height };
    inputHash = hash(data);
  }
  await mkdir(dirname(out), { recursive: true });
  await mkdir(out); // Atomic reservation: existing directories, including empty ones, are rejected.
  const items = [];
  const thumbnails: OverlayOptions[] = [];
  const columns = Math.min(4, batch);
  const paletteNames = Object.keys(palettes) as (keyof typeof palettes)[];
  const paletteStart = paletteNames.indexOf(options.palette);
  for (let i = 0; i < batch; i++) {
    const variant = {
      ...options,
      material: values.varyMaterial ? materials[(materials.indexOf(options.material) + i) % materials.length] : options.material,
      seed: (options.seed + i * 104729) >>> 0,
      palette: values.varyPalette ? paletteNames[(paletteStart + i) % paletteNames.length] : options.palette,
      layout: values.batch !== undefined && !explicitLayout ? layouts[i % layouts.length] : options.layout,
    };
    const id = `${String(i + 1).padStart(2, '0')}-${variant.material}-${variant.layout}-${variant.palette}`;
    const directory = values.batch !== undefined ? resolve(out, id) : out;
    if (directory !== out) await mkdir(directory);
    const svg = renderSvg(variant, product);
    const png = await sharp(Buffer.from(svg), { limitInputPixels: 4096 * 4096 }).png().toBuffer();
    const outputs = { png: resolve(directory, 'image.png'), svg: resolve(directory, 'image.svg'), config: resolve(directory, 'config.json'), manifest: resolve(directory, 'manifest.json') };
    await writeFile(outputs.svg, svg, { flag: 'wx' });
    await writeFile(outputs.png, png, { flag: 'wx' });
    const config = JSON.stringify(variant, null, 2) + '\n';
    await writeFile(outputs.config, config, { flag: 'wx' });
    await writeFile(outputs.manifest, JSON.stringify({
      generator: 'che-shui-ma-long', version: 3, createdAt: new Date().toISOString(),
      renderer: sharp.versions, options: variant, appearance: resolveAppearance(variant),
      inputSha256: inputHash ?? null,
      files: { 'image.png': hash(png), 'image.svg': hash(svg), 'config.json': hash(config) },
    }, null, 2) + '\n', { flag: 'wx' });
    items.push({ id, material: variant.material, layout: variant.layout, palette: variant.palette, appearance: resolveAppearance(variant), seed: variant.seed, outputs });
    if (values.batch !== undefined) {
      const thumb = await sharp(png).resize(384, 240, { fit: 'contain', background: '#fafaf8' }).png().toBuffer();
      const left = (i % columns) * 408 + 12;
      const top = Math.floor(i / columns) * 286 + 12;
      thumbnails.push({ input: thumb, left, top });
      const label = Buffer.from(`<svg width="384" height="30"><text x="0" y="21" font-family="sans-serif" font-size="12" fill="#575c61">${id} / ${variant.seed}</text></svg>`);
      thumbnails.push({ input: label, left, top: top + 242 });
    }
  }
  if (values.batch !== undefined) {
    const sheet = await sharp({ create: { width: columns * 408, height: Math.ceil(batch / columns) * 286, channels: 3, background: '#fafaf8' } }).composite(thumbnails).png().toBuffer();
    const contactSheet = resolve(out, 'contact-sheet.png');
    await writeFile(contactSheet, sheet, { flag: 'wx' });
    await writeFile(resolve(out, 'index.json'), JSON.stringify({ count: batch, varyPalette: Boolean(values.varyPalette), varyMaterial: Boolean(values.varyMaterial), contactSheet, items }, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ ok: true, count: batch, contactSheet, index: resolve(out, 'index.json'), items }));
  } else {
    console.log(JSON.stringify({ ok: true, width: options.width, height: options.height, outputs: items[0].outputs }));
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
