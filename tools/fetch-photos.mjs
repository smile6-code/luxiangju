#!/usr/bin/env node
/**
 * 鲁香居 · 真实菜品照片抓取
 *
 *   node tools/fetch-photos.mjs --dry            # 只列候选,不下载
 *   node tools/fetch-photos.mjs                  # 每个菜下载前 N 张候选
 *
 * 走 Bing 图片搜索(带"可自由使用"许可过滤),把候选图存到
 * assets/img/candidates/<菜品>/ 下,并输出一份带来源的报告。
 *
 * 注意:搜索结果来自公开网页,用于演示请自行确认版权;
 * 商用务必换成自己拍的照片或正规图库授权图。
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CAND = resolve(ROOT, 'assets', 'img', 'candidates');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/* 想要自由使用许可就把 LICENSE_ONLY 设为 true。
   实测打开后结果会少很多,但版权上更稳妥。 */
const LICENSE_ONLY = process.env.LICENSE_ONLY === '1';
const LICENSE_QFT = '+filterui:license-L2_L3_L4_L5_L6';

/** [菜品 id, 标题里必须出现的关键词, 搜索词...]
 *  关键词用来判相关性:标题里没有它的结果基本是搜歪了。 */
const DISHES = [
  ['dish-jiuzhuandachang', '大肠', ['九转大肠', '九转大肠 鲁菜']],
  ['dish-congshaohaishen', '海参', ['葱烧海参', '葱烧海参 鲁菜']],
  ['dish-tangculiyu', '鲤鱼', ['糖醋黄河鲤鱼', '糖醋鲤鱼']],
  ['dish-baochaoyaohua', '腰花', ['爆炒腰花', '腰花 炒']],
  ['dish-dezhoubaji', '扒鸡', ['德州扒鸡', '扒鸡 整只']],
  ['dish-bazirou', '把子肉', ['把子肉', '济南把子肉']],
  ['dish-sixiwanzi', '丸子', ['四喜丸子', '四喜丸子 鲁菜']],
  ['dish-youmendaxia', '大虾', ['油焖大虾', '油焖大虾 鲁菜']],
  ['dish-naitangpucai', '蒲菜', ['奶汤蒲菜', '蒲菜 汤']],
  ['dish-wuxiangxunyu', '熏鱼', ['五香熏鱼', '熏鱼 凉菜']],
  ['dish-jiangniurou', '牛肉', ['酱牛肉 切片', '卤牛肉 切片']],
  ['dish-shandongjianbing', '煎饼', ['山东煎饼', '煎饼卷大葱']],
  ['dish-basishanyao', '山药', ['拔丝山药', '拔丝山药 拉丝']],
];

/* 搜歪时常见的东西:地图、剧照、玩偶、成绩单…… */
const JUNK = /地图|成绩单|剧照|玩偶|抱枕|玩具|壁纸|表情包|头像|矢量|模板|素材|海报|ppt|简历|装修|旅游|游记|门票|价格表|加盟/i;

/* 图库预览站多半带水印,直接排除 */
const BLOCK = [
  '699pic', 'veer.com', 'gettyimages', 'shutterstock', 'dreamstime', 'alamy',
  '123rf', 'istockphoto', 'depositphotos', 'adobe.com', 'zcool.com.cn',
  'tuchong', 'hellorf', '58pic', 'ooopic', 'zhituwang', 'bigstock',
];

/* 中文美食社区 / 媒体,图文相关性通常更高 */
const PREFER = [
  'xiachufang', 'douguo', 'meishij', 'xiangha', 'meishichina', 'sohu',
  'sinaimg', 'zhihu', 'baidu', '163.com', 'qq.com', 'toutiao', 'ifeng',
  'dianping', 'meituan', 'bilibili', 'xiaohongshu', 'wikimedia',
];

const decode = (s) =>
  String(s)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

async function search(query, count = 70) {
  const hits = [];
  for (let first = 0; first < count; first += 35) {
    const url =
      'https://cn.bing.com/images/search?q=' +
      encodeURIComponent(query) +
      (LICENSE_ONLY ? '&qft=' + encodeURIComponent(LICENSE_QFT) : '') +
      '&first=' + first +
      '&count=35';
    let html;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) break;
      html = await res.text();
    } catch {
      break;
    }

    const re = /class="iusc"[^>]*?\sm="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) {
      try {
        const j = JSON.parse(decode(m[1]));
        if (j && j.murl) {
          hits.push({
            murl: j.murl,
            turl: j.turl || '',
            page: j.purl || j.surl || '',
            title: decode(j.t || ''),
          });
        }
      } catch {
        /* 忽略解析不了的单条 */
      }
    }
    if (hits.length >= count) break;
  }
  return hits;
}

const host = (u) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/* ------------------------------------------------------------------ *
 * 第二阶段:图片搜索经常被 Bing 降级,所以再走一条更可靠的路——
 * 用网页搜索找到菜谱页,校验页面标题确实包含菜名,再取页面里的成品图。
 * ------------------------------------------------------------------ */

const RECIPE_SITES = [
  'meishichina.com',
  'xiachufang.com',
  'xiangha.com',
  'meishij.net',
  'douguo.com',
  'meishi.cc',
];

/** 只留菜谱站里的内容页;是不是这道菜交给后面的标题校验去判 */
const isRecipeUrl = (u) =>
  RECIPE_SITES.some((d) => host(u) === d || host(u).endsWith('.' + d)) &&
  /\.html|\/caipu\/|\/zuofan\/|\/recipe\/|\/mofang\//.test(u);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 菜谱站有 Cloudflare,Node 的 fetch 会被 403;用 curl 拿 HTML 就正常 */
async function curlText(url, referer) {
  const args = [
    '-s', '-L', '--max-time', '22',
    '-A', UA,
    '-H', 'Accept-Language: zh-CN,zh;q=0.9',
  ];
  if (referer) args.push('-H', 'Referer: ' + referer);
  args.push(url);
  try {
    const { stdout } = await execFileAsync('curl.exe', args, {
      maxBuffer: 16 * 1024 * 1024,
      encoding: 'utf8',
    });
    return stdout || '';
  } catch {
    return '';
  }
}

/** Bing 网页搜索,返回页面里出现的链接 */
/* Bing 把结果链接包在 bing.com/ck/a?...&u=a1<base64> 里,解开才能拿到真实地址 */
function unwrapBing(href) {
  try {
    const u = new URL(href);
    if (!/(^|\.)bing\.com$/.test(u.hostname)) return href;
    if (!u.pathname.startsWith('/ck/a')) return href;
    const raw = u.searchParams.get('u');
    if (!raw) return href;
    const b64 = raw.startsWith('a1') ? raw.slice(2) : raw;
    const pad = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const real = Buffer.from(pad, 'base64').toString('utf8');
    return /^https?:\/\//.test(real) ? real : href;
  } catch {
    return href;
  }
}

async function webSearch(query) {
  const out = [];
  for (const first of [1, 11, 21]) {
    const url =
      'https://cn.bing.com/search?q=' + encodeURIComponent(query) + '&setlang=zh-CN&first=' + first;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
        const u = decode(unwrapBing(decode(m[1])));
        if (!out.includes(u)) out.push(u);
      }
    } catch {
      /* 单页失败就跳过 */
    }
    await sleep(200);
  }
  return out;
}

/** 打开菜谱页,校验标题里确有菜名,并取出成品图 */
async function recipeShot(pageUrl, keyword) {
  const html = await curlText(pageUrl);
  if (!html) return null;

  const title = decode((html.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1]).trim();
  /* 标题里没有菜名,说明这页不是这道菜,直接丢掉 */
  if (!title.includes(keyword)) return null;

  const og =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (og) return { img: og[1], title };

  /* 美食天下把成品图放在 /atta/recipe/,步骤图是 /atta/step/,只取前者 */
  const atta = html.match(/https?:\/\/[^"'\s]+\/atta\/recipe\/[^"'\s]+?\.(?:jpe?g|png)/i);
  if (atta) return { img: atta[0], title };

  return null;
}

function score(hit, keyword) {
  let s = 0;
  const h = host(hit.murl);
  const title = hit.title || '';

  if (BLOCK.some((b) => h.includes(b))) return -999;

  /* 相关性优先:标题里必须有这道菜的关键词 */
  const relevant = title.includes(keyword);
  s += relevant ? 10 : -8;
  if (JUNK.test(title)) s -= 12;

  if (PREFER.some((p) => h.includes(p))) s += 3;
  if (/做法|食谱|菜谱|家常|图解|大全|名菜/.test(title)) s += 2;
  if (/\.(jpe?g|png|webp)(\?|$)/i.test(hit.murl)) s += 2;
  if (/thumb|small|icon|logo|sprite|watermark/i.test(hit.murl)) s -= 4;
  return s;
}

/** 认文件头,避免把 HTML 错误页当图片存下来 */
function imageExt(buf) {
  if (!buf || buf.length < 12 * 1024) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return '.jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50) return '.png';
  if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') {
    return '.webp';
  }
  return null;
}

async function downloadOne(hit) {
  const referer = hit.page || 'https://cn.bing.com/';

  try {
    const res = await fetch(hit.murl, {
      headers: { 'User-Agent': UA, Referer: referer },
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const ext = imageExt(buf);
      if (ext) return { buf, ext };
    }
  } catch {
    /* 落到 curl 兜底 */
  }

  // 有些图床同样会挡 Node,用 curl 再试一次
  const { stdout } = await execFileAsync(
    'curl.exe',
    ['-s', '-L', '--max-time', '22', '-A', UA, '-H', 'Referer: ' + referer, hit.murl],
    { maxBuffer: 40 * 1024 * 1024, encoding: 'buffer' }
  );
  const ext = imageExt(stdout);
  if (!ext) throw new Error('not an image');
  return { buf: stdout, ext };
}

const DRY = process.argv.includes('--dry');
const perDish = Number(process.env.PER_DISH || 4);
const report = [];
const manifest = [];

/** 菜品中文名,仅用于选择页展示 */
const NAMES = {
  'dish-jiuzhuandachang': '九转大肠',
  'dish-congshaohaishen': '葱烧海参',
  'dish-tangculiyu': '糖醋黄河鲤鱼',
  'dish-baochaoyaohua': '爆炒腰花',
  'dish-dezhoubaji': '德州扒鸡',
  'dish-bazirou': '把子肉',
  'dish-sixiwanzi': '四喜丸子',
  'dish-youmendaxia': '油焖大虾',
  'dish-naitangpucai': '奶汤蒲菜',
  'dish-wuxiangxunyu': '五香熏鱼',
  'dish-jiangniurou': '鲁味酱牛肉',
  'dish-shandongjianbing': '山东大煎饼',
  'dish-basishanyao': '拔丝山药',
};

/** 菜品 id -> 标题里应当出现的关键词,用来给候选组打可信度 */
const KEYWORD = Object.fromEntries(DISHES.map((d) => [d[0], d[1]]));

/* 菜谱站限定:实测能显著提高相关性(但 Bing 有时会忽略 site: 而退回部分匹配,
   所以下面还会按"标题里有没有出现菜名关键词"给每组打可信度标记)。 */
const SITES = ['xiachufang.com', 'meishichina.com', 'xiangha.com'];

for (const [id, keyword, baseQueries] of DISHES) {
  const seen = new Set();
  const pool = [];
  const queries = [
    ...baseQueries,
    ...SITES.map((s) => `${baseQueries[0]} site:${s}`),
  ];

  for (const q of queries) {
    for (const hit of await search(q)) {
      if (seen.has(hit.murl)) continue;
      seen.add(hit.murl);
      pool.push({ ...hit, query: q, score: score(hit, keyword) });
    }
    await new Promise((r) => setTimeout(r, 220)); // 别把对方打急
  }

  pool.sort((a, b) => b.score - a.score);
  const top = pool.filter((p) => p.score > -100).slice(0, perDish);

  report.push([id, pool.length, top]);
  console.log(`\n${id}  (${pool.length} 条候选)`);

  for (let i = 0; i < top.length; i += 1) {
    const t = top[i];
    console.log(
      `  [${i + 1}] ${String(t.score).padStart(3)}  ${host(t.murl).slice(0, 26).padEnd(26)} ${(t.title || '(无标题)').slice(0, 42)}`
    );
    if (DRY) continue;

    const dir = resolve(CAND, id);
    mkdirSync(dir, { recursive: true });
    try {
      const { buf, ext } = await downloadOne(t);
      const file = resolve(dir, `${id}-${i + 1}${ext}`);
      writeFileSync(file, buf);
      console.log(`       ✓ 已存 ${(buf.length / 1024).toFixed(0)} KB`);
      manifest.push({
        dish: id,
        name: NAMES[id] || id,
        rank: i + 1,
        key: String(i + 1),
        order: 100 + i,
        source: 'image-search',
        file: `assets/img/candidates/${id}/${id}-${i + 1}${ext}`,
        kb: Math.round(buf.length / 1024),
        title: t.title || '(无标题)',
        domain: host(t.murl),
        page: t.page || '',
        score: t.score,
      });
    } catch (e) {
      console.log(`       ✗ ${e.message}`);
    }
  }

  /* ---- 菜谱页成品图:标题里能对上菜名,比图片搜索可靠 ---- */
  let got = 0;
  const pool2 = [];
  const seenLink = new Set();
  const addLinks = (urls) => {
    for (const u of urls) {
      if (seenLink.has(u)) continue;
      seenLink.add(u);
      if (isRecipeUrl(u)) pool2.push(u);
    }
  };

  for (const site of RECIPE_SITES) {
    addLinks(await webSearch(`${baseQueries[0]} site:${site}`));
  }
  for (const q of baseQueries) {
    addLinks(await webSearch(`${q} 做法`));
  }
  console.log(`       菜谱页候选链接 ${pool2.length} 条`);

  for (const link of pool2) {
    if (got >= 3) break;
    const shot = await recipeShot(link, keyword);
    await sleep(160);
    if (!shot) continue;

    try {
        const { buf, ext } = await downloadOne({ murl: shot.img, page: link });
        got += 1;
        const dir = resolve(CAND, id);
        mkdirSync(dir, { recursive: true });
        const name = `${id}-recipe-${got}${ext}`;
        writeFileSync(resolve(dir, name), buf);
        manifest.push({
          dish: id,
          name: NAMES[id] || id,
          rank: got,
          key: 'R' + got,
          order: got,
          source: 'recipe',
          file: `assets/img/candidates/${id}/${name}`,
          kb: Math.round(buf.length / 1024),
          title: shot.title.slice(0, 90),
          domain: host(link),
          page: link,
          score: 99,
        });
        console.log(
          `       ★ 菜谱页成品图 ${(buf.length / 1024).toFixed(0)} KB  ${shot.title.slice(0, 34)}`
        );
    } catch {
      /* 单张失败就跳过 */
    }
  }
}

if (!DRY) {
  mkdirSync(CAND, { recursive: true });
  const lines = ['# 菜品照片候选来源', '', `抓取时间:${new Date().toISOString()}`, ''];
  for (const [id, n, top] of report) {
    lines.push(`## ${id}  (候选 ${n} 条)`);
    top.forEach((t, i) => {
      lines.push(`- [${i + 1}] score=${t.score} | ${host(t.murl)} | ${t.title}`);
      lines.push(`      ${t.murl}`);
      if (t.page) lines.push(`      来源页 ${t.page}`);
    });
    lines.push('');
  }
    writeFileSync(resolve(ROOT, 'assets', 'img', 'candidates', 'SOURCES.md'), lines.join('\n'), 'utf8');
    writeFileSync(
      resolve(ROOT, 'assets', 'img', 'candidates', 'manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8'
    );
    writePicker(manifest);
    console.log(`\n候选图目录:${CAND}`);
  }

/* ------------------------------------------------------------------ *
 * 生成选择页:看图打勾,输出一份可以直接粘回对话的清单
 * ------------------------------------------------------------------ */
function writePicker(manifest) {
  const groups = DISHES.map((d) => d[0])
    .map((id) => ({
      id,
      name: NAMES[id] || id,
      items: manifest
        .filter((m) => m.dish === id)
        .sort((a, b) => (a.order ?? a.rank ?? 0) - (b.order ?? b.rank ?? 0)),
    }))
    .filter((g) => g.items.length);

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const blocks = groups
    .map((g) => {
      const kw = KEYWORD[g.id] || '';
      const recipes = g.items.filter((m) => m.source === 'recipe');
      const searched = g.items.filter((m) => m.source !== 'recipe');
      const matched = searched.filter((m) => String(m.title || '').includes(kw)).length;
      const bad = recipes.length === 0 && matched === 0;
      const tag = recipes.length
        ? `✓ ${recipes.length} 张菜谱页成品图(标题已核对)`
        : bad
        ? `⚠ 候选标题里没有「${kw}」,基本是搜歪的`
        : `${matched}/${searched.length} 条标题命中「${kw}」`;
      const cards = g.items
        .map(
          (m) => `      <label class="pick">
        <input type="radio" name="${g.id}" value="${m.key || m.rank}" />
        <img src="../${m.file}" alt="" loading="lazy" />
        <span class="meta"><b>${m.source === 'recipe' ? '成品图 ' + m.rank : '图搜 ' + m.rank}</b>
        · ${esc(m.domain)} · ${m.kb}KB<br />
        <small>${esc(m.title).slice(0, 64)}</small></span>
      </label>`
        )
        .join('\n');
      return `
  <section class="dish${bad ? ' dish--bad' : ''}">
    <h2>${g.name} <code>${g.id}</code>
      <span class="tag ${bad ? 'tag--bad' : 'tag--ok'}">${tag}</span>
    </h2>
    <div class="row">
      <label class="pick pick--none">
        <input type="radio" name="${g.id}" value="0" checked />
        <span class="ph">不用候选<br /><small>保留插画</small></span>
      </label>
${cards}
    </div>
  </section>`;
    })
    .join('\n');

  const ids = JSON.stringify(groups.map((g) => [g.id, g.name]));

  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>菜品照片选择</title>
<style>
  body{margin:0;padding:24px 24px 240px;background:#14100c;color:#e8ded0;font:14px/1.6 "Microsoft YaHei",sans-serif}
  h1{font-size:20px;margin:0 0 6px}
  .lead{color:#a89880;font-size:13px;margin-bottom:22px;max-width:76ch}
  .dish{margin-bottom:26px;border-top:1px solid #2e2419;padding-top:16px}
  h2{font-size:16px;margin:0 0 12px;font-weight:600}
  h2 code{font-size:11px;color:#7d6c55;font-weight:400;margin-left:6px}
  .tag{font-size:11px;font-weight:400;padding:3px 10px;border-radius:999px;margin-left:8px;vertical-align:2px;white-space:nowrap}
  .tag--ok{background:rgba(123,162,79,.18);color:#a8c87a;border:1px solid rgba(123,162,79,.35)}
  .tag--bad{background:rgba(224,104,74,.16);color:#e8927a;border:1px solid rgba(224,104,74,.4)}
  .dish--bad{background:rgba(224,104,74,.05);border-radius:10px;padding:16px 14px 14px;margin-left:-14px;margin-right:-14px}
  .row{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
  .pick{position:relative;display:block;border:1px solid #33281c;border-radius:10px;overflow:hidden;
        background:#1d1610;cursor:pointer;transition:border-color .2s,box-shadow .2s}
  .pick:hover{border-color:#8a6a34}
  .pick:has(input:checked){border-color:#d9a44c;box-shadow:0 0 0 2px rgba(217,164,76,.3)}
  input{position:absolute;opacity:0;pointer-events:none}
  .pick img{width:100%;height:150px;object-fit:cover;display:block;background:#000}
  .meta{display:block;padding:7px 10px 9px;font-size:11px;color:#b8a68c;line-height:1.45}
  .meta small{color:#7d6c55}
  .pick--none{display:grid;place-items:center;height:150px;text-align:center;
              font-size:12px;color:#8a7a62;border-style:dashed;background:#181209}
  .ph small{color:#65583f}
  .bar{position:fixed;left:0;right:0;bottom:0;background:rgba(13,9,6,.95);
       border-top:1px solid #3a2c1c;padding:12px 24px;backdrop-filter:blur(8px)}
  textarea{width:100%;height:132px;background:#080605;color:#9f8;border:1px solid #33281c;
           border-radius:8px;padding:10px;font:12px/1.5 Consolas,monospace;resize:vertical}
  button{margin-top:8px;padding:8px 18px;border-radius:999px;border:0;cursor:pointer;
         background:linear-gradient(135deg,#eec689,#d9a44c);color:#241505;font-weight:700}
</style></head>
<body>
<h1>菜品照片选择</h1>
<p class="lead">
  每道菜下面是抓到的真实照片候选。<b>点一张即选中</b>,不想换就选「保留插画」。
  选完把底部清单粘回对话,我按清单把图接进页面。<br />
  候选来自公开网页搜索,版权请自行确认;要正式商用建议换成自己拍的或图库授权图。
</p>
${blocks}
<div class="bar">
  <textarea id="out" readonly></textarea>
  <button id="copy">复制清单</button>
</div>
<script>
var IDS = ${ids};
function build() {
  var lines = [];
  for (var i = 0; i < IDS.length; i++) {
    var id = IDS[i][0], name = IDS[i][1];
    var sel = document.querySelector('input[name="' + id + '"]:checked');
    var v = sel ? sel.value : '0';
    lines.push(id + ' = ' + v + '   # ' + name + (v === '0' ? '(保留插画)' : '(用第 ' + v + ' 张)'));
  }
  return lines.join('\\n');
}
function refresh() { document.getElementById('out').value = build(); }
document.addEventListener('change', refresh);
document.getElementById('copy').addEventListener('click', function () {
  var t = document.getElementById('out');
  t.select();
  try { document.execCommand('copy'); } catch (e) {}
  this.textContent = '已复制';
  var b = this;
  setTimeout(function () { b.textContent = '复制清单'; }, 1600);
});
refresh();
</script>
</body></html>
`;
  writeFileSync(resolve(HERE, '_photo-picker.html'), html, 'utf8');
}
