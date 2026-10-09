/** 把 index.html 里的矢量插画引用换成照片(一次性脚本) */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE = resolve('index.html');
let html = readFileSync(FILE, 'utf8');

const DISH = {
  'dish-jiuzhuandachang': 1, 'dish-congshaohaishen': 1, 'dish-baochaoyaohua': 1,
  'dish-dezhoubaji': 1, 'dish-bazirou': 1, 'dish-sixiwanzi': 1, 'dish-tangculiyu': 1,
  'dish-youmendaxia': 1, 'dish-naitangpucai': 1, 'dish-wuxiangxunyu': 1,
  'dish-jiangniurou': 1, 'dish-shandongjianbing': 1, 'dish-basishanyao': 1,
};

const SIZE = {
  'env-kitchen': [1400, 1050],
  'env-hall': [1200, 1106],
  'env-hall-inner': [1200, 1106],
  'env-courtyard': [1200, 1106],
  'env-waiting': [1200, 1106],
  'env-tea': [1200, 900],
};

let n = 0;
const sub = (from, to) => {
  if (!html.includes(from)) { console.log('  ! 没找到: ' + from.slice(0, 70)); return; }
  html = html.replace(from, to); n++;
};

// 1) 菜品图(dish-*.svg -> photos/dish-*.jpg)
for (const id of Object.keys(DISH)) {
  const re = new RegExp(`(<img src=")assets/img/${id}\\.svg(" width=")960(" height=")720`, 'g');
  html = html.replace(re, `$1assets/img/photos/${id}.jpg$2 1200$3 900`);
}

// 2) 首屏主视觉
sub('<img src="assets/img/hero-haishen.svg" width="960" height="720"',
    '<img src="assets/img/photos/dish-congshaohaishen.jpg" width="1200" height="900"');

// 3) 关于区:茶席 -> 等位区,明档厨房 -> 大厅内部
sub('<img src="assets/img/env-tea.svg" width="960" height="640" alt="店里的茶席:一壶茶、两只杯,窗外是老街的灯"',
    '<img src="assets/img/photos/env-waiting.jpg" width="1200" height="1106" alt="店门口的等位区:木凳、矮几和一壶热茶"');
sub('<figcaption>进门先奉一盏茶 · 茉莉大方</figcaption>',
    '<figcaption>等位区 · 先奉一盏茉莉大方</figcaption>');
sub('<img src="assets/img/env-kitchen.svg" width="960" height="640" alt="明档厨房里的一口炒锅与炉火"',
    '<img src="assets/img/photos/env-hall-inner.jpg" width="1200" height="1106" alt="堂食大间:老屋里的木桌与暖灯"');
sub('<figcaption>明档厨房 · 火不熄</figcaption>',
    '<figcaption>堂食大间 · 老屋里的十二张桌子</figcaption>');

// 4) 门店环境四格
sub('<img src="assets/img/env-kitchen.svg" width="960" height="640" alt="明档厨房:炉火正旺的炒锅与挂着的铁锅"',
    '<img src="assets/img/photos/env-kitchen.jpg" width="1400" height="1050" alt="明档厨房:炉火正旺的炒锅与挂着的铁锅"');
sub('<img src="assets/img/env-hall.svg" width="960" height="640" alt="堂食大间:两张八仙桌与三盏红灯笼"',
    '<img src="assets/img/photos/env-hall.jpg" width="1200" height="1106" alt="堂食大间:几张八仙桌与暖色吊灯"');
sub('<img src="assets/img/env-courtyard.svg" width="960" height="640" alt="老宅天井:青砖墙、木格窗、一灯笼与一轮月"',
    '<img src="assets/img/photos/env-courtyard.jpg" width="1200" height="1106" alt="老宅天井:青砖墙与木格窗"');
sub('<img src="assets/img/env-tea.svg" width="960" height="640" alt="茶席:木桌上的茶壶与两只茶杯"',
    '<img src="assets/img/photos/env-tea.jpg" width="1200" height="900" alt="茶席:桌上的一壶茉莉花茶"');

writeFileSync(FILE, html, 'utf8');
console.log('替换完成,共 ' + n + ' 处');
const left = (html.match(/assets\/img\/[a-z-]+\.svg/g) || []);
console.log('剩余 svg 引用: ' + (left.length ? [...new Set(left)].join(', ') : '无'));
