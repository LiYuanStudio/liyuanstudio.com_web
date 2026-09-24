export const palettes = {
  cobalt: { hue: 225, spread: 32, label: '群青 / 钴蓝 / 青蓝' },
  jade: { hue: 164, spread: 32, label: '墨绿 / 翠绿 / 青绿' },
  amber: { hue: 28, spread: 30, label: '赭石 / 琥珀 / 金橙' },
  iris: { hue: 272, spread: 32, label: '靛紫 / 鸢尾 / 藕紫' },
  glacier: { hue: 195, spread: 24, label: '冰青 / 冰蓝 / 湖蓝' },
  lagoon: { hue: 181, spread: 34, label: '碧绿 / 泻湖青 / 蓝绿' },
  ocean: { hue: 211, spread: 28, label: '海蓝 / 湛蓝 / 靛蓝' },
  mint: { hue: 147, spread: 26, label: '薄荷 / 翠绿 / 冷绿' },
  forest: { hue: 130, spread: 30, label: '苔绿 / 森绿 / 翡翠' },
  moss: { hue: 105, spread: 30, label: '嫩苔 / 草绿 / 叶绿' },
  olive: { hue: 77, spread: 24, label: '黄绿 / 橄榄 / 青柠' },
  citrine: { hue: 53, spread: 22, label: '金黄 / 柠黄 / 黄绿' },
  honey: { hue: 39, spread: 20, label: '蜜橙 / 蜂蜜 / 金黄' },
  terracotta: { hue: 15, spread: 24, label: '砖红 / 赭石 / 陶橙' },
  vermilion: { hue: 2, spread: 24, label: '胭脂 / 朱红 / 橙红' },
  rose: { hue: 342, spread: 24, label: '莓红 / 玫瑰 / 绯红' },
  berry: { hue: 325, spread: 28, label: '桑紫 / 莓紫 / 桃红' },
  plum: { hue: 305, spread: 28, label: '兰紫 / 梅紫 / 洋红' },
  lavender: { hue: 254, spread: 24, label: '蓝紫 / 薰衣草 / 浅紫' },
  indigo: { hue: 238, spread: 18, label: '钴蓝 / 靛青 / 深蓝紫' },
} as const;

export const layouts = ['sweep', 'eddy', 'cross', 'arch', 'cascade', 'orbit', 'split', 'diagonal', 'fold', 'contour', 'pulse', 'fan'] as const;
export const materials = ['etched', 'brushed', 'polymer', 'wood'] as const;

export interface ArtOptions {
  width: number;
  height: number;
  seed: number;
  palette: keyof typeof palettes;
  layout: typeof layouts[number];
  material: typeof materials[number];
  colorMode: 'material' | 'expressive';
  density: number;
  curvature: number;
  exposure: number;
  negativeSpace: 'none' | 'left' | 'center' | 'right';
  product?: string;
  productScale: number;
  productX: number;
  productY: number;
}

export const defaults: ArtOptions = {
  width: 1920, height: 1080, seed: 20260923, palette: 'cobalt', layout: 'sweep',
  material: 'etched',
  colorMode: 'material',
  density: 55, curvature: 65, exposure: 55, negativeSpace: 'left',
  productScale: 58, productX: 65, productY: 50,
};

export function validateOptions(input: unknown): ArtOptions {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('参数必须是 JSON 对象');
  const supplied = input as Record<string, unknown>;
  const allowed = new Set([...Object.keys(defaults), 'product']);
  for (const key of Object.keys(supplied)) if (!allowed.has(key)) throw new Error(`未知参数：${key}`);
  const result = { ...defaults, ...supplied };
  const ranges = {
    width: [256, 4096], height: [256, 4096], seed: [0, 4294967295],
    density: [10, 100], curvature: [0, 100], exposure: [0, 100],
    productScale: [5, 90], productX: [0, 100], productY: [0, 100],
  } as const;
  for (const [key, [min, max]] of Object.entries(ranges)) {
    const value = result[key as keyof typeof ranges];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${key} 必须是 ${min}–${max} 的整数`);
    }
  }
  if (typeof result.palette !== 'string' || !Object.hasOwn(palettes, result.palette)) throw new Error(`palette 必须是 ${Object.keys(palettes).join('、')}`);
  if (!layouts.includes(result.layout)) throw new Error(`layout 必须是 ${layouts.join('、')}`);
  if (!materials.includes(result.material)) throw new Error(`material 必须是 ${materials.join('、')}`);
  if (!['material', 'expressive'].includes(result.colorMode)) throw new Error('colorMode 必须是 material 或 expressive');
  if (!['none', 'left', 'center', 'right'].includes(result.negativeSpace)) throw new Error('negativeSpace 必须是 none、left、center 或 right');
  if (result.product !== undefined && (typeof result.product !== 'string' || !result.product.trim())) throw new Error('product 必须是本地图片路径');
  return result;
}

function randomFromSeed(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

const n = (value: number) => value.toFixed(2);
// Smooth spatial variation keeps neighbouring marks related; independent jitter looks like static.
function surfaceNoise(seed: number, x: number, y: number): number {
  const cell = (ix: number, iy: number) => {
    let value = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ seed;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  };
  const ix = Math.floor(x), iy = Math.floor(y);
  const sx = x - ix, sy = y - iy;
  const tx = sx * sx * (3 - 2 * sx), ty = sy * sy * (3 - 2 * sy);
  const top = cell(ix, iy) * (1 - tx) + cell(ix + 1, iy) * tx;
  const bottom = cell(ix, iy + 1) * (1 - tx) + cell(ix + 1, iy + 1) * tx;
  return (top * (1 - ty) + bottom * ty) * 2 - 1;
}
// Convert HSL to hex for consistent SVG rasterization across renderers.
function color(hue: number, saturation: number, lightness: number): string {
  hue = ((hue % 360) + 360) % 360;
  const s = saturation / 100;
  const l = lightness / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (offset: number) => {
    const k = (offset + hue / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

export interface ProductLayer { png: Buffer; width: number; height: number }

export function resolveAppearance(o: ArtOptions): { hue: number; saturation: number; lightness: number; label: string } {
  const p = palettes[o.palette];
  if (o.colorMode === 'expressive') return { hue: p.hue, saturation: 30, lightness: 59, label: `${p.label} · 艺术染色` };
  if (o.material === 'wood') {
    if (['cobalt', 'glacier', 'ocean', 'indigo'].includes(o.palette)) return { hue: 36, saturation: 13, lightness: 67, label: '灰蜡木' };
    if (['iris', 'plum', 'lavender', 'berry'].includes(o.palette)) return { hue: 28, saturation: 23, lightness: 40, label: '胡桃木' };
    if (['terracotta', 'vermilion', 'rose'].includes(o.palette)) return { hue: 20, saturation: 32, lightness: 52, label: '樱桃木' };
    if (['amber', 'honey'].includes(o.palette)) return { hue: 33, saturation: 34, lightness: 57, label: '柚木' };
    return { hue: 42, saturation: 25, lightness: 64, label: '浅橡木' };
  }
  if (o.material === 'brushed' || o.material === 'etched') {
    if (['amber', 'honey', 'citrine', 'olive'].includes(o.palette)) return { hue: 41, saturation: 22, lightness: 58, label: '香槟金表面' };
    if (['terracotta', 'vermilion', 'rose'].includes(o.palette)) return { hue: 21, saturation: 23, lightness: 55, label: '暖铜表面' };
    if (['iris', 'plum', 'lavender', 'berry', 'indigo'].includes(o.palette)) return { hue: 218, saturation: 5, lightness: 48, label: '石墨灰金属' };
    if (['jade', 'mint', 'forest', 'moss', 'lagoon'].includes(o.palette)) return { hue: 162, saturation: 15, lightness: 53, label: '灰绿着色金属' };
    return { hue: 210, saturation: o.material === 'brushed' ? 7 : 17, lightness: 63, label: o.material === 'brushed' ? '冷银拉丝' : '雾蓝着色金属' };
  }
  return { hue: p.hue, saturation: 27, lightness: 53 + (['glacier', 'mint', 'citrine'].includes(o.palette) ? 13 : 0), label: `${p.label} · 本体着色塑料` };
}

/** A full-bleed engraved field: muted pigment, fine curved marks and broad pressure bands. */
export function renderSvg(options: ArtOptions, product?: ProductLayer): string {
  const o = validateOptions(options);
  const random = randomFromSeed(o.seed);
  const palette = palettes[o.palette];
  const layout = layouts.indexOf(o.layout);
  const phase = random() * 6.28;
  const bend = o.curvature / 100;
  const w = 1200;
  const h = 780;
  const appearance = resolveAppearance(o);
  const { hue, saturation, lightness } = appearance;
  const spread = o.colorMode === 'material' ? 9 : palette.spread;
  const base = color(hue, saturation, lightness);
  const dark = color(hue - spread / 3, saturation + 7, lightness - 20);
  const light = color(hue + spread / 3, Math.max(0, saturation - 7), Math.min(90, lightness + 23));
  const noise = (x: number, y: number, scale = 170) => surfaceNoise(o.seed, x / scale, y / scale);
  const field = (x: number, y: number): number => {
    const u = x / w + noise(x, y, 330) * .045;
    const v = y / h + noise(x + 910, y, 250) * .055;
    const a = Math.atan2(v - (.16 + .16 * Math.sin(phase)), u - 1.08);
    switch (o.layout) {
      case 'eddy': return a + 1.2 + .35 * Math.sin(u * 7 + phase);
      case 'orbit': return a + 1.57 + .18 * Math.sin(v * 8);
      case 'cascade': return 1.5 + bend * .7 * Math.sin(v * 6 + u * 4 + phase);
      case 'arch': return -.7 + u * 1.5 + .15 * Math.sin(v * 8 + phase);
      case 'split': return (v - .5) * 1.5 + .25 * Math.sin(u * 6 + phase);
      case 'diagonal': return -.65 + bend * .5 * Math.sin(u * 4 + v * 3 + phase);
      case 'fold': return .7 * Math.sin(v * 6 + phase) + bend * .6 * Math.sin(u * 6);
      case 'contour': return 1.4 + bend * .8 * Math.sin(v * 5 + u * 3 + phase);
      case 'pulse': return bend * Math.sin(u * 7 + phase) + v * .3;
      case 'fan': return Math.atan2(v - 1.5, u - .8) + .12 * Math.sin(u * 5);
      case 'cross': return -.5 + bend * .8 * Math.sin(u * 5 - v * 4 + phase);
      default: return -.35 + bend * .5 * Math.sin(u * 5 + v * 3 + phase);
    }
  };
  // Broad, irregular pressure changes run through the entire surface, not isolated ribbons.
  const bands: string[] = [];
  for (let j = 0; j < (o.material === 'etched' ? 9 : 0); j++) {
    let x = -240 + random() * 1550;
    let y = -100 + random() * 900;
    let d = `M ${n(x)} ${n(y)}`;
    for (let step = 0; step < 80; step++) {
      const angle = field(x, y);
      x += Math.cos(angle) * 19;
      y += Math.sin(angle) * 19;
      d += ` L ${n(x)} ${n(y)}`;
    }
    bands.push(`<path d="${d}" stroke="${j % 3 === 0 ? light : dark}" stroke-width="${n(18 + random() * 95)}" opacity="${n(.06 + random() * .1)}"/>`);
  }
  const markBuckets = Array.from({ length: 16 }, () => [] as string[]);
  const count = Math.round((o.material === 'brushed' ? 8000 : 20000) + o.density * 300);
  for (let i = 0; i < count; i++) {
    const x = random() * (w + 20) - 10;
    const y = random() * (h + 20) - 10;
    const angle = o.material === 'polymer' ? random() * Math.PI * 2 : field(x, y) + noise(x, y, 75) * .12 + (random() - .5) * (o.material === 'brushed' ? .065 : .55);
    const length = o.material === 'brushed' ? 10 + random() * (16 + o.exposure * .5) : o.material === 'polymer' ? .6 + random() * 1.9 : 2 + random() * (4 + o.exposure * .07);
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;
    const pressure = noise(x, y, 220) * .75 + noise(x, y, 55) * .25;
    const center = o.negativeSpace === 'left' ? .2 : o.negativeSpace === 'right' ? .8 : .5;
    const quiet = o.negativeSpace === 'none' ? 1 : 1 - .62 * Math.exp(-((x / w - center) ** 2 / .045 + (y / h - .5) ** 2 / .18));
    const opacity = (.17 + random() * .34 + pressure * .1) * quiet * (o.material === 'wood' ? .35 : 1);
    const bucket = Math.min(7, Math.max(0, Math.floor(opacity * 16))) + (i % 3 ? 0 : 8);
    const curl = o.material === 'brushed' ? .01 : .25;
    markBuckets[bucket].push(`M${n(x)} ${n(y)}q${n(dx * .35 - dy * curl)} ${n(dy * .35 + dx * curl)} ${n(dx)} ${n(dy)}`);
  }
  const marks = markBuckets.map((segments, i) => `<path d="${segments.join('')}" stroke="${i < 8 ? dark : light}" stroke-width=".65" opacity="${n(((i % 8) + .5) / 16)}"/>`);
  const structure: string[] = [];
  const defs: string[] = [];
  // Subtle pigment/roughness patches span many marks rather than tracing their outlines.
  for (let i = 0; i < 7; i++) {
    const tint = i % 2 ? dark : light;
    defs.push(`<radialGradient id="patina${i}"><stop stop-color="${tint}" stop-opacity="${n(.06 + random() * .09)}"/><stop offset="1" stop-color="${tint}" stop-opacity="0"/></radialGradient>`);
    structure.push(`<ellipse cx="${n(random() * w)}" cy="${n(random() * h)}" rx="${n(130 + random() * 380)}" ry="${n(90 + random() * 270)}" fill="url(#patina${i})"/>`);
  }
  if (o.material === 'brushed') {
    // A wide anisotropic reflection, separate from the directional scratches.
    defs.push(`<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${dark}" stop-opacity=".18"/><stop offset=".4" stop-color="${light}" stop-opacity=".06"/><stop offset=".57" stop-color="${light}" stop-opacity=".6"/><stop offset=".72" stop-color="${dark}" stop-opacity=".12"/><stop offset="1" stop-color="${light}" stop-opacity=".1"/></linearGradient>`);
    structure.push(`<rect width="1200" height="780" fill="url(#sheen)"/>`);
  } else if (o.material === 'polymer') {
    // Moulded ribs have diffuse rounded edges; the bead texture stays isotropic.
    let x = -180;
    for (let i = 0; x < 1450; i++) {
      x += 120 + random() * 230;
      const shift = Math.sin(phase) * 100 + random() * 120;
      const d = `M${n(x)} -180 C${n(x + (120 + random() * 170) * bend)} 150 ${n(x - 180 * bend + shift)} 500 ${n(x + shift)} 950`;
      const width = 30 + random() * 60;
      // Nested faint strokes form a soft moulded transition without a hard stripe edge.
      for (let layer = 0; layer < 5; layer++) structure.push(`<path d="${d}" fill="none" stroke="${light}" stroke-width="${n(width * (1 - layer * .16))}" opacity=".014"/>`);
    }
  } else if (o.material === 'wood') {
    // Unequal early/latewood bands and sparse elongated pores, not regular sine stripes.
    let offset = -450;
    const tilt = (layout - 5) * .055;
    while (offset < 1600) {
      const step = 4 + random() * 14;
      offset += step;
      let d = '';
      const knotX = 690 + 180 * Math.sin(phase);
      for (let y = -30; y <= 820; y += 8) {
        const warp = 70 * bend * Math.sin(y * .006 + phase) + 38 * Math.sin(y * .011 + offset * .0009) + 19 * noise(offset, y, 140) + 4 * noise(offset, y, 37);
        const knot = 110 * Math.exp(-(((y - 440) / 200) ** 2)) * Math.tanh((offset - knotX) / 95);
        const x = offset + warp + knot + y * tilt;
        d += `${d ? 'L' : 'M'}${n(x)} ${y}`;
      }
      const breaks = random() < .4 ? ` stroke-dasharray="${n(35 + random() * 150)} ${n(15 + random() * 60)}" stroke-dashoffset="${n(random() * 180)}"` : '';
      structure.push(`<path d="${d}" fill="none" stroke="${dark}" stroke-width="${n(.6 + random() * 2.6)}" opacity="${n(.06 + random() * .19)}"${breaks}/><path d="${d}" transform="translate(${n(step * .35)} 0)" fill="none" stroke="${light}" stroke-width="${n(step * .3)}" opacity=".08"/>`);
    }
    const pores: string[] = [];
    for (let i = 0; i < 1100; i++) {
      const x = random() * w;
      const y = random() * h;
      pores.push(`M${n(x)} ${n(y)}l${n(tilt * 4)} ${n(1 + random() * 5)}`);
    }
    structure.push(`<path d="${pores.join('')}" stroke="${dark}" stroke-width=".8" opacity=".35"/>`);
  }
  const texture = `<svg width="${o.width}" height="${o.height}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs>${defs.join('')}</defs><rect width="${w}" height="${h}" fill="${base}"/>${structure.join('')}<g fill="none" stroke-linecap="round">${bands.join('')}${marks.join('')}</g></svg>`;
  let productMarkup = '';
  if (product) {
    const scale = Math.min(o.width * o.productScale / 100 / product.width, o.height * o.productScale / 100 / product.height);
    const width = product.width * scale;
    const height = product.height * scale;
    const x = (o.width - width) * o.productX / 100;
    const y = (o.height - height) * o.productY / 100;
    productMarkup = `<image x="${n(x)}" y="${n(y)}" width="${n(width)}" height="${n(height)}" href="data:image/png;base64,${product.png.toString('base64')}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}"><title>车水马龙 · 数字肌理 · ${palette.label}</title>${texture}${productMarkup}</svg>`;
}
