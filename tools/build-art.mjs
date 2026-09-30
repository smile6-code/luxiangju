#!/usr/bin/env node
/**
 * 鲁香居 · 菜品插画生成器
 *
 *   node tools/build-art.mjs
 *
 * 输出到 assets/img/*.svg。
 * 所有插画共用同一套背景、器皿、光影与蒸汽脚手架,保证 19 张图成套一致;
 * 每道菜的食材造型单独手写,便于继续微调。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '..', 'assets', 'img');
mkdirSync(OUT, { recursive: true });

const W = 960;
const H = 720;
const r2 = (v) => Math.round(v * 100) / 100;

/* ------------------------------------------------------------------ *
 * 几何工具
 * ------------------------------------------------------------------ */

/** 椭圆上一点的坐标。0° 在右侧,角度沿屏幕坐标顺时针增长。 */
const pt = (cx, cy, rx, ry, deg) => {
  const a = (deg * Math.PI) / 180;
  return [r2(cx + rx * Math.cos(a)), r2(cy + ry * Math.sin(a))];
};

/** 椭圆弧的 path。a0 -> a1,适合画器皿上的高光。 */
const arc = (cx, cy, rx, ry, a0, a1) => {
  const [x0, y0] = pt(cx, cy, rx, ry, a0);
  const [x1, y1] = pt(cx, cy, rx, ry, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${x0},${y0} A${rx},${ry} 0 ${large} ${sweep} ${x1},${y1}`;
};

/** 绕中心均匀撒点,带一点随机感(固定种子,保证每次生成结果一致)。 */
let seed = 20260929;
const rand = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};
const jitter = (v, amount) => r2(v + (rand() * 2 - 1) * amount);

/* ------------------------------------------------------------------ *
 * 公共 defs
 * ------------------------------------------------------------------ */

const baseDefs = () => `
  <linearGradient id="table" x1="0.1" y1="0" x2="0.7" y2="1">
    <stop offset="0" stop-color="#f1e9da"/>
    <stop offset="0.52" stop-color="#e6dbc6"/>
    <stop offset="1" stop-color="#d4c6ad"/>
  </linearGradient>
  <radialGradient id="lamp" cx="0.34" cy="0.22" r="0.8">
    <stop offset="0" stop-color="#fff8e6" stop-opacity="0.85"/>
    <stop offset="0.42" stop-color="#fff2d8" stop-opacity="0.35"/>
    <stop offset="1" stop-color="#fff2d8" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="vignette" cx="0.5" cy="0.45" r="0.74">
    <stop offset="0.52" stop-color="#8a7a60" stop-opacity="0"/>
    <stop offset="1" stop-color="#8a7a60" stop-opacity="0.15"/>
  </radialGradient>
  <linearGradient id="porcelain" x1="0.12" y1="0" x2="0.88" y2="1">
    <stop offset="0" stop-color="#fdfbf5"/>
    <stop offset="0.42" stop-color="#faf6ee"/>
    <stop offset="1" stop-color="#e7dcc8"/>
  </linearGradient>
  <linearGradient id="porcelain2" x1="0.1" y1="0.1" x2="0.9" y2="1">
    <stop offset="0" stop-color="#f7f1e7"/>
    <stop offset="1" stop-color="#ddd1bb"/>
  </linearGradient>
  <linearGradient id="wood" x1="0" y1="0" x2="0.35" y2="1">
    <stop offset="0" stop-color="#e6c39a"/>
    <stop offset="0.5" stop-color="#cda06c"/>
    <stop offset="1" stop-color="#ac8050"/>
  </linearGradient>
  <linearGradient id="steam" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/>
    <stop offset="0.6" stop-color="#ffffff" stop-opacity="0.3"/>
    <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>
  <filter id="b24" x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur stdDeviation="24"/></filter>
  <filter id="b12" x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur stdDeviation="12"/></filter>
  <filter id="b5" x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur stdDeviation="5"/></filter>
  <filter id="b2" x="-35%" y="-35%" width="170%" height="170%"><feGaussianBlur stdDeviation="2"/></filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>`;

/* ------------------------------------------------------------------ *
 * 场景 / 器皿
 * ------------------------------------------------------------------ */

const scene = (body, { defs = '', light = [330, 190, 560], w = W, h = H } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
<defs>${baseDefs()}${defs}</defs>
<rect width="${w}" height="${h}" fill="url(#table)"/>
<ellipse cx="${light[0]}" cy="${light[1]}" rx="${light[2]}" ry="${r2(light[2] * 0.82)}" fill="url(#lamp)"/>
${body}
<rect width="${w}" height="${h}" fill="url(#vignette)"/>
<rect width="${w}" height="${h}" filter="url(#grain)" opacity="0.07" style="mix-blend-mode:multiply"/>
</svg>
`;

/** 盘子的投影 + 盘身 + 盘心,返回可直接拼进 body 的字符串。 */
const plate = ({ cx = 480, cy = 366, rx = 308, ry = 226 } = {}) => `
<ellipse cx="${cx}" cy="${cy + 26}" rx="${r2(rx * 0.95)}" ry="${r2(ry * 0.88)}" fill="#8c7c60" opacity="0.3" filter="url(#b24)"/>
<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#porcelain)"/>
<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#c3b49b" stroke-width="1.4" opacity="0.5"/>
<ellipse cx="${cx}" cy="${cy + 3}" rx="${r2(rx * 0.79)}" ry="${r2(ry * 0.77)}" fill="url(#porcelain2)" opacity="0.9"/>
<ellipse cx="${cx}" cy="${cy + 3}" rx="${r2(rx * 0.79)}" ry="${r2(ry * 0.77)}" fill="none" stroke="#cbbc9f" stroke-width="1.2" opacity="0.6"/>
<path d="${arc(cx, cy, r2(rx * 0.985), r2(ry * 0.985), 188, 352)}" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="0.75"/>
<path d="${arc(cx, cy + 3, r2(rx * 0.8), r2(ry * 0.78), 202, 338)}" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.55"/>`;

/** 汤盅 / 汤碗:外沿、内壁、汤面。surface 传渐变 id。 */
const bowl = ({ cx = 480, cy = 366, rx = 296, ry = 218, surface = 'url(#soupSurface)', lip = 0.88 } = {}) => `
<ellipse cx="${cx}" cy="${cy + 26}" rx="${r2(rx * 0.95)}" ry="${r2(ry * 0.88)}" fill="#8c7c60" opacity="0.3" filter="url(#b24)"/>
<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#porcelain)"/>
<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#c3b49b" stroke-width="1.4" opacity="0.5"/>
<ellipse cx="${cx}" cy="${cy + 5}" rx="${r2(rx * lip)}" ry="${r2(ry * lip)}" fill="#dccfb9" opacity="0.8"/>
<ellipse cx="${cx}" cy="${cy + 7}" rx="${r2(rx * lip * 0.94)}" ry="${r2(ry * lip * 0.94)}" fill="${surface}"/>
<ellipse cx="${cx}" cy="${cy + 7}" rx="${r2(rx * lip * 0.94)}" ry="${r2(ry * lip * 0.94)}" fill="none" stroke="#c1ae90" stroke-width="1.6" opacity="0.5"/>
<path d="${arc(cx, cy, r2(rx * 0.985), r2(ry * 0.985), 188, 352)}" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round" opacity="0.75"/>`;

/** 木质案板 / 竹垫。 */
const board = ({ cx = 480, cy = 372, w = 620, h = 400, r = 26 } = {}) => {
  const x = cx - w / 2;
  const y = cy - h / 2;
  const grains = Array.from({ length: 9 }, (_, i) => {
    const gy = r2(y + 26 + i * ((h - 52) / 8));
    return `<path d="M${r2(x + 18)},${gy} C${r2(x + w * 0.32)},${r2(gy - 9)} ${r2(x + w * 0.68)},${r2(gy + 9)} ${r2(x + w - 18)},${gy}" fill="none" stroke="#9a7442" stroke-width="2" opacity="0.3"/>`;
  }).join('\n');
  return `
<rect x="${x}" y="${r2(y + 22)}" width="${w}" height="${h}" rx="${r}" fill="#8c7c60" opacity="0.26" filter="url(#b24)"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="url(#wood)"/>
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" stroke="#f4dcbb" stroke-width="3" opacity="0.5"/>
<rect x="${r2(x + 10)}" y="${r2(y + 10)}" width="${r2(w - 20)}" height="${r2(h - 20)}" rx="${r - 8}" fill="none" stroke="#8a6234" stroke-width="2" opacity="0.28"/>
${grains}`;
};

/** 食材与器皿之间的接触阴影。 */
const contact = (cx, cy, rx, ry, o = 0.4) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#9a8b70" opacity="${r2(o * 0.55)}" filter="url(#b12)"/>`;

/** 蒸汽:三条不同粗细的曲线。 */
const steam = (x, y, spread = 46) => `
<g opacity="0.85">
  <path d="M${x - spread},${y} C${x - spread - 26},${y - 78} ${x - spread + 34},${y - 128} ${x - spread + 2},${y - 208}" fill="none" stroke="url(#steam)" stroke-width="15" stroke-linecap="round"/>
  <path d="M${x},${y + 8} C${x - 30},${y - 92} ${x + 30},${y - 140} ${x + 4},${y - 236}" fill="none" stroke="url(#steam)" stroke-width="19" stroke-linecap="round"/>
  <path d="M${x + spread},${y} C${x + spread - 22},${y - 74} ${x + spread + 30},${y - 122} ${x + spread - 4},${y - 196}" fill="none" stroke="url(#steam)" stroke-width="13" stroke-linecap="round"/>
</g>`;

/** 葱花 / 香菜 / 芝麻 之类的小点缀。 */
const scallionBits = (items) =>
  items
    .map(
      ([x, y, w = 20, rot = 0]) =>
        `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="${r2(-w / 2)}" y="-4" width="${w}" height="8" rx="4" fill="#79a83f"/><rect x="${r2(-w / 2)}" y="-4" width="${w}" height="4" rx="2" fill="#a6cf67" opacity="0.8"/></g>`
    )
    .join('');

const sesame = (items) =>
  items
    .map(
      ([x, y, rot = 0]) =>
        `<ellipse cx="${x}" cy="${y}" rx="6" ry="4" transform="rotate(${rot} ${x} ${y})" fill="#fbf1dc" opacity="0.92"/>`
    )
    .join('');

/** 香菜叶。 */
const cilantro = (x, y, s = 1, rot = 0) => `
<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
  <path d="M0,0 C-16,-22 6,-46 30,-40 C26,-16 12,-2 0,0 Z" fill="#3f7a2c"/>
  <path d="M2,-2 C-8,-20 6,-38 26,-34 C22,-16 12,-4 2,-2 Z" fill="#59a03a"/>
  <path d="M4,-6 C4,-22 14,-32 26,-34" fill="none" stroke="#2f5f21" stroke-width="1.6" opacity="0.7"/>
</g>`;

const gloss = (items) =>
  items
    .map(
      ([x, y, rx, ry, o = 0.5]) =>
        `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff3d6" opacity="${o}" filter="url(#b2)"/>`
    )
    .join('');

/* ------------------------------------------------------------------ *
 * 菜品 1 —— 九转大肠
 * ------------------------------------------------------------------ */

const dachangDefs = `
  <linearGradient id="ring" x1="0.15" y1="0" x2="0.85" y2="1">
    <stop offset="0" stop-color="#f6b45a"/>
    <stop offset="0.36" stop-color="#c06c22"/>
    <stop offset="1" stop-color="#7c3a10"/>
  </linearGradient>
  <linearGradient id="dachangSauce" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#ad5f1f"/>
    <stop offset="1" stop-color="#5f2a0a"/>
  </linearGradient>`;

const dachangArt = (() => {
  const rings = [
    [-108, -46, 54, -12],
    [-18, -74, 50, 8],
    [74, -50, 52, -4],
    [126, 22, 48, 14],
    [52, 78, 51, 6],
    [-46, 76, 49, -8],
    [-124, 20, 47, 10],
    [12, 6, 44, 0],
  ];
  const ring = ([dx, dy, r, rot]) => `
  <g transform="translate(${r2(480 + dx)} ${r2(384 + dy)}) rotate(${rot})">
    <ellipse cx="0" cy="7" rx="${r}" ry="${r2(r * 0.84)}" fill="#9a8b70" opacity="0.5" filter="url(#b5)"/>
    <ellipse cx="0" cy="0" rx="${r}" ry="${r2(r * 0.84)}" fill="url(#ring)"/>
    <ellipse cx="0" cy="0" rx="${r}" ry="${r2(r * 0.84)}" fill="none" stroke="#3c1503" stroke-width="2" opacity="0.5"/>
    <ellipse cx="0" cy="0" rx="${r2(r * 0.44)}" ry="${r2(r * 0.35)}" fill="#2c1204"/>
    <ellipse cx="0" cy="0" rx="${r2(r * 0.44)}" ry="${r2(r * 0.35)}" fill="none" stroke="#a86a2c" stroke-width="2.5" opacity="0.65"/>
    <path d="M${r2(-r * 0.72)},${r2(-r * 0.36)} A${r},${r2(r * 0.84)} 0 0 1 ${r2(r * 0.5)},${r2(-r * 0.6)}" fill="none" stroke="#ffe0ad" stroke-width="4" stroke-linecap="round" opacity="0.5"/>
  </g>`;
  return `
${contact(480, 466, 238, 92, 0.4)}
<path d="M292,372 C316,300 400,262 492,266 C592,270 668,318 676,384 C684,452 606,494 500,496 C394,498 300,452 292,372 Z" fill="url(#dachangSauce)" opacity="0.92"/>
${gloss([[388, 320, 62, 18, 0.3], [566, 336, 54, 15, 0.26], [470, 452, 78, 20, 0.22]])}
${rings.map(ring).join('')}
${gloss([[-108 + 480 - 20, 384 - 46 - 24, 18, 8, 0.5], [74 + 480 - 18, 384 - 50 - 22, 16, 7, 0.45], [52 + 480 - 16, 384 + 78 - 22, 15, 7, 0.45]])}
${scallionBits([[286, 300, 22, -24], [676, 424, 20, 32], [700, 300, 18, -16]])}
${cilantro(250, 420, 1.1, -14)}
${cilantro(690, 268, 0.95, 22)}
${sesame([[420, 288, 20], [536, 282, -14], [608, 402, 30], [352, 440, 12], [468, 470, -8]])}`;
})();

/* ------------------------------------------------------------------ *
 * 菜品 2 —— 葱烧海参
 * ------------------------------------------------------------------ */

const haishenDefs = `
  <linearGradient id="hsBody" x1="0.2" y1="0" x2="0.8" y2="1">
    <stop offset="0" stop-color="#7a5540"/>
    <stop offset="0.45" stop-color="#4a2f1b"/>
    <stop offset="1" stop-color="#1e1207"/>
  </linearGradient>
  <linearGradient id="hsScallion" x1="0.1" y1="0" x2="0.9" y2="1">
    <stop offset="0" stop-color="#f2c968"/>
    <stop offset="0.45" stop-color="#d09a30"/>
    <stop offset="1" stop-color="#98601a"/>
  </linearGradient>
  <linearGradient id="hsSauce" x1="0" y1="0" x2="0.5" y2="1">
    <stop offset="0" stop-color="#b8731f"/>
    <stop offset="1" stop-color="#6b3410"/>
  </linearGradient>`;

const haishenArt = (() => {
  // 海参:纺锤形身体 + 一排疣足
  const cuke = (dx, dy, len, rot, s) => {
    const bumps = Array.from({ length: 11 }, (_, i) => {
      const t = (i + 0.5) / 11;
      const bx = r2(-len / 2 + t * len);
      const by = r2(-20 + Math.sin(t * Math.PI) * -6);
      return `<ellipse cx="${bx}" cy="${by}" rx="${r2(5 + (1 - Math.abs(t - 0.5) * 2) * 3)}" ry="4.5" fill="#3d2817" opacity="0.95"/>`;
    }).join('');
    return `
  <g transform="translate(${r2(480 + dx)} ${r2(374 + dy)}) rotate(${rot}) scale(${s})">
    <ellipse cx="0" cy="16" rx="${r2(len * 0.56)}" ry="26" fill="#9a8b70" opacity="0.45" filter="url(#b5)"/>
    <path d="M${r2(-len / 2)},0 C${r2(-len * 0.42)},-34 ${r2(len * 0.42)},-34 ${r2(len / 2)},0 C${r2(len * 0.42)},34 ${r2(-len * 0.42)},34 ${r2(-len / 2)},0 Z" fill="url(#hsBody)"/>
    ${bumps}
    <path d="M${r2(-len * 0.4)},-14 C${r2(-len * 0.14)},-24 ${r2(len * 0.14)},-24 ${r2(len * 0.4)},-14" fill="none" stroke="#8d6a48" stroke-width="5" stroke-linecap="round" opacity="0.55"/>
    <path d="M${r2(-len * 0.34)},-18 C${r2(-len * 0.1)},-26 ${r2(len * 0.12)},-26 ${r2(len * 0.34)},-18" fill="none" stroke="#d8bb92" stroke-width="2.4" stroke-linecap="round" opacity="0.45"/>
  </g>`;
  };
  // 葱段:粗壮的圆角矩形,带浅色内芯
  const seg = (x, y, w, h, rot) => `
  <g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="${r2(-w / 2)}" y="${r2(-h / 2 + 5)}" width="${w}" height="${h}" rx="${r2(h / 2)}" fill="#9a8b70" opacity="0.45" filter="url(#b5)"/>
    <rect x="${r2(-w / 2)}" y="${r2(-h / 2)}" width="${w}" height="${h}" rx="${r2(h / 2)}" fill="url(#hsScallion)"/>
    <rect x="${r2(-w / 2)}" y="${r2(-h / 2)}" width="${w}" height="${h}" rx="${r2(h / 2)}" fill="none" stroke="#8a5514" stroke-width="1.6" opacity="0.5"/>
    <ellipse cx="${r2(w / 2 - 6)}" cy="0" rx="7" ry="${r2(h / 2 - 5)}" fill="#f7e3a8" opacity="0.75"/>
    <ellipse cx="${r2(-w / 2 + 4)}" cy="${r2(-h * 0.22)}" rx="${r2(w * 0.3)}" ry="${r2(h * 0.16)}" fill="#fff0bd" opacity="0.4"/>
  </g>`;
  return `
${contact(480, 452, 246, 96, 0.4)}
<path d="M280,378 C300,306 392,268 490,272 C596,276 674,322 682,388 C690,458 604,498 494,500 C384,502 288,458 280,378 Z" fill="url(#hsSauce)" opacity="0.94"/>
${gloss([[376, 322, 70, 20, 0.28], [586, 344, 58, 16, 0.24], [470, 456, 82, 22, 0.2]])}
${cuke(-96, -44, 250, -16, 1)}
${cuke(96, 34, 232, 12, 0.94)}
${cuke(-14, 96, 196, -4, 0.8)}
${seg(376, 322, 106, 46, -28)}
${seg(566, 300, 96, 42, 20)}
${seg(608, 432, 100, 44, -12)}
${seg(320, 442, 92, 40, 16)}
${gloss([[352, 310, 24, 7, 0.55], [576, 292, 20, 6, 0.5], [614, 424, 22, 6, 0.5]])}
${cilantro(690, 262, 1, 26)}
${sesame([[452, 286, 16], [524, 468, -12], [336, 372, 28]])}`;
})();

/* ------------------------------------------------------------------ *
 * 菜品 3 —— 糖醋黄河鲤鱼
 * ------------------------------------------------------------------ */

const liyuDefs = `
  <linearGradient id="fishBody" x1="0.1" y1="0" x2="0.7" y2="1">
    <stop offset="0" stop-color="#ffd97e"/>
    <stop offset="0.42" stop-color="#eda935"/>
    <stop offset="1" stop-color="#bb7420"/>
  </linearGradient>
  <linearGradient id="fishFin" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#ffc96a" stop-opacity="0.95"/>
    <stop offset="1" stop-color="#d18f28" stop-opacity="0.85"/>
  </linearGradient>
  <linearGradient id="sweetSour" x1="0.1" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#f4741f"/>
    <stop offset="0.5" stop-color="#cf4a11"/>
    <stop offset="1" stop-color="#8e2a08"/>
  </linearGradient>
  <clipPath id="fishClip">
    <path d="M636,300 C556,282 424,280 322,294 C270,301 244,322 244,352 C244,382 270,403 322,410 C424,424 556,422 636,404 C660,400 660,304 636,300 Z"/>
  </clipPath>`;

const liyuArt = (() => {
  // 花刀:菱形网格
  const cuts = [];
  for (let i = 0; i < 7; i += 1) {
    const x = 336 + i * 44;
    cuts.push(`<path d="M${x},282 C${x + 16},320 ${x + 16},384 ${x},424" fill="none" stroke="#8d4d10" stroke-width="6" opacity="0.5"/>`);
    cuts.push(`<path d="M${x - 14},282 C${x + 4},320 ${x + 4},384 ${x - 14},424" fill="none" stroke="#f7d795" stroke-width="3" opacity="0.4"/>`);
  }
  return `
${contact(486, 428, 268, 62, 0.42)}
<path d="M636,310 C690,296 738,270 788,250 L746,344 L802,352 L746,362 L788,456 C738,436 690,410 636,396 Z" fill="url(#fishFin)"/>
<path d="M636,322 C688,308 730,288 772,268 L742,348 Z" fill="#e8a63f" opacity="0.5"/>
<path d="M700,300 C716,320 716,384 700,406" fill="none" stroke="#a35c14" stroke-width="2" opacity="0.45"/>
<path d="M744,286 C756,312 756,392 744,420" fill="none" stroke="#a35c14" stroke-width="2" opacity="0.4"/>
<path d="M636,300 C556,282 424,280 322,294 C270,301 244,322 244,352 C244,382 270,403 322,410 C424,424 556,422 636,404 C660,400 660,304 636,300 Z" fill="url(#fishBody)"/>
<g clip-path="url(#fishClip)">${cuts.join('')}</g>
<path d="M400,286 C470,278 560,280 626,292" fill="none" stroke="#ffe6ad" stroke-width="9" stroke-linecap="round" opacity="0.4"/>
<path d="M636,300 C556,282 424,280 322,294 C270,301 244,322 244,352 C244,382 270,403 322,410 C424,424 556,422 636,404 C660,400 660,304 636,300 Z" fill="none" stroke="#8a4d10" stroke-width="2.5" opacity="0.5"/>
<path d="M244,352 C244,332 260,314 300,304" fill="none" stroke="#ffe6ad" stroke-width="6" stroke-linecap="round" opacity="0.45"/>
<path d="M332,296 C316,322 316,382 332,408" fill="none" stroke="#c17c22" stroke-width="4" opacity="0.65"/>
<circle cx="296" cy="336" r="15" fill="#fdf6e6"/>
<circle cx="296" cy="336" r="9" fill="#241406"/>
<circle cx="292" cy="332" r="3" fill="#ffffff" opacity="0.9"/>
<path d="M283,300 C300,294 320,296 330,304" fill="none" stroke="#3a2008" stroke-width="3" opacity="0.4"/>
<path d="M300,404 C316,396 340,396 356,402 L356,414 C336,410 316,410 300,414 Z" fill="url(#fishFin)"/>
<path d="M436,278 C500,268 570,272 620,282 L620,296 C560,288 494,288 436,296 Z" fill="url(#fishFin)"/>
<path d="M250,346 C420,338 560,344 636,352 C560,362 420,368 250,362 Z" fill="url(#sweetSour)" opacity="0.55"/>
${gloss([[380, 330, 68, 14, 0.4], [536, 336, 54, 12, 0.34], [452, 400, 60, 12, 0.26], [252, 350, 26, 10, 0.45]])}
<g opacity="0.95">
  <path d="M300,320 C380,308 470,306 560,314" fill="none" stroke="#bfe08a" stroke-width="5" stroke-linecap="round"/>
  <path d="M320,342 C400,332 480,332 556,340" fill="none" stroke="#e6f2c4" stroke-width="4.5" stroke-linecap="round"/>
  <path d="M330,374 C410,366 480,366 548,374" fill="none" stroke="#d9532f" stroke-width="4" stroke-linecap="round"/>
</g>
${cilantro(228, 424, 1.05, -18)}
${cilantro(806, 246, 0.9, 28)}
${sesame([[420, 296, 12], [560, 292, -20], [620, 418, 26]])}`;
})();

/* ------------------------------------------------------------------ *
 * 菜品 4 —— 爆炒腰花
 * ------------------------------------------------------------------ */

const yaohuaDefs = `
  <linearGradient id="kidney" x1="0.2" y1="0" x2="0.8" y2="1">
    <stop offset="0" stop-color="#d78d54"/>
    <stop offset="0.45" stop-color="#a85c2e"/>
    <stop offset="1" stop-color="#6b3418"/>
  </linearGradient>
  <linearGradient id="wokSauce" x1="0" y1="0" x2="0.5" y2="1">
    <stop offset="0" stop-color="#a9762c"/>
    <stop offset="1" stop-color="#5f3a13"/>
  </linearGradient>
  <linearGradient id="cuke" x1="0.2" y1="0" x2="0.8" y2="1">
    <stop offset="0" stop-color="#c3d98c"/>
    <stop offset="1" stop-color="#7c9a45"/>
  </linearGradient>`;

const yaohuaArt = (() => {
  // 腰花:十字花刀后翻卷的小块
  const flower = (x, y, s, rot) => `
  <g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <path d="M-44,-40 C-14,-52 26,-50 46,-32 C54,-16 52,10 40,30 C18,48 -18,50 -40,36 C-54,18 -56,-22 -44,-40 Z" fill="url(#kidney)"/>
    <path d="M-30,-38 C-24,-14 -24,12 -30,34" fill="none" stroke="#5d2a12" stroke-width="5" opacity="0.6"/>
    <path d="M-6,-44 C0,-16 0,12 -6,40" fill="none" stroke="#5d2a12" stroke-width="5" opacity="0.6"/>
    <path d="M18,-44 C24,-18 24,10 18,38" fill="none" stroke="#5d2a12" stroke-width="5" opacity="0.6"/>
    <path d="M-38,-16 C-18,-8 18,-8 40,-16" fill="none" stroke="#5d2a12" stroke-width="5" opacity="0.6"/>
    <path d="M-40,8 C-18,16 18,16 42,8" fill="none" stroke="#5d2a12" stroke-width="5" opacity="0.6"/>
    <path d="M-26,-40 C-20,-16 -20,12 -26,34" fill="none" stroke="#d2955e" stroke-width="2" opacity="0.55"/>
    <path d="M-2,-46 C4,-18 4,12 -2,40" fill="none" stroke="#d2955e" stroke-width="2" opacity="0.55"/>
    <path d="M22,-44 C28,-18 28,10 22,36" fill="none" stroke="#d2955e" stroke-width="2" opacity="0.55"/>
    <path d="M-34,-20 C-16,-12 18,-12 38,-20" fill="none" stroke="#d2955e" stroke-width="2" opacity="0.5"/>
    <path d="M-36,4 C-16,12 18,12 40,4" fill="none" stroke="#d2955e" stroke-width="2" opacity="0.5"/>
    <path d="M-38,-38 C-20,-46 12,-46 30,-36" fill="none" stroke="#ffdcb4" stroke-width="4" stroke-linecap="round" opacity="0.45"/>
  </g>`;
  const woodEar = (x, y, s, rot) => `
  <g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <path d="M0,0 C-24,-30 -6,-58 22,-52 C48,-46 52,-14 34,6 C22,20 8,16 0,0 Z" fill="#2b1a12"/>
    <path d="M6,-6 C-8,-26 4,-44 24,-42 C40,-38 42,-16 30,-2 C20,10 12,8 6,-6 Z" fill="#472a1c" opacity="0.85"/>
    <path d="M10,-12 C0,-26 10,-38 24,-38" fill="none" stroke="#6b4630" stroke-width="2" opacity="0.7"/>
  </g>`;
  const cukeSlice = (x, y, s, rot) => `
  <g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <path d="M-26,-16 C-8,-30 16,-30 28,-14 C34,0 28,16 10,22 C-8,26 -24,14 -26,-16 Z" fill="url(#cuke)"/>
    <path d="M-16,-12 C-4,-20 12,-20 20,-10 C24,-2 20,10 8,14 C-4,18 -14,10 -16,-12 Z" fill="#dff0b4" opacity="0.7"/>
    <path d="M-22,4 C-6,12 12,12 26,2" fill="none" stroke="#5f7a33" stroke-width="2" opacity="0.5"/>
  </g>`;
  const garlic = (x, y, rot) => `
  <g transform="translate(${x} ${y}) rotate(${rot})">
    <ellipse rx="17" ry="13" fill="#f5ead4"/>
    <ellipse rx="17" ry="13" fill="none" stroke="#c9b48c" stroke-width="1.6" opacity="0.7"/>
    <ellipse cx="-4" cy="-3" rx="7" ry="5" fill="#ffffff" opacity="0.7"/>
  </g>`;
  return `
${contact(480, 458, 244, 92, 0.4)}
<path d="M296,382 C312,314 396,278 486,282 C590,286 662,330 670,392 C678,458 600,494 494,496 C388,498 288,460 296,382 Z" fill="url(#wokSauce)" opacity="0.9"/>
${gloss([[382, 330, 66, 18, 0.26], [582, 348, 52, 14, 0.22], [470, 452, 76, 20, 0.18]])}
${cukeSlice(330, 336, 1.05, -18)}
${cukeSlice(396, 452, 0.95, 12)}
${cukeSlice(636, 404, 0.9, 28)}
${woodEar(600, 300, 1, 20)}
${woodEar(374, 296, 0.85, -26)}
${woodEar(548, 456, 0.8, 8)}
${flower(430, 372, 1.02, -8)}
${flower(544, 350, 0.94, 14)}
${flower(478, 452, 0.88, 6)}
${flower(374, 430, 0.8, -16)}
${garlic(508, 300, -10)}
${garlic(346, 372, 18)}
${scallionBits([[286, 320, 22, -32], [664, 300, 20, 26], [612, 470, 18, -8]])}
${gloss([[414, 344, 20, 7, 0.5], [534, 326, 17, 6, 0.45], [470, 432, 18, 6, 0.4]])}`;
})();

/* ------------------------------------------------------------------ *
 * 输出
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * 菜品 5 —— 把子肉
 * ------------------------------------------------------------------ */

const baziDefs = `
  <linearGradient id="baziBase" x1="0.1" y1="0" x2="0.7" y2="1">
    <stop offset="0" stop-color="#d09150"/>
    <stop offset="1" stop-color="#8a4c24"/>
  </linearGradient>
  <linearGradient id="baziSauce" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#b06a22"/>
    <stop offset="1" stop-color="#632e0d"/>
  </linearGradient>
  <clipPath id="baziClip"><rect x="-102" y="-54" width="204" height="108" rx="20"/></clipPath>`;

const baziArt = (() => {
  const slab = (x, y, rot) => `
  <g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="-104" y="-46" width="208" height="112" rx="22" fill="#9a8b70" opacity="0.42" filter="url(#b5)"/>
    <rect x="-102" y="-54" width="204" height="108" rx="20" fill="url(#baziBase)"/>
    <g clip-path="url(#baziClip)">
      <rect x="-112" y="-54" width="224" height="30" fill="#95512a"/>
      <rect x="-112" y="-24" width="224" height="34" fill="#f4dcb2"/>
      <rect x="-112" y="10" width="224" height="26" fill="#743915"/>
      <rect x="-112" y="36" width="224" height="20" fill="#a25a2e"/>
      <rect x="-112" y="-56" width="224" height="14" fill="#e8ad69" opacity="0.45"/>
    </g>
    <rect x="-102" y="-54" width="204" height="108" rx="20" fill="none" stroke="#4a2208" stroke-width="2" opacity="0.45"/>
    <path d="M-108,-8 C-40,2 40,2 108,-8" fill="none" stroke="#efd9ab" stroke-width="6" opacity="0.85"/>
    <path d="M-108,8 C-40,18 40,18 108,8" fill="none" stroke="#d3ad6c" stroke-width="5" opacity="0.75"/>
    <circle cx="30" cy="0" r="9" fill="#f5e2ba"/>
  </g>`;
  return `
${contact(490, 470, 252, 98, 0.4)}
<path d="M286,378 C306,308 396,272 488,276 C592,280 668,324 676,388 C684,456 600,498 492,500 C384,502 278,456 286,378 Z" fill="url(#baziSauce)" opacity="0.92"/>
${slab(388, 328, -13)}
${slab(598, 344, 11)}
${slab(492, 452, 3)}
${gloss([[292, 344, 40, 13, 0.2], [676, 396, 34, 12, 0.18], [494, 296, 46, 12, 0.16]])}
${scallionBits([[286, 298, 24, -26], [690, 300, 22, 24]])}
${sesame([[452, 288, 14], [548, 296, -18], [340, 442, 22]])}`;
})();

/* ------------------------------------------------------------------ *
 * 菜品 6 —— 四喜丸子
 * ------------------------------------------------------------------ */

const wanziDefs = `
  <radialGradient id="ball" cx="0.34" cy="0.28" r="0.8">
    <stop offset="0" stop-color="#e6a86c"/>
    <stop offset="0.42" stop-color="#b8703a"/>
    <stop offset="1" stop-color="#743a17"/>
  </radialGradient>
  <linearGradient id="wanziSauce" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#b06a20"/>
    <stop offset="1" stop-color="#632e0c"/>
  </linearGradient>
  <linearGradient id="greens" x1="0.2" y1="0" x2="0.8" y2="1">
    <stop offset="0" stop-color="#8fbe55"/>
    <stop offset="1" stop-color="#3f6a26"/>
  </linearGradient>
  <linearGradient id="shiitake" x1="0.2" y1="0" x2="0.8" y2="1">
    <stop offset="0" stop-color="#77502f"/>
    <stop offset="1" stop-color="#3a2113"/>
  </linearGradient>`;

const wanziArt = (() => {
  const ball = (x, y, r) => {
    const dots = Array.from({ length: 15 }, (_, i) => {
      const a = (i * 137.5 * Math.PI) / 180;
      const rr = r * (0.18 + (i % 5) * 0.16);
      return `<circle cx="${r2(Math.cos(a) * rr)}" cy="${r2(Math.sin(a) * rr)}" r="${r2(2.4 + (i % 3))}" fill="#7a3d18" opacity="0.42"/>`;
    }).join('');
    return `
  <g transform="translate(${x} ${y})">
    <ellipse cx="0" cy="${r2(r * 0.66)}" rx="${r2(r * 0.98)}" ry="${r2(r * 0.58)}" fill="#9a8b70" opacity="0.45" filter="url(#b12)"/>
    <circle r="${r}" fill="url(#ball)"/>
    ${dots}
    <circle r="${r}" fill="none" stroke="#5c2c12" stroke-width="2" opacity="0.4"/>
    <path d="M${r2(-r * 0.64)},${r2(-r * 0.46)} A${r},${r} 0 0 1 ${r2(r * 0.46)},${r2(-r * 0.64)}" fill="none" stroke="#ffdcb0" stroke-width="7" stroke-linecap="round" opacity="0.45"/>
    <ellipse cx="${r2(-r * 0.28)}" cy="${r2(-r * 0.36)}" rx="${r2(r * 0.22)}" ry="${r2(r * 0.12)}" fill="#fff3da" opacity="0.45" filter="url(#b2)"/>
  </g>`;
  };
  const bokchoy = (x, y, s, rot) => `
  <g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <path d="M0,0 C-32,-24 -36,-64 -6,-88 C24,-64 22,-24 0,0 Z" fill="url(#greens)"/>
    <path d="M0,0 C-12,-26 -14,-60 -4,-84" fill="none" stroke="#eaf5d2" stroke-width="9" stroke-linecap="round" opacity="0.9"/>
    <path d="M0,-8 C-8,-32 -8,-58 0,-80" fill="none" stroke="#3f6a26" stroke-width="2" opacity="0.45"/>
  </g>`;
  const shiitake = (x, y, s, rot) => `
  <g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <ellipse rx="32" ry="25" fill="#9a8b70" opacity="0.4" filter="url(#b5)"/>
    <ellipse rx="32" ry="25" fill="url(#shiitake)"/>
    <ellipse rx="32" ry="25" fill="none" stroke="#2a160c" stroke-width="2" opacity="0.6"/>
    <path d="M-21,-8 C-6,-17 8,-17 21,-8" fill="none" stroke="#b08c62" stroke-width="3" opacity="0.5"/>
    <ellipse cx="-9" cy="-8" rx="11" ry="6" fill="#c9a985" opacity="0.35"/>
  </g>`;
  return `
${contact(490, 456, 250, 100, 0.4)}
<path d="M288,380 C304,312 394,276 486,280 C590,284 666,326 674,390 C682,458 598,496 492,498 C386,500 280,458 288,380 Z" fill="url(#wanziSauce)" opacity="0.9"/>
${bokchoy(318, 300, 0.95, -34)}
${bokchoy(648, 292, 0.9, 32)}
${bokchoy(344, 470, 0.86, -8)}
${bokchoy(628, 466, 0.9, 18)}
${ball(412, 322, 66)}
${ball(560, 314, 68)}
${ball(430, 440, 64)}
${ball(578, 434, 66)}
${shiitake(494, 262, 0.9, -8)}
${shiitake(300, 396, 0.72, 26)}
${gloss([[384, 292, 34, 12, 0.22], [566, 288, 30, 11, 0.2]])}
${scallionBits([[492, 232, 22, -6], [276, 348, 20, 28]])}
${sesame([[470, 268, 16], [524, 470, -14]])}`;
})();

/* ------------------------------------------------------------------ *
 * 菜品 7 —— 油焖大虾
 * ------------------------------------------------------------------ */

const xiaDefs = `
  <linearGradient id="prawn" x1="0.1" y1="0" x2="0.8" y2="1">
    <stop offset="0" stop-color="#ffa35c"/>
    <stop offset="0.45" stop-color="#ea5c22"/>
    <stop offset="1" stop-color="#b23109"/>
  </linearGradient>
  <linearGradient id="prawnHead" x1="0.2" y1="0" x2="0.8" y2="1">
    <stop offset="0" stop-color="#ff9a4c"/>
    <stop offset="1" stop-color="#c03a0e"/>
  </linearGradient>
  <linearGradient id="xiaSauce" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#cf6a1a"/>
    <stop offset="1" stop-color="#872f08"/>
  </linearGradient>`;

const xiaArt = (() => {
  const prawn = (x, y, rot, s) => `
  <g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <ellipse cx="-6" cy="16" rx="92" ry="22" fill="#9a8b70" opacity="0.4" filter="url(#b5)"/>
    <path d="M-104,-4 C-136,-22 -158,-40 -180,-54" fill="none" stroke="#d2451a" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M-100,6 C-134,2 -158,-4 -182,-8" fill="none" stroke="#d2451a" stroke-width="3" stroke-linecap="round"/>
    <path d="M-64,4 C-38,-38 30,-48 74,-8" fill="none" stroke="url(#prawn)" stroke-width="40" stroke-linecap="round"/>
    <path d="M22,-40 C38,-44 54,-38 64,-28" fill="none" stroke="#a52f0b" stroke-width="3" opacity="0.5"/>
    <path d="M-8,-40 C12,-48 32,-46 46,-36" fill="none" stroke="#a52f0b" stroke-width="3" opacity="0.5"/>
    <path d="M-34,-32 C-16,-44 6,-48 26,-42" fill="none" stroke="#a52f0b" stroke-width="3" opacity="0.5"/>
    <path d="M-46,-20 C-32,-32 -16,-38 2,-38" fill="none" stroke="#ffcf9e" stroke-width="4" stroke-linecap="round" opacity="0.45"/>
    <ellipse cx="-76" cy="2" rx="30" ry="27" fill="url(#prawnHead)"/>
    <ellipse cx="-76" cy="2" rx="30" ry="27" fill="none" stroke="#8e2406" stroke-width="2" opacity="0.45"/>
    <circle cx="-88" cy="-6" r="5" fill="#1c0d04"/>
    <circle cx="-90" cy="-8" r="2" fill="#ffffff" opacity="0.85"/>
    <path d="M-70,-19 C-58,-29 -42,-31 -32,-25" fill="none" stroke="#ffd7ab" stroke-width="5" stroke-linecap="round" opacity="0.5"/>
    <path d="M74,-8 L114,-34 L100,-6 L116,24 L76,10 Z" fill="#cf360d"/>
    <path d="M78,-6 L106,-26 L96,-8" fill="#ffa165" opacity="0.5"/>
  </g>`;
  /* 六只虾呈风车状放射,虾头聚在盘心、虾尾向外,是经典的油焖大虾摆法 */
  const ring = Array.from({ length: 6 }, (_, i) => {
    const deg = i * 60 - 90;
    const a = (deg * Math.PI) / 180;
    return prawn(r2(480 + Math.cos(a) * 88), r2(372 + Math.sin(a) * 88), deg, 0.74);
  }).join('');
  return `
${contact(484, 452, 250, 100, 0.38)}
<path d="M292,378 C308,312 396,276 488,280 C592,284 664,326 672,390 C680,456 598,496 492,498 C386,500 284,456 292,378 Z" fill="url(#xiaSauce)" opacity="0.88"/>
${ring}
${gloss([[396, 292, 40, 13, 0.22], [592, 336, 34, 12, 0.2], [496, 468, 44, 14, 0.16]])}
${scallionBits([[420, 216, 24, -12], [574, 214, 22, 14], [286, 352, 20, 32]])}`;
})();

/* ------------------------------------------------------------------ *
 * 菜品 8 —— 奶汤蒲菜
 * ------------------------------------------------------------------ */

const naifanDefs = `
  <radialGradient id="milkySoup" cx="0.42" cy="0.34" r="0.78">
    <stop offset="0" stop-color="#fffbf1"/>
    <stop offset="0.55" stop-color="#f6efdd"/>
    <stop offset="1" stop-color="#ddd0b4"/>
  </radialGradient>
  <linearGradient id="pucai" x1="0.2" y1="0" x2="0.8" y2="1">
    <stop offset="0" stop-color="#f6f6e2"/>
    <stop offset="1" stop-color="#c6cfa0"/>
  </linearGradient>
  <linearGradient id="ham" x1="0.2" y1="0" x2="0.8" y2="1">
    <stop offset="0" stop-color="#e9947a"/>
    <stop offset="1" stop-color="#b04c3c"/>
  </linearGradient>`;

const naifanArt = (() => {
  const shoot = (x, y, w, rot) => `
  <g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="${r2(-w / 2)}" y="-9" width="${w}" height="26" rx="13" fill="#b8a882" opacity="0.3" filter="url(#b5)"/>
    <rect x="${r2(-w / 2)}" y="-15" width="${w}" height="26" rx="13" fill="url(#pucai)"/>
    <rect x="${r2(-w / 2)}" y="-15" width="${w}" height="26" rx="13" fill="none" stroke="#9aa878" stroke-width="1.6" opacity="0.6"/>
    <ellipse cx="${r2(w / 2 - 4)}" cy="-3" rx="5" ry="9" fill="#fdfdf2" opacity="0.85"/>
    <path d="M${r2(-w / 2 + 10)},-9 C${r2(-w / 6)},-16 ${r2(w / 6)},-16 ${r2(w / 2 - 12)},-8" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.6"/>
  </g>`;
  const ham = (x, y, rot) => `
  <g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="-30" y="-8" width="60" height="16" rx="6" fill="url(#ham)"/>
    <rect x="-30" y="-8" width="60" height="7" rx="3.5" fill="#f6c0ad" opacity="0.6"/>
  </g>`;
  return `
${contact(480, 470, 236, 88, 0.3)}
<ellipse cx="480" cy="380" rx="238" ry="168" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.5"/>
<path d="M300,330 C360,300 470,292 566,314" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.35"/>
<path d="M330,442 C400,470 520,472 600,444" fill="none" stroke="#cbbfa2" stroke-width="3" opacity="0.4"/>
${shoot(392, 300, 150, -12)}
${shoot(548, 320, 140, 10)}
${shoot(344, 396, 132, 6)}
${shoot(502, 420, 146, -8)}
${shoot(600, 384, 124, 16)}
${shoot(444, 356, 138, 2)}
${shoot(478, 262, 112, -4)}
${ham(340, 350, -8)}
${ham(608, 300, 12)}
${ham(556, 452, 4)}
${cilantro(654, 452, 0.8, 24)}
${scallionBits([[392, 462, 20, 8], [560, 268, 18, -10]])}
${gloss([[416, 336, 46, 14, 0.3], [566, 396, 40, 12, 0.26]])}`;
})();

/* ------------------------------------------------------------------ *
 * 菜品 9 —— 五香熏鱼
 * ------------------------------------------------------------------ */

const xunyuDefs = `
  <linearGradient id="xunyu" x1="0.15" y1="0" x2="0.8" y2="1">
    <stop offset="0" stop-color="#d08d42"/>
    <stop offset="0.45" stop-color="#93511e"/>
    <stop offset="1" stop-color="#4f2709"/>
  </linearGradient>
  <linearGradient id="xunyuSauce" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#9c5a20"/>
    <stop offset="1" stop-color="#542708"/>
  </linearGradient>`;

const xunyuArt = (() => {
  const chunk = (x, y, s, rot) => `
  <g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <path d="M-70,-26 C-40,-46 30,-46 64,-24 C78,-12 76,18 58,32 C24,50 -36,48 -62,30 C-78,18 -80,-12 -70,-26 Z" fill="#9a8b70" opacity="0.4" filter="url(#b5)"/>
    <path d="M-70,-30 C-40,-50 30,-50 64,-28 C78,-16 76,14 58,28 C24,46 -36,44 -62,26 C-78,14 -80,-16 -70,-30 Z" fill="url(#xunyu)"/>
    <path d="M-56,-18 C-26,-30 22,-30 52,-16" fill="none" stroke="#77390f" stroke-width="3" opacity="0.55"/>
    <path d="M-56,-2 C-26,-14 22,-14 52,0" fill="none" stroke="#77390f" stroke-width="3" opacity="0.55"/>
    <path d="M-52,12 C-24,2 20,2 46,14" fill="none" stroke="#77390f" stroke-width="3" opacity="0.55"/>
    <path d="M-62,-28 C-32,-40 24,-40 58,-26" fill="none" stroke="#f5c98f" stroke-width="5" stroke-linecap="round" opacity="0.45"/>
    <path d="M-64,-18 C-30,-32 20,-32 56,-18" fill="none" stroke="#ffe9c8" stroke-width="3" stroke-linecap="round" opacity="0.3"/>
  </g>`;
  return `
${contact(484, 462, 246, 94, 0.4)}
<path d="M300,382 C318,314 400,280 490,284 C592,288 662,330 668,392 C674,458 596,494 492,496 C388,498 292,458 300,382 Z" fill="url(#xunyuSauce)" opacity="0.9"/>
${chunk(392, 320, 1, -16)}
${chunk(566, 316, 0.95, 12)}
${chunk(480, 380, 1.02, -4)}
${chunk(348, 430, 0.9, 8)}
${chunk(616, 428, 0.88, -14)}
${chunk(494, 464, 0.84, 4)}
${gloss([[386, 296, 34, 11, 0.24], [578, 296, 30, 10, 0.22], [486, 448, 36, 12, 0.18]])}
<g opacity="0.95">
  <path d="M348,268 C420,258 520,258 596,272" fill="none" stroke="#cfe894" stroke-width="5" stroke-linecap="round"/>
  <path d="M372,292 C440,282 528,284 596,296" fill="none" stroke="#eef5cc" stroke-width="4" stroke-linecap="round"/>
</g>
${cilantro(276, 452, 0.9, -14)}
${sesame([[452, 268, 12], [548, 462, -16]])}`;
})();

/* ------------------------------------------------------------------ *
 * 菜品 10 —— 鲁味酱牛肉
 * ------------------------------------------------------------------ */

const niurouDefs = `
  <linearGradient id="beef" x1="0.15" y1="0" x2="0.85" y2="1">
    <stop offset="0" stop-color="#b45f42"/>
    <stop offset="0.45" stop-color="#883d27"/>
    <stop offset="1" stop-color="#572312"/>
  </linearGradient>
  <linearGradient id="niurouSauce" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#8e4a1c"/>
    <stop offset="1" stop-color="#4a2008"/>
  </linearGradient>`;

const niurouArt = (() => {
  const slice = (x, y, rot) => `
  <g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="-70" y="-22" width="140" height="54" rx="12" fill="#9a8b70" opacity="0.4" filter="url(#b5)"/>
    <rect x="-70" y="-30" width="140" height="54" rx="12" fill="url(#beef)"/>
    <rect x="-70" y="-30" width="140" height="54" rx="12" fill="none" stroke="#3a170a" stroke-width="3" opacity="0.6"/>
    <path d="M-58,-18 C-40,-25 -20,-23 -4,-15" fill="none" stroke="#e8bf9a" stroke-width="3" opacity="0.45"/>
    <path d="M-56,0 C-30,-8 -4,-8 22,0" fill="none" stroke="#e8bf9a" stroke-width="3" opacity="0.4"/>
    <path d="M-42,14 C-18,8 8,8 30,14" fill="none" stroke="#e8bf9a" stroke-width="3" opacity="0.35"/>
    <path d="M44,-16 C54,-6 54,6 46,18" fill="none" stroke="#e8bf9a" stroke-width="3" opacity="0.4"/>
    <path d="M-64,-25 C-40,-34 -12,-34 10,-27" fill="none" stroke="#ffdcc0" stroke-width="4" stroke-linecap="round" opacity="0.4"/>
  </g>`;
  return `
${contact(484, 458, 248, 96, 0.4)}
<path d="M296,380 C314,312 398,278 488,282 C592,286 664,328 670,392 C676,458 596,494 492,496 C388,498 288,458 296,380 Z" fill="url(#niurouSauce)" opacity="0.88"/>
${slice(400, 302, -22)}
${slice(508, 292, -8)}
${slice(612, 318, 8)}
${slice(376, 388, -6)}
${slice(490, 382, 4)}
${slice(596, 400, 16)}
${slice(468, 462, -2)}
${gloss([[452, 264, 40, 12, 0.18], [614, 356, 34, 11, 0.16]])}
<g opacity="0.95">
  <path d="M336,272 C404,258 512,256 606,272" fill="none" stroke="#cfe894" stroke-width="5" stroke-linecap="round"/>
  <path d="M360,296 C430,284 520,284 604,298" fill="none" stroke="#f0f7d6" stroke-width="4" stroke-linecap="round"/>
</g>
${cilantro(268, 424, 0.95, -18)}
${sesame([[464, 270, 10], [560, 460, -12]])}`;
})();

/* ------------------------------------------------------------------ *
 * 菜品 11 —— 山东大煎饼
 * ------------------------------------------------------------------ */

const jianbingDefs = `
  <linearGradient id="pancake" x1="0.1" y1="0" x2="0.7" y2="1">
    <stop offset="0" stop-color="#f7ddab"/>
    <stop offset="0.42" stop-color="#dcae5f"/>
    <stop offset="1" stop-color="#ab7830"/>
  </linearGradient>
  <linearGradient id="bread" x1="0.1" y1="0" x2="0.7" y2="1">
    <stop offset="0" stop-color="#fbe8c0"/>
    <stop offset="1" stop-color="#d8b077"/>
  </linearGradient>
  <linearGradient id="scallionStalk" x1="0" y1="0" x2="1" y2="0.3">
    <stop offset="0" stop-color="#f4f6e4"/>
    <stop offset="0.55" stop-color="#e8efd0"/>
    <stop offset="1" stop-color="#6f9c3e"/>
  </linearGradient>`;

const jianbingArt = (() => {
  const roll = (x, y, len, w, rot) => {
    const flecks = Array.from({ length: 12 }, (_, i) => {
      const t = (i + 1) / 13;
      return `<ellipse cx="${r2(-len / 2 + t * len)}" cy="${r2(-w * 0.2 + (i % 3) * w * 0.24)}" rx="4" ry="2.6" fill="#8a5c22" opacity="0.45"/>`;
    }).join('');
    return `
  <g transform="translate(${x} ${y}) rotate(${rot})">
    <rect x="${r2(-len / 2)}" y="${r2(-w / 2 + 9)}" width="${len}" height="${w}" rx="${r2(w / 2)}" fill="#a3947a" opacity="0.45" filter="url(#b12)"/>
    <rect x="${r2(-len / 2)}" y="${r2(-w / 2)}" width="${len}" height="${w}" rx="${r2(w / 2)}" fill="url(#pancake)"/>
    <rect x="${r2(-len / 2)}" y="${r2(-w / 2)}" width="${len}" height="${w}" rx="${r2(w / 2)}" fill="none" stroke="#8a5c22" stroke-width="2" opacity="0.5"/>
    ${flecks}
    <rect x="${r2(-len / 2 + 12)}" y="${r2(-w * 0.3)}" width="${r2(len - 34)}" height="${r2(w * 0.16)}" rx="${r2(w * 0.08)}" fill="#ffffff" opacity="0.32"/>
    <ellipse cx="${r2(len / 2 - 6)}" cy="0" rx="13" ry="${r2(w / 2 - 4)}" fill="#f2d9a4"/>
    <ellipse cx="${r2(len / 2 - 6)}" cy="0" rx="13" ry="${r2(w / 2 - 4)}" fill="none" stroke="#a87a34" stroke-width="1.6" opacity="0.7"/>
    <path d="M${r2(len / 2 - 6)},${r2(-w / 2 + 8)} C${r2(len / 2 - 22)},${r2(-w * 0.1)} ${r2(len / 2 - 22)},${r2(w * 0.1)} ${r2(len / 2 - 6)},${r2(w / 2 - 8)}" fill="none" stroke="#a87a34" stroke-width="3" opacity="0.7"/>
    <path d="M${r2(len / 2 - 6)},${r2(-w / 2 + 10)} C${r2(len / 2 - 8)},0 ${r2(len / 2 - 8)},0 ${r2(len / 2 - 6)},${r2(w / 2 - 10)}" fill="none" stroke="#a87a34" stroke-width="2" opacity="0.5"/>
  </g>`;
  };
  return `
${roll(470, 300, 430, 116, -14)}
${roll(496, 404, 412, 108, 8)}
<g transform="translate(656 494) rotate(-20)">
  <rect x="-146" y="-17" width="292" height="34" rx="17" fill="#a3947a" opacity="0.4" filter="url(#b12)"/>
  <rect x="-146" y="-20" width="292" height="34" rx="17" fill="url(#scallionStalk)"/>
  <rect x="-146" y="-20" width="292" height="34" rx="17" fill="none" stroke="#8aa05a" stroke-width="2" opacity="0.6"/>
  <path d="M-120,-14 C-40,-26 60,-26 128,-10" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.5"/>
</g>
<g transform="translate(262 474)">
  <ellipse cx="0" cy="12" rx="66" ry="26" fill="#a3947a" opacity="0.45" filter="url(#b5)"/>
  <ellipse rx="62" ry="40" fill="url(#bread)"/>
  <ellipse rx="62" ry="40" fill="none" stroke="#a87a44" stroke-width="2" opacity="0.6"/>
  <ellipse rx="46" ry="29" fill="#4a2408"/>
  <ellipse rx="46" ry="29" fill="none" stroke="#7a3f12" stroke-width="2" opacity="0.7"/>
  <ellipse cx="-12" cy="-8" rx="18" ry="9" fill="#8a5220" opacity="0.7"/>
</g>
${gloss([[352, 250, 44, 10, 0.28], [430, 388, 40, 10, 0.24]])}`;
})();

/* ------------------------------------------------------------------ *
 * 菜品 12 —— 拔丝山药
 * ------------------------------------------------------------------ */

const bashiDefs = `
  <linearGradient id="yam" x1="0.15" y1="0" x2="0.85" y2="1">
    <stop offset="0" stop-color="#ffe6ae"/>
    <stop offset="0.45" stop-color="#f0c977"/>
    <stop offset="1" stop-color="#cd9c40"/>
  </linearGradient>
  <linearGradient id="caramel" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#f2b34a"/>
    <stop offset="1" stop-color="#b86e14"/>
  </linearGradient>`;

const bashiArt = (() => {
  const cube = (x, y, s, rot) => `
  <g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
    <rect x="-34" y="-24" width="68" height="60" rx="12" fill="#a3947a" opacity="0.4" filter="url(#b5)"/>
    <rect x="-34" y="-30" width="68" height="60" rx="12" fill="url(#yam)"/>
    <rect x="-34" y="-30" width="68" height="60" rx="12" fill="none" stroke="#b98528" stroke-width="2" opacity="0.55"/>
    <rect x="-34" y="-30" width="68" height="22" rx="11" fill="#e0a33c" opacity="0.35"/>
    <path d="M-26,-20 C-10,-28 10,-28 26,-20" fill="none" stroke="#fff6dc" stroke-width="5" stroke-linecap="round" opacity="0.55"/>
    <rect x="-30" y="16" width="60" height="12" rx="6" fill="#b8791c" opacity="0.3"/>
  </g>`;
  const strand = (d) => `<path d="${d}" fill="none" stroke="url(#caramel)" stroke-width="7" stroke-linecap="round" opacity="0.9"/>`;
  return `
${contact(484, 460, 244, 92, 0.35)}
<path d="M336,392 C356,330 420,300 492,302 C574,304 636,338 646,394 C654,452 588,486 494,488 C400,490 330,454 336,392 Z" fill="url(#caramel)" opacity="0.35"/>
${cube(396, 316, 1, -12)}
${cube(506, 300, 0.96, 6)}
${cube(608, 336, 0.92, 14)}
${cube(360, 414, 0.94, 4)}
${cube(480, 388, 1.02, -6)}
${cube(592, 430, 0.9, 10)}
${cube(432, 470, 0.88, -8)}
${cube(534, 466, 0.86, 6)}
${strand('M414,296 C452,258 528,258 596,300')}
${strand('M382,376 C432,344 540,344 600,392')}
${strand('M446,438 C492,414 546,420 588,452')}
${strand('M360,338 C384,352 400,376 396,404')}
${gloss([[376, 292, 30, 11, 0.4], [486, 278, 26, 10, 0.36], [572, 414, 24, 9, 0.32]])}
${sesame([[452, 276, 12], [548, 448, -14]])}`;
})();

/* ------------------------------------------------------------------ *
 * 菜品 13 —— 德州扒鸡
 * ------------------------------------------------------------------ */

const bajiDefs = `
  <linearGradient id="chicken" x1="0.15" y1="0" x2="0.8" y2="1">
    <stop offset="0" stop-color="#f7cd7a"/>
    <stop offset="0.4" stop-color="#e0a33c"/>
    <stop offset="1" stop-color="#a4651e"/>
  </linearGradient>
  <linearGradient id="chickenDark" x1="0.2" y1="0" x2="0.8" y2="1">
    <stop offset="0" stop-color="#e8b455"/>
    <stop offset="1" stop-color="#9a5c1a"/>
  </linearGradient>
  <linearGradient id="bajiSauce" x1="0" y1="0" x2="0.6" y2="1">
    <stop offset="0" stop-color="#b4701f"/>
    <stop offset="1" stop-color="#6a3410"/>
  </linearGradient>`;

const bajiArt = (() => `
${contact(486, 466, 250, 96, 0.42)}
<path d="M300,382 C318,314 400,280 490,284 C592,288 662,330 668,392 C674,458 596,494 492,496 C388,498 292,458 300,382 Z" fill="url(#bajiSauce)" opacity="0.88"/>
<g transform="translate(486 400) scale(0.92)">
  <path d="M-104,58 C-114,108 -86,132 -56,122 C-30,114 -20,92 -30,66 Z" fill="url(#chickenDark)" stroke="#8a5216" stroke-width="2.5"/>
  <path d="M88,58 C100,108 72,132 42,122 C16,114 6,92 16,66 Z" fill="url(#chickenDark)" stroke="#8a5216" stroke-width="2.5"/>
  <ellipse rx="166" ry="112" fill="url(#chicken)"/>
  <ellipse rx="166" ry="112" fill="none" stroke="#8a5216" stroke-width="3" opacity="0.55"/>
  <path d="M-24,-50 C42,-80 126,-58 140,-6 C146,36 100,62 46,58 C-6,54 -40,20 -24,-50 Z" fill="#eab85c" opacity="0.45" stroke="#a86a1e" stroke-width="2.5"/>
  <path d="M-100,-92 C-126,-140 -112,-186 -80,-204 L-38,-182 C-58,-150 -72,-120 -78,-88 Z" fill="url(#chicken)" stroke="#8a5216" stroke-width="2.5"/>
  <ellipse cx="-78" cy="-208" rx="36" ry="30" fill="url(#chicken)" stroke="#8a5216" stroke-width="2.5"/>
  <path d="M-112,-212 L-152,-200 L-112,-188 Z" fill="#e0a53a"/>
  <circle cx="-88" cy="-216" r="5.5" fill="#a3947a"/>
  <circle cx="-90" cy="-218" r="2" fill="#ffffff" opacity="0.85"/>
  <path d="M-74,-238 C-58,-256 -34,-256 -22,-242 C-38,-234 -58,-232 -74,-238 Z" fill="#c53a1c"/>
  <path d="M-120,-56 C-88,-84 -30,-92 24,-80" fill="none" stroke="#ffe3b0" stroke-width="9" stroke-linecap="round" opacity="0.4"/>
  <path d="M-92,26 C-40,4 40,2 96,22" fill="none" stroke="#ffe3b0" stroke-width="7" stroke-linecap="round" opacity="0.3"/>
</g>
${gloss([[352, 300, 44, 13, 0.2], [620, 336, 38, 12, 0.18], [470, 462, 50, 14, 0.16]])}
${cilantro(268, 442, 0.95, -16)}
${scallionBits([[286, 316, 24, -28], [688, 388, 22, 26]])}
${sesame([[452, 272, 12], [568, 300, -16]])}`)();

const FILES = [
  {
    name: 'dish-jiuzhuandachang',
    defs: dachangDefs,
    container: plate(),
    art: dachangArt,
    steam: [480, 236, 62],
  },
  {
    name: 'dish-congshaohaishen',
    defs: haishenDefs,
    container: plate(),
    art: haishenArt,
    steam: [480, 236, 62],
  },
  {
    name: 'dish-tangculiyu',
    defs: liyuDefs,
    container: plate({ rx: 340, ry: 230 }),
    art: liyuArt,
    steam: [480, 252, 76],
  },
  {
    name: 'dish-baochaoyaohua',
    defs: yaohuaDefs,
    container: plate(),
    art: yaohuaArt,
    steam: [480, 236, 62],
  },
  {
    name: 'dish-bazirou',
    defs: baziDefs,
    container: plate(),
    art: baziArt,
    steam: [480, 244, 58],
  },
  {
    name: 'dish-sixiwanzi',
    defs: wanziDefs,
    container: plate(),
    art: wanziArt,
    steam: [480, 240, 60],
  },
  {
    name: 'dish-youmendaxia',
    defs: xiaDefs,
    container: plate(),
    art: xiaArt,
    steam: [480, 236, 62],
  },
  {
    name: 'dish-naitangpucai',
    defs: naifanDefs,
    container: bowl({ surface: 'url(#milkySoup)' }),
    art: naifanArt,
    steam: [480, 208, 54],
  },
  {
    name: 'dish-wuxiangxunyu',
    defs: xunyuDefs,
    container: plate(),
    art: xunyuArt,
    steam: [480, 248, 54],
  },
  {
    name: 'dish-jiangniurou',
    defs: niurouDefs,
    container: plate(),
    art: niurouArt,
    steam: null,
  },
  {
    name: 'dish-shandongjianbing',
    defs: jianbingDefs,
    container: board({ w: 660, h: 430 }),
    art: jianbingArt,
    steam: [480, 210, 50],
  },
  {
    name: 'dish-basishanyao',
    defs: bashiDefs,
    container: plate(),
    art: bashiArt,
    steam: [480, 246, 52],
  },
  {
    name: 'dish-dezhoubaji',
    defs: bajiDefs,
    container: plate(),
    art: bajiArt,
    steam: [480, 240, 60],
  },
];

/* ------------------------------------------------------------------ *
 * 英雄图 —— 葱烧海参特写(盘子更大、光更足)
 * ------------------------------------------------------------------ */

const heroSvg = scene(
  `<ellipse cx="486" cy="392" rx="470" ry="330" fill="url(#heroGlow)"/>
${plate({ cx: 484, cy: 372, rx: 336, ry: 246 })}
<g transform="translate(484 366) scale(1.05) translate(-480 -366)">${haishenArt}</g>
<g opacity="0.55">${steam(470, 196, 74)}</g>`,
  {
    defs: `${haishenDefs}
  <radialGradient id="heroGlow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#ff9c3c" stop-opacity="0.30"/>
    <stop offset="1" stop-color="#ff9c3c" stop-opacity="0"/>
  </radialGradient>`,
    light: [286, 150, 600],
  }
);

/* ------------------------------------------------------------------ *
 * 门店环境 —— 4 张横幅场景
 * ------------------------------------------------------------------ */

const envDefs = `
  <radialGradient id="wallLight" cx="0.5" cy="0.1" r="0.9">
    <stop offset="0" stop-color="#fff6e2" stop-opacity="0.95"/>
    <stop offset="1" stop-color="#fff6e2" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="fireGlow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#ffa63c" stop-opacity="0.42"/>
    <stop offset="0.5" stop-color="#ff8a20" stop-opacity="0.14"/>
    <stop offset="1" stop-color="#ff7a10" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="lampGlow" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#ffcf8e" stop-opacity="0.4"/>
    <stop offset="1" stop-color="#ffcf8e" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#cfe2ee"/>
    <stop offset="0.5" stop-color="#e6eee9"/>
    <stop offset="1" stop-color="#f7f1e4"/>
  </linearGradient>
  <linearGradient id="floor" x1="0" y1="0" x2="0.2" y2="1">
    <stop offset="0" stop-color="#f0e8db"/>
    <stop offset="1" stop-color="#ded3c0"/>
  </linearGradient>
  <linearGradient id="woodTop" x1="0" y1="0" x2="0.3" y2="1">
    <stop offset="0" stop-color="#eed0a8"/>
    <stop offset="0.5" stop-color="#d3a974"/>
    <stop offset="1" stop-color="#b28651"/>
  </linearGradient>
  <linearGradient id="porc" x1="0.1" y1="0" x2="0.9" y2="1">
    <stop offset="0" stop-color="#ffffff"/>
    <stop offset="0.45" stop-color="#f7f0e4"/>
    <stop offset="1" stop-color="#dcd0ba"/>
  </linearGradient>`;

/** 明档厨房 */
const envKitchen = (() => {
  const tiles = [];
  for (let c = 0; c <= 10; c += 1) tiles.push(`<path d="M${c * 96},0 L${c * 96},336" stroke="#cdc2b0" stroke-width="1.5" opacity="0.55"/>`);
  for (let r = 0; r <= 5; r += 1) tiles.push(`<path d="M0,${r * 72} L960,${r * 72}" stroke="#cdc2b0" stroke-width="1.5" opacity="0.55"/>`);
  const pans = [[148, 196, 46], [252, 168, 38], [346, 200, 32]]
    .map(
      ([x, y, r]) => `
  <g>
    <path d="M${x},0 L${x},${y - r}" stroke="#c2b6a2" stroke-width="2" opacity="0.8"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="#46423c" stroke="#9a9184" stroke-width="3"/>
    <path d="M${x - r * 0.7},${y - r * 0.55} A${r},${r} 0 0 1 ${x + r * 0.5},${y - r * 0.75}" fill="none" stroke="#f6efe0" stroke-width="3" opacity="0.45"/>
  </g>`
    )
    .join('');
  return `
<rect width="960" height="640" fill="#f4efe6"/>
<rect width="960" height="344" fill="url(#wallLight)"/>
${tiles.join('')}
${pans}
<rect y="336" width="960" height="62" fill="#ebe2d3"/>
<rect y="398" width="960" height="30" fill="#d9d3c7" opacity="0.95"/>
<rect y="428" width="960" height="212" fill="#f0e9dd"/>
<ellipse cx="480" cy="420" rx="340" ry="130" fill="url(#fireGlow)"/>
<rect x="278" y="392" width="404" height="26" rx="9" fill="#cfc8bc"/>
<ellipse cx="480" cy="392" rx="154" ry="30" fill="#4e4840"/>
<ellipse cx="480" cy="388" rx="140" ry="24" fill="#3b3731"/>
<ellipse cx="480" cy="386" rx="122" ry="18" fill="#2a2724"/>
<path d="M368,388 C400,350 430,368 452,330 C470,368 500,346 520,384 C540,350 566,370 590,388 Z" fill="#ff9a34" opacity="0.85"/>
<path d="M404,386 C428,358 448,372 462,344 C478,372 500,356 514,384 Z" fill="#ffd07a" opacity="0.9"/>
<ellipse cx="480" cy="386" rx="28" ry="12" fill="#fff2c8" opacity="0.85"/>
<rect x="120" y="470" width="286" height="20" rx="10" fill="#e5dccb"/>
<rect x="560" y="486" width="230" height="18" rx="9" fill="#e1d7c6"/>
<ellipse cx="640" cy="470" rx="60" ry="16" fill="#d6c9b2"/>
<path d="M610,462 C626,452 654,452 670,462" fill="none" stroke="#e6d6ba" stroke-width="4" opacity="0.6"/>`;
})();

/** 堂食大间 */
const envHall = (() => {
  const lantern = (x, y, s) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="0" rx="190" ry="150" fill="url(#lampGlow)"/>
    <path d="M0,-260 L0,-90" stroke="#b9a98d" stroke-width="3" opacity="0.8"/>
    <rect x="-26" y="-92" width="52" height="16" rx="5" fill="#c2a878"/>
    <ellipse rx="58" ry="72" fill="#d4491c"/>
    <ellipse rx="58" ry="72" fill="none" stroke="#f0a04c" stroke-width="3" opacity="0.7"/>
    <ellipse cx="-18" cy="-20" rx="20" ry="34" fill="#ff8a4a" opacity="0.5"/>
    <path d="M-58,-16 C-40,4 40,4 58,-16" fill="none" stroke="#f6b566" stroke-width="3" opacity="0.55"/>
    <path d="M-58,20 C-40,40 40,40 58,20" fill="none" stroke="#f6b566" stroke-width="3" opacity="0.55"/>
    <rect x="-24" y="68" width="48" height="14" rx="5" fill="#c2a878"/>
    <path d="M0,82 L0,104" stroke="#d9b878" stroke-width="4"/>
  </g>`;
  const table = (x, y, s) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <path d="M-190,0 L190,0 L150,74 L-150,74 Z" fill="url(#woodTop)"/>
    <path d="M-190,0 L190,0 L150,74 L-150,74 Z" fill="none" stroke="#9a7442" stroke-width="3" opacity="0.55"/>
    <path d="M-160,-24 L160,-24 L160,0 L-160,0 Z" fill="#c8a877"/>
    <rect x="-150" y="-52" width="46" height="30" rx="8" fill="#cbb08a"/>
    <rect x="104" y="-52" width="46" height="30" rx="8" fill="#cbb08a"/>
    <ellipse cy="46" rx="46" ry="13" fill="#f0e4cc" opacity="0.9"/>
    <ellipse cy="42" rx="34" ry="9" fill="#c9b48e" opacity="0.9"/>
    <ellipse cx="-22" cy="30" rx="24" ry="8" fill="#f0e4cc" opacity="0.75"/>
  </g>`;
  return `
<rect width="960" height="640" fill="#f5f0e7"/>
<rect width="960" height="430" fill="url(#wallLight)"/>
<path d="M0,430 L960,430" stroke="#c8bda8" stroke-width="3" opacity="0.7"/>
<rect y="430" width="960" height="210" fill="url(#floor)"/>
${lantern(258, 190, 0.92)}
${lantern(700, 172, 0.8)}
${lantern(480, 214, 0.62)}
${table(300, 486, 0.86)}
${table(668, 500, 0.94)}
<ellipse cx="480" cy="620" rx="420" ry="90" fill="#8c7c60" opacity="0.16" filter="url(#b24)"/>`;
})();

/** 老宅天井 */
const envCourtyard = (() => {
  const bricks = [];
  for (let r = 0; r < 8; r += 1) {
    const y = 214 + r * 30;
    for (let c = 0; c < 4; c += 1) {
      const x = c * 78 + (r % 2 ? 39 : -39);
      bricks.push(`<rect x="${x}" y="${y}" width="74" height="26" rx="4" fill="#d9c9ae" opacity="0.6"/>`);
    }
  }
  const clouds = [[176, 72, 116, 26], [428, 46, 146, 30], [726, 88, 124, 24]]
    .map(([x, y, rx, ry]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#ffffff" opacity="0.6"/>`)
    .join('');
  return `
<rect width="960" height="640" fill="#f3ecdf"/>
<rect width="960" height="300" fill="url(#sky)"/>
${clouds}
<ellipse cx="772" cy="96" rx="150" ry="112" fill="#fff6df" opacity="0.75"/>
<rect x="0" y="188" width="330" height="452" fill="#f2eadb"/>
<rect x="0" y="188" width="330" height="452" fill="none" stroke="#d5c8b2" stroke-width="4" opacity="0.9"/>
<g>${bricks.join('')}</g>
<rect x="630" y="188" width="330" height="452" fill="#f2eadb"/>
<g>
  <rect x="660" y="250" width="270" height="200" rx="10" fill="#dceaf1" opacity="0.95"/>
  <path d="M660,250 L930,250 L930,450 L660,450 Z" fill="none" stroke="#c8a068" stroke-width="4" opacity="0.75"/>
  <path d="M750,250 L750,450 M840,250 L840,450" stroke="#c8a068" stroke-width="4" opacity="0.75"/>
  <path d="M660,318 L930,318 M660,382 L930,382" stroke="#c8a068" stroke-width="4" opacity="0.75"/>
  <path d="M708,250 L708,450 M795,250 L795,450 M882,250 L882,450" stroke="#c8a068" stroke-width="2" opacity="0.5"/>
  <path d="M660,284 L930,284 M660,350 L930,350 M660,416 L930,416" stroke="#c8a068" stroke-width="2" opacity="0.5"/>
  <rect x="676" y="266" width="248" height="168" fill="#ffffff" opacity="0.55"/>
</g>
<rect x="330" y="188" width="300" height="452" fill="#ede4d4"/>
<rect x="330" y="188" width="300" height="452" fill="none" stroke="#d5c8b2" stroke-width="4" opacity="0.9"/>
<rect x="380" y="240" width="200" height="270" rx="8" fill="#dceaf1" opacity="0.95"/>
<rect x="380" y="240" width="200" height="270" rx="8" fill="none" stroke="#c8a068" stroke-width="4" opacity="0.7"/>
<path d="M480,240 L480,510 M380,375 L580,375" stroke="#c8a068" stroke-width="3" opacity="0.6"/>
<ellipse cx="480" cy="300" rx="120" ry="90" fill="#ffffff" opacity="0.5"/>
<rect y="556" width="960" height="84" fill="#e8dfcd"/>
<path d="M0,556 L960,556" stroke="#c3b7a0" stroke-width="4" opacity="0.8"/>
<path d="M120,640 L360,556 M840,640 L600,556" stroke="#c3b7a0" stroke-width="4" opacity="0.55"/>
<path d="M240,640 L420,556 M720,640 L540,556" stroke="#c3b7a0" stroke-width="3" opacity="0.42"/>
<g transform="translate(480 168)">
  <path d="M0,-96 L0,-26" stroke="#b9a98d" stroke-width="3" opacity="0.9"/>
  <ellipse rx="120" ry="96" fill="url(#lampGlow)" opacity="0.8"/>
  <rect x="-22" y="-28" width="44" height="14" rx="4" fill="#c2a878"/>
  <ellipse rx="48" ry="60" fill="#d4491c"/>
  <ellipse rx="48" ry="60" fill="none" stroke="#f0a04c" stroke-width="3" opacity="0.65"/>
  <ellipse cx="-14" cy="-16" rx="16" ry="28" fill="#ff8a4a" opacity="0.5"/>
</g>`;
})();

/** 天井茶席 */
const envTea = (() => {
  const grid = [];
  for (let c = 0; c <= 8; c += 1) grid.push(`<path d="M${c * 120},0 L${c * 120},380" stroke="#c8a068" stroke-width="4" opacity="0.7"/>`);
  for (let r = 0; r <= 3; r += 1) grid.push(`<path d="M0,${r * 120} L960,${r * 120}" stroke="#c8a068" stroke-width="4" opacity="0.7"/>`);
  const cup = (x, y, s) => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cy="16" rx="46" ry="18" fill="#2a1c12" opacity="0.5" filter="url(#b5)"/>
    <path d="M-46,-16 C-42,22 -22,34 0,34 C22,34 42,22 46,-16 Z" fill="url(#porc)"/>
    <ellipse cy="-16" rx="46" ry="16" fill="#e0d4be"/>
    <ellipse cy="-16" rx="38" ry="12" fill="#8a5a1c" opacity="0.85"/>
    <ellipse cx="-12" cy="-18" rx="16" ry="5" fill="#c99447" opacity="0.7"/>
    <path d="M-40,-14 C-34,18 -18,28 0,28" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.4"/>
  </g>`;
  return `
<rect width="960" height="640" fill="#f6f1e8"/>
<rect width="960" height="380" fill="#e4efe9" opacity="0.9"/>
<rect width="960" height="380" fill="#ffffff" opacity="0.5"/>
${grid.join('')}
<rect y="380" width="960" height="26" fill="#e0d6c4"/>
<rect y="406" width="960" height="234" fill="url(#floor)"/>
<ellipse cx="480" cy="300" rx="420" ry="220" fill="#ffffff" opacity="0.5"/>
<rect x="60" y="470" width="840" height="46" rx="14" fill="url(#woodTop)"/>
<rect x="60" y="470" width="840" height="16" rx="8" fill="#f2ddbe" opacity="0.6"/>
<g transform="translate(470 424)">
  <ellipse cy="46" rx="130" ry="30" fill="#180e06" opacity="0.55" filter="url(#b12)"/>
  <ellipse cy="10" rx="128" ry="52" fill="url(#porc)"/>
  <ellipse cy="6" rx="128" ry="52" fill="none" stroke="#b8a78e" stroke-width="2" opacity="0.6"/>
  <ellipse cy="-4" rx="112" ry="42" fill="#e6dac2"/>
  <ellipse cy="-8" rx="86" ry="28" fill="#c9b691" opacity="0.7"/>
  <path d="M128,-8 C186,-24 210,-42 226,-66" fill="none" stroke="#f0e6d0" stroke-width="18" stroke-linecap="round"/>
  <path d="M128,-8 C186,-24 210,-42 226,-66" fill="none" stroke="#b8a78e" stroke-width="3" opacity="0.4"/>
  <path d="M-128,-6 C-168,-40 -152,-76 -118,-84 C-92,-90 -76,-66 -84,-42" fill="none" stroke="#f0e6d0" stroke-width="16" stroke-linecap="round"/>
  <ellipse cy="-46" rx="26" ry="14" fill="#f6efdd"/>
  <circle cy="-62" r="12" fill="#e0d4be"/>
  <path d="M-60,-56 C-20,-70 20,-70 60,-56" fill="none" stroke="#ffffff" stroke-width="5" opacity="0.4"/>
</g>
${cup(214, 492, 1)}
${cup(760, 500, 0.9)}
<g opacity="0.5">${steam(400, 320, 34)}</g>
<ellipse cx="640" cy="516" rx="52" ry="14" fill="#f0e4cc" opacity="0.85"/>
<ellipse cx="640" cy="512" rx="38" ry="10" fill="#c99a4c" opacity="0.85"/>`;
})();

const EXTRA = [
  { name: 'hero-haishen', svg: heroSvg },
  { name: 'env-kitchen', svg: scene(envKitchen, { defs: envDefs, light: [300, 120, 520] }) },
  { name: 'env-hall', svg: scene(envHall, { defs: envDefs, light: [480, 90, 620] }) },
  { name: 'env-courtyard', svg: scene(envCourtyard, { defs: envDefs, light: [480, 60, 640] }) },
  { name: 'env-tea', svg: scene(envTea, { defs: envDefs, light: [480, 200, 600] }) },
];

for (const file of FILES) {
  const steamGroup = file.steam
    ? `<g opacity="0.42">${steam(file.steam[0], file.steam[1], file.steam[2])}</g>\n`
    : '';
  const body = `${file.container}\n${file.art}\n${steamGroup}`;
  writeFileSync(resolve(OUT, `${file.name}.svg`), scene(body, { defs: file.defs }), 'utf8');
  console.log(`  ✓ ${file.name}.svg`);
}
for (const file of EXTRA) {
  writeFileSync(resolve(OUT, `${file.name}.svg`), file.svg, 'utf8');
  console.log(`  ✓ ${file.name}.svg`);
}

const allNames = [...FILES.map((f) => f.name), ...EXTRA.map((f) => f.name)];
console.log(`\n完成:${allNames.length} 张 → ${OUT}`);

// 同时写一份预览页,方便在浏览器里一次性扫一遍所有插画
const sheet = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>插画预览</title>
<style>
  body{margin:0;padding:20px;background:#15100b;font:13px/1.5 "Microsoft YaHei",sans-serif;color:#c9b79f}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
  figure{margin:0}img{width:100%;display:block;border-radius:10px;background:#000}
  figcaption{padding:6px 2px}
</style></head><body><div class="grid">
${allNames.map((n) => `<figure><img src="../assets/img/${n}.svg" alt="${n}"><figcaption>${n}</figcaption></figure>`).join('\n')}
</div></body></html>
`;
writeFileSync(resolve(HERE, '_contact-sheet.html'), sheet, 'utf8');

// 审计页:把 SVG 画到 canvas 上,输出亮度字符图 + 覆盖率,用文本校验构图
const auditNames = allNames;
const audit = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>audit</title></head>
<body><pre id="out">working…</pre>
<script>
const NAMES = ${JSON.stringify(auditNames)};
const COLS = 60, ROWS = 22;
const c = document.createElement("canvas");
c.width = COLS; c.height = ROWS;
const ctx = c.getContext("2d", { willReadFrequently: true });
const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
/* 色相分类: . 暗底  @ 器皿亮面  - 器皿灰面  · 中性微暖  o/r 亮橙红  O/R 暗红褐  y/Y 黄  g 绿  c 青  v 紫 */
function klass(r, g, b) {
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  /* 用彩度(饱和度差)而不是 HSL 饱和度:奶白盘子的彩度极低,酱汁/食材的彩度很高 */
  const chroma = (max - min) / 255;
  if (lum < 0.18) return ".";
  if (chroma < 0.10) return lum > 0.60 ? "@" : lum > 0.34 ? "-" : ",";
  if (chroma < 0.22) return lum > 0.55 ? "·" : ":";
  let h = 0;
  const dlt = max - min;
  if (max === r) h = ((g - b) / dlt) % 6;
  else if (max === g) h = (b - r) / dlt + 2;
  else h = (r - g) / dlt + 4;
  h *= 60; if (h < 0) h += 360;
  if (h < 20) return lum > 0.55 ? "r" : "R";
  if (h < 45) return lum > 0.55 ? "o" : "O";
  if (h < 72) return lum > 0.5 ? "y" : "Y";
  if (h < 170) return "g";
  if (h < 260) return lum > 0.5 ? "c" : "v";
  return lum > 0.5 ? "p" : "v";
}
(async () => {
  const lines = [];
  for (const name of NAMES) {
    const img = await load("../assets/img/" + name + ".svg");
    if (!img) { lines.push(name + " !! 加载失败\\n"); continue; }
    ctx.clearRect(0, 0, COLS, ROWS);
    ctx.drawImage(img, 0, 0, COLS, ROWS);
    const d = ctx.getImageData(0, 0, COLS, ROWS).data;
    const tally = {};
    const rows = [];
    for (let y = 0; y < ROWS; y++) {
      let line = "";
      for (let x = 0; x < COLS; x++) {
        const i = (y * COLS + x) * 4;
        const ch = klass(d[i], d[i + 1], d[i + 2]);
        tally[ch] = (tally[ch] || 0) + 1;
        line += ch;
      }
      rows.push(line);
    }
    const total = COLS * ROWS;
    const pct = (ch) => (((tally[ch] || 0) / total) * 100).toFixed(0);
    lines.push(name + "  器皿@=" + pct("@") + "%  中性·:=" + pct("·") + "+" + pct(":") + "%  亮橙r/o=" + pct("r") + "+" + pct("o") + "%  暗红褐R/O=" + pct("R") + "+" + pct("O") + "%  黄y=" + pct("y") + "%  绿g=" + pct("g") + "%  暗底.=" + pct(".") + "%");
    lines.push(rows.join("\\n"));
    lines.push("");
  }
  document.getElementById("out").textContent = lines.join("\\n");
})();
</script></body></html>
`;
writeFileSync(resolve(HERE, '_audit.html'), audit, 'utf8');
