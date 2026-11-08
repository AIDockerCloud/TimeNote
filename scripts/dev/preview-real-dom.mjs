// 真机等效预览：复刻 renderBlockGrid 的真实 DOM 结构，直接内联仓库里的 styles.css，
// 并且**故意不定义** --color-accent-rgb / --color-orange-rgb 等变量 —— 这正是 Obsidian 真机的环境。
// 之前的设计稿脚本自己补了这些变量，所以预览有颜色、真机全透明，问题被掩盖了。
//
// 用法：
//   node scripts/dev/preview-real-dom.mjs          # 浅色
//   node scripts/dev/preview-real-dom.mjs --dark  # 深色
// 产物：scripts/dev/out/real-dom.html / real-dom-dark.html
//
// 页面底部的「探针」会输出表头列与网格列的 left/width 差值，以及块 / chip / 今日列的
// 实际 computed background-color，用来验证「竖线对齐 + 背景色存在」。
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "./lib/elastic.mjs";

const dark = process.argv.includes("--dark");
const css = fs.readFileSync(path.join(PROJECT_ROOT, "styles.css"), "utf8");

// Obsidian 真实存在的变量（浅色 / 深色）。注意没有 --color-accent-rgb。
const themeVars = dark
  ? `--background-primary:#1c1c1c;--background-secondary:#212121;--background-secondary-alt:#282828;
     --background-primary-alt:#232323;--background-modifier-border:#3f3f3f;--background-modifier-hover:#2e2e2e;
     --text-normal:#dadada;--text-muted:#999;--text-faint:#666;--text-on-accent:#fff;
     --color-accent:#a882ff;--color-accent-1:#9570ff;--color-accent-2:#7c5cff;
     --color-orange:#e9973f;--color-green:#44cf6e;--color-purple:#a882ff;
     --color-red:#fb464c;--color-yellow:#e0de71;--color-cyan:#53dfdd;
     --color-blue:#027aff;--color-pink:#fa99cd;
     --interactive-accent:#a882ff;--font-interface:-apple-system,"Segoe UI",sans-serif;`
  : `--background-primary:#ffffff;--background-secondary:#fcfcfc;--background-secondary-alt:#f6f6f6;
     --background-primary-alt:#fafafa;--background-modifier-border:#e4e4e4;--background-modifier-hover:#efefef;
     --text-normal:#222222;--text-muted:#707070;--text-faint:#ababab;--text-on-accent:#fff;
     --color-accent:#7c5cff;--color-accent-1:#6a48f0;--color-accent-2:#5636d8;
     --color-orange:#ec7500;--color-green:#08b94e;--color-purple:#7852ee;
     --color-red:#e93147;--color-yellow:#e0ac00;--color-cyan:#00bfbc;
     --color-blue:#086ddd;--color-pink:#d53984;
     --interactive-accent:#7c5cff;--font-interface:-apple-system,"Segoe UI",sans-serif;`;

const DAYS = [
  { dow: "MON", num: 6, today: false, chips: ["交水电费"] },
  { dow: "TUE", num: 7, today: false, chips: [] },
  { dow: "WED", num: 8, today: false, chips: ["取快递", "还书"] },
  { dow: "THU", num: 9, today: true, chips: [] },
  { dow: "FRI", num: 10, today: false, chips: ["周会纪要"] },
  { dow: "SAT", num: 11, today: false, chips: [] },
  { dow: "SUN", num: 12, today: false, chips: [] }
];

const SLOT = 36;
const START = 6;
const END = 24;
const H = (h) => h * 3600;
// 与 main.ts 的 BLOCK_TINTS 一致；预览里按「天 + 当天序号」给不同色，
// 用来直观看到「同一天的时间块互不撞色」（真实插件由 assignDayTints 分配）。
const TINTS = ["purple", "blue", "cyan", "green", "yellow", "orange", "red", "pink"];
const rows = END - START;
const totalHeight = rows * SLOT;
const yOf = (hour) => (hour - START) * SLOT;
const fmt = (hour) => `${String(hour).padStart(2, "0")}:00`;

const BLOCKS = [
  { day: 0, s: 6, e: 10, text: "睡觉", task: false },
  { day: 0, s: 14, e: 15.5, text: "写周报", task: true },
  { day: 2, s: 8, e: 11, text: "体检", task: true },
  { day: 2, s: 19, e: 20, text: "读书", task: false },
  { day: 3, s: 9, e: 10, text: "例会", task: true },
  { day: 3, s: 9.5, e: 11, text: "排查告警", task: false },
  { day: 4, s: 20, e: 21.5, text: "复盘", task: false }
];

const headerCol = (d) => `<div class="timenote-header-day-col ${d.today ? "is-today" : ""}">
  <div class="timenote-day-title-row"><span class="timenote-day-name">${d.dow}</span><span class="timenote-day-num">${d.num}</span></div>
  <div class="timenote-day-allday-container" style="height:36px;min-height:36px;max-height:36px">
    ${d.chips.map((c) => `<div class="timenote-all-day-chip is-memo"><span class="timenote-all-day-chip-text">${c}</span></div>`).join("")}
  </div>
</div>`;

const rulerLabels = Array.from({ length: rows + 1 }, (_, i) => {
  const h = START + i;
  return `<div class="timenote-block-ruler-label ${i === 0 ? "is-first" : ""} ${h === 9 ? "is-now" : ""}" style="top:${yOf(h)}px">${fmt(h)}</div>`;
}).join("");

const hourLines = Array.from({ length: rows + 1 }, (_, i) =>
  `<div class="timenote-block-hour-line" style="top:${yOf(START + i)}px"></div>`
).join("");

const gridCol = (d, idx) => {
  const blocks = BLOCKS.filter((b) => b.day === idx).map((b, bi) => {
    const top = yOf(b.s);
    const height = yOf(b.e) - top;
    const dense = height < 34 ? "is-dense" : "";
    const tint = TINTS[(idx * 3 + bi) % TINTS.length];
    return `<div class="timenote-event-block ${b.task ? "is-task" : "is-memo"} ${dense}" style="top:${top}px;height:${height}px;left:0;width:calc(100% - 6px);--tn-tint:var(--color-${tint})">
      <div class="timenote-event-block-title">${b.task ? '<input type="checkbox" class="timenote-card-checkbox">' : ""}<span>${b.text}</span></div>
      <div class="timenote-event-block-meta">${fmt(b.s)} – ${fmt(b.e)}</div>
      <div class="timenote-event-block-duration">${b.e - b.s}h</div>
    </div>`;
  }).join("");
  return `<div class="timenote-column timenote-block-column ${d.today ? "is-today" : ""}" style="height:${totalHeight}px">
    ${hourLines}
    <div class="timenote-block-slot-layer" style="top:0;height:${totalHeight}px;bottom:auto"></div>
    ${blocks}
  </div>`;
};

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>TimeNote 真机等效预览${dark ? "（深色）" : ""}</title>
<style>
:root{${themeVars}}
body{margin:0;padding:18px 20px 28px;background:${dark ? "#141416" : "#f2f3f6"};color:var(--text-normal);font-family:var(--font-interface)}
.note{max-width:1100px;margin:0 auto 14px;font-size:.76rem;line-height:1.7;color:${dark ? "#c9c9d0" : "#4a4a55"}}
.note b{color:var(--color-accent)}
.frame{max-width:1100px;margin:0 auto;height:620px;border:1px solid var(--background-modifier-border);border-radius:10px;overflow:hidden;background:var(--background-primary)}
${css}
#probe{max-width:1100px;margin:14px auto 0;padding:10px 12px;border:1px solid var(--background-modifier-border);border-radius:8px;
  background:var(--background-primary);font:12px/1.6 ui-monospace,monospace;white-space:pre-wrap;color:var(--text-normal)}
</style></head>
<body>
<div class="note">复刻插件 <b>renderBlockGrid 的真实 DOM</b> + 仓库里真实的 <code>styles.css</code>，变量环境对齐 Obsidian（<b>不提供 --color-accent-rgb</b>）。
这里用等距 36px/行只为了看清竖线与颜色，行高策略以插件设置为准；时间块按天自动分配 8 种不同颜色。表头与滚动区的宽度补偿由脚本按 <code>syncHeaderGutter</code> 的同一逻辑模拟。</div>
<div class="frame">
  <div class="timenote-container">
    <div class="timenote-timegrid-wrapper" id="wrapper">
      <div class="timenote-timegrid-header" id="header">
        <div class="timenote-header-days">
          <div class="timenote-block-ruler-spacer">
            <div class="timenote-ruler-corner"></div>
            <div class="timenote-allday-ruler-label">ALL DAY</div>
          </div>
          ${DAYS.map(headerCol).join("")}
        </div>
        <div class="timenote-header-resizer"></div>
      </div>
      <div class="timenote-scroll-area timenote-block-scroll" id="scrollArea">
        <div class="timenote-columns-container timenote-block-columns" style="height:${totalHeight}px">
          <div class="timenote-block-ruler">${rulerLabels}</div>
          ${DAYS.map(gridCol).join("")}
          <div class="timenote-now-line" style="top:${yOf(9.5)}px"><span class="timenote-now-label">09:30</span></div>
        </div>
      </div>
    </div>
  </div>
</div>
<pre id="probe">测量中…</pre>
<script>
// 与 main.ts syncHeaderGutter 完全一致：把滚动条宽度补成表头右 padding
const wrapper = document.getElementById('wrapper');
const header = document.getElementById('header');
const scrollArea = document.getElementById('scrollArea');
const sync = () => {
  const gutter = Math.max(0, scrollArea.offsetWidth - scrollArea.clientWidth);
  header.style.paddingRight = gutter + 'px';
  return gutter;
};
const gutter = sync();
new ResizeObserver(() => sync()).observe(scrollArea);

const hs = [...document.querySelectorAll('.timenote-header-day-col')];
const gs = [...document.querySelectorAll('.timenote-block-column')];
const rows = hs.map((h, i) => {
  const a = h.getBoundingClientRect(), b = gs[i].getBoundingClientRect();
  return { i, dLeft: +(b.left - a.left).toFixed(2), dWidth: +(b.width - a.width).toFixed(2) };
});
const worst = Math.max(...rows.map(r => Math.max(Math.abs(r.dLeft), Math.abs(r.dWidth))));
const bg = (sel) => {
  const el = document.querySelector(sel);
  return el ? getComputedStyle(el).backgroundColor : 'MISSING';
};
const allBgs = [...document.querySelectorAll('.timenote-event-block')]
  .map(el => getComputedStyle(el).backgroundColor);
const firstCol = document.querySelector('.timenote-column.timenote-block-column');
const dayBgs = firstCol
  ? [...firstCol.querySelectorAll('.timenote-event-block')].map(el => getComputedStyle(el).backgroundColor)
  : [];
const out = [
  '滚动条补偿: ' + gutter + 'px（表头 padding-right）',
  '列对齐: ' + (worst < 0.6 ? 'PASS' : 'FAIL') + '  最大偏差 ' + worst + 'px',
  rows.map(r => '  第' + (r.i + 1) + '列 左偏移 ' + r.dLeft + 'px / 宽度差 ' + r.dWidth + 'px').join('\\n'),
  '时间块颜色: ' + new Set(allBgs).size + ' 种 / ' + allBgs.length + ' 个块',
  '同一天互不撞色: ' + (dayBgs.length > 1 && new Set(dayBgs).size === dayBgs.length ? 'PASS' : 'FAIL')
    + '（第 1 天 ' + dayBgs.length + ' 块）',
  '时间块背景: ' + bg('.timenote-event-block'),
  '任务块背景: ' + bg('.timenote-event-block.is-task'),
  '全天 chip 背景: ' + bg('.timenote-all-day-chip'),
  '今日列(表头)背景: ' + bg('.timenote-header-day-col.is-today'),
  '今日列(网格)背景: ' + bg('.timenote-block-column.is-today')
].join('\\n');
document.getElementById('probe').textContent = out;
</script>
</body></html>`;

const outDir = path.join(PROJECT_ROOT, "scripts/dev/out");
fs.mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, dark ? "real-dom-dark.html" : "real-dom.html");
fs.writeFileSync(file, html, "utf8");
console.log(`生成 ${path.relative(PROJECT_ROOT, file)}`);
