/**
 * 从豆包(Electron/Chromium)的本地缓存里把内嵌图片"抠"出来。
 * Chromium 缓存文件没有扩展名,图片数据混在二进制头部之后,所以按魔数定位再截取。
 *
 *   node tools/_carve-doubao.mjs
 */
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { createHash } from 'node:crypto';

const UD = join(process.env.LOCALAPPDATA || '', 'Doubao', 'User Data');
const ROOTS = [
  join(UD, 'Default', 'Cache', 'Cache_Data'),
  join(UD, 'Default', 'IndexedDB'),
  join(UD, 'sdk_storage'),
  join(UD, 'gecko_cache'),
];
const OUT = resolve('C:/Users/Triumph/Desktop/codex/_doubao-extract');
mkdirSync(OUT, { recursive: true });

const MIN_SIZE = 60 * 1024; // 小于 60KB 的多半是图标/头像
const MAX_READ = 120 * 1024 * 1024;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else {
      try {
        const st = statSync(p);
        if (st.size >= MIN_SIZE && st.size <= MAX_READ) out.push({ p, size: st.size });
      } catch {}
    }
  }
  return out;
}

/** 在 buffer 里定位图片起始与结束 */
function carve(buf) {
  const hits = [];
  for (let i = 0; i < buf.length - 12; i++) {
    // JPEG
    if (buf[i] === 0xff && buf[i + 1] === 0xd8 && buf[i + 2] === 0xff) {
      let end = -1;
      for (let j = buf.length - 2; j > i; j--) {
        if (buf[j] === 0xff && buf[j + 1] === 0xd9) { end = j + 2; break; }
      }
      if (end > i) hits.push({ type: 'jpg', start: i, end });
      i = end > i ? end - 1 : i;
      continue;
    }
    // PNG
    if (buf[i] === 0x89 && buf[i + 1] === 0x50 && buf[i + 2] === 0x4e && buf[i + 3] === 0x47) {
      const iend = buf.indexOf(Buffer.from('IEND'), i);
      if (iend > 0) {
        const end = iend + 8;
        hits.push({ type: 'png', start: i, end });
        i = end - 1;
      }
      continue;
    }
    // WebP
    if (
      buf[i] === 0x52 && buf[i + 1] === 0x49 && buf[i + 2] === 0x46 && buf[i + 3] === 0x46 &&
      buf[i + 8] === 0x57 && buf[i + 9] === 0x45 && buf[i + 10] === 0x42 && buf[i + 11] === 0x50
    ) {
      const size = buf.readUInt32LE(i + 4) + 8;
      const end = Math.min(buf.length, i + size);
      hits.push({ type: 'webp', start: i, end });
      i = end - 1;
    }
  }
  return hits;
}

const seen = new Set();
let files = 0, found = 0, kept = 0;
const report = [];

for (const root of ROOTS) {
  if (!existsSync(root)) continue;
  for (const { p, size } of walk(root)) {
    files++;
    let buf;
    try {
      buf = readFileSync(p);
    } catch {
      continue;
    }
    for (const h of carve(buf)) {
      const data = buf.subarray(h.start, h.end);
      if (data.length < MIN_SIZE) continue;
      // 超过 20MB 基本是跨了多张图或混入了别的数据,属于误截取
      if (data.length > 20 * 1024 * 1024) continue;
      found++;
      const key = createHash('sha1').update(data).digest('hex');
      if (seen.has(key)) continue;
      seen.add(key);
      kept++;
      const name = `${key.slice(0, 10)}.${h.type}`;
      writeFileSync(join(OUT, name), data);
      report.push({ name, size: data.length, from: p.replace(UD, '~') });
    }
  }
}

report.sort((a, b) => b.size - a.size);
writeFileSync(join(OUT, 'list.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(`扫描文件 ${files} 个,命中图片片段 ${found} 个,去重后保留 ${kept} 张 -> ${OUT}`);
report.slice(0, 40).forEach((r) => console.log(`  ${(r.size / 1024).toFixed(0).padStart(6)} KB  ${r.name}`));

/* 生成对照页:让人自己认图 */
const cards = report
  .map((r, i) => {
    const id = String.fromCharCode(65 + Math.floor(i / 10)) + ((i % 10) + 1);
    return `    <figure data-id="${id}">
      <img src="${r.name}" alt="${id}" loading="lazy" />
      <figcaption><b>${id}</b> <span class="dim"></span><br /><small>${r.name} · ${(r.size / 1024).toFixed(0)}KB</small></figcaption>
    </figure>`;
  })
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>豆包缓存里抠出的图片</title>
<style>
  body{margin:0;padding:22px 22px 60px;background:#14100c;color:#e8ded0;font:14px/1.7 "Microsoft YaHei",sans-serif}
  h1{font-size:19px;margin:0 0 6px}
  .lead{color:#a89880;font-size:13px;max-width:76ch;margin-bottom:18px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
  figure{margin:0;background:#1d1610;border:1px solid #33281c;border-radius:12px;overflow:hidden}
  img{width:100%;height:210px;object-fit:contain;background:#0b0805;display:block}
  figcaption{padding:8px 11px;font-size:12px;color:#b8a68c}
  figcaption b{color:#d9a44c;font-size:14px}
  figcaption small{color:#7d6c55}
  .bad{border-color:#8a3a2a}
  .bad img{opacity:.25}
</style></head>
<body>
<h1>从豆包缓存里抠出的图片(共 ${report.length} 张)</h1>
<p class="lead">
  编号 A1、A2… 是给每张图起的代号,方便你直接说"用 A3 当葱烧海参"。<br />
  下面标的尺寸和亮度是自动测的 —— 亮度低于 0.3 的是偏暗的图。
</p>
<div class="grid">
${cards}
</div>
<script>
const cv = document.createElement('canvas');
cv.width = 32; cv.height = 32;
const ctx = cv.getContext('2d', { willReadFrequently: true });
document.querySelectorAll('figure').forEach((fig) => {
  const img = fig.querySelector('img');
  const out = fig.querySelector('.dim');
  const run = () => {
    if (!img.naturalWidth) { fig.classList.add('bad'); out.textContent = '(无法解码)'; return; }
    ctx.clearRect(0, 0, 32, 32);
    ctx.drawImage(img, 0, 0, 32, 32);
    const d = ctx.getImageData(0, 0, 32, 32).data;
    let lum = 0, sat = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      lum += (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx > 0) sat += (mx - mn) / 255;
    }
    const n = 1024;
    out.textContent = img.naturalWidth + '×' + img.naturalHeight +
      ' · 亮度' + (lum / n).toFixed(2) + ' · 彩度' + (sat / n).toFixed(2);
  };
  if (img.complete) run(); else img.addEventListener('load', run);
  img.addEventListener('error', () => { fig.classList.add('bad'); out.textContent = '(无法解码)'; });
});
</script>
</body></html>
`;
writeFileSync(join(OUT, 'index.html'), html, 'utf8');
console.log('对照页: ' + join(OUT, 'index.html'));
