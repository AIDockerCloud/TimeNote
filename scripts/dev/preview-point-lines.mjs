// 时间点线视觉预览（DEC-018）：复刻 renderBlockGrid 的真实 DOM + 仓库真实 styles.css，
// 变量环境对齐 Obsidian（故意不定义 --color-accent-rgb 等不存在的变量）。
//
// 用法：node scripts/dev/preview-point-lines.mjs
// 产物：scripts/dev/out/point-lines.html（浅色）/ point-lines-dark.html（深色）
//
// 第 1 天 = 默认「信息在线下」；第 2 天 = .is-above 演示「信息在线上」；
// 第 3 天 = 只读（Blinko）与已完成态。页面底部探针会核对每条线的 top 是否精确等于刻度 y。
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "./lib/elastic.mjs";

const css = fs.readFileSync(path.join(PROJECT_ROOT, "styles.css"), "utf8");

const THEMES = {
  light: {
    label: "浅色",
    body: "#f2f3f6",
    note: "#4a4a55",
    vars: `--background-primary:#ffffff;--background-secondary:#fcfcfc;--background-secondary-alt:#f6f6f6;
     --background-primary-alt:#fafafa;--background-modifier-border:#e4e4e4;--background-modifier-hover:#efefef;
     --text-normal:#222222;--text-muted:#707070;--text-faint:#ababab;--text-on-accent:#fff;
     --color-accent:#7c5cff;--color-accent-1:#6a48f0;--color-accent-2:#5636d8;
     --color-orange:#ec7500;--color-green:#08b94e;--color-purple:#7852ee;
     --color-red:#e93147;--color-yellow:#e0ac00;--color-cyan:#00bfbc;
     --color-blue:#086ddd;--color-pink:#d53984;
     --interactive-accent:#7c5cff;--font-interface:-apple-system,"Segoe UI",sans-serif;`
  },
  dark: {
    label: "深色",
    body: "#141416",
    note: "#c9c9d0",
    vars: `--background-primary:#1c1c1c;--background-secondary:#212121;--background-secondary-alt:#282828;
     --background-primary-alt:#232323;--background-modifier-border:#3f3f3f;--background-modifier-hover:#2e2e2e;
     --text-normal:#dadada;--text-muted:#999;--text-faint:#666;--text-on-accent:#fff;
     --color-accent:#a882ff;--color-accent-1:#9570ff;--color-accent-2:#7c5cff;
     --color-orange:#e9973f;--color-green:#44cf6e;--color-purple:#a882ff;
     --color-red:#fb464c;--color-yellow:#e0de71;--color-cyan:#53dfdd;
     --color-blue:#027aff;--color-pink:#fa99cd;
     --interactive-accent:#a882ff;--font-interface:-apple-system,"Segoe UI",sans-serif;`
  }
};

const DAYS = [
  { dow: "MON", num: 9, today: false, chips: [], title: "信息在线下（默认）" },
  { dow: "TUE", num: 10, today: true, chips: ["还书"], title: "信息在线上（.is-above）" },
  { dow: "WED", num: 11, today: false, chips: [], title: "只读 / 已完成" }
];

const START = 7;
const END = 22;
const SLOT = 56;
const ROW_H = 20;      // 与 main.ts 的 POINT_ROW_H 一致
const LABEL_GAP = 3;   // 与 main.ts 的 POINT_LABEL_GAP 一致
const rows = END - START;
const totalHeight = rows * SLOT;
const yOf = (hour) => (hour - START) * SLOT;
const fmtTime = (hour) => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
};
const tint = (name) => `var(--color-${name})`;

// 时间块（范围记录），与点线并存，验证两者不互相串成一种东西
const BLOCKS = [
  { day: 0, s: 8.5, e: 10, text: "晨间专注", tint: "purple" },
  { day: 0, s: 14, e: 15.5, text: "写周报", tint: "blue" },
  { day: 1, s: 13, e: 14, text: "例会", tint: "green" },
  { day: 2, s: 19, e: 20.5, text: "读书", tint: "orange" }
];

// 时间点（只有开始时刻）。row = 同簇内的堆叠行号，above = 演示线上模式
const POINTS = [
  { day: 0, s: 9 + 23 / 60, text: "到公司", row: 0, tint: "cyan" },
  { day: 0, s: 9 + 25 / 60, text: "泡咖啡", row: 1, tint: "yellow" },
  { day: 0, s: 12 + 5 / 60, text: "午饭 #生活", row: 0, tint: "pink" },
  { day: 0, s: 18 + 40 / 60, text: "下班打卡", row: 0, tint: "red" },
  { day: 1, s: 10 + 12 / 60, text: "收到告警", row: 0, tint: "red", above: true },
  { day: 1, s: 10 + 14 / 60, text: "确认恢复", row: 1, tint: "green", above: true },
  { day: 1, s: 15 + 47 / 60, text: "复盘笔记", row: 0, tint: "purple", above: true },
  { day: 2, s: 11 + 3 / 60, text: "Blinko 闪念（只读）", row: 0, tint: "cyan", readonly: true },
  { day: 2, s: 16 + 20 / 60, text: "[x] 已交水电费", row: 0, tint: "blue", completed: true }
];

const headerCol = (d) => `<div class="timenote-header-day-col ${d.today ? "is-today" : ""}">
  <div class="timenote-day-title-row"><span class="timenote-day-name">${d.dow}</span><span class="timenote-day-num">${d.num}</span></div>
  <div class="timenote-day-allday-container" style="height:36px;min-height:36px;max-height:36px">
    ${d.chips.map(c => `<div class="timenote-all-day-chip is-memo"><span class="timenote-all-day-chip-text">${c}</span></div>`).join("")}
  </div>
</div>`;

const rulerLabels = Array.from({ length: rows + 1 }, (_, i) => {
  const h = START + i;
  return `<div class="timenote-block-ruler-label ${i === 0 ? "is-first" : ""} ${h === 10 ? "is-now" : ""}" style="top:${yOf(h)}px">${fmtTime(h)}</div>`;
}).join("");

const hourLines = Array.from({ length: rows + 1 }, (_, i) =>
  `<div class="timenote-block-hour-line" style="top:${yOf(START + i)}px"></div>`
).join("");

const blockHtml = (b) => {
  const top = yOf(b.s);
  const height = yOf(b.e) - top;
  return `<div class="timenote-event-block is-memo ${height < 34 ? "is-dense" : ""}" style="top:${top}px;height:${height}px;left:0;width:calc(100% - 6px);--tn-tint:${tint(b.tint)}">
    <div class="timenote-event-block-title"><span>${b.text}</span></div>
    <div class="timenote-event-block-meta">${fmtTime(b.s)} – ${fmtTime(b.e)}</div>
    <div class="timenote-event-block-duration">${(b.e - b.s).toFixed(1)}h</div>
  </div>`;
};

const pointHtml = (p) => {
  const y = yOf(p.s);
  const cls = [
    "timenote-point-line", "is-memo",
    p.above ? "is-above" : "",
    p.readonly ? "is-readonly" : "",
    p.completed ? "is-completed" : ""
  ].filter(Boolean).join(" ");
  return `<div class="${cls}" data-y="${y}" style="top:${y}px;--tn-tint:${tint(p.tint)}">
    <div class="timenote-point-line-hit"></div>
    <div class="timenote-point-line-bar"></div>
    <span class="timenote-point-line-dot"></span>
    <div class="timenote-point-line-label" style="--tn-label-offset:${LABEL_GAP + p.row * ROW_H}px">
      <span class="timenote-point-line-time">${fmtTime(p.s)}</span>
      <span class="timenote-point-line-text">${p.text}</span>
    </div>
  </div>`;
};

const gridCol = (d, idx) => `
  <div class="timenote-column timenote-block-column ${d.today ? "is-today" : ""}" style="height:${totalHeight + 14}px">
    ${hourLines}
    <div class="timenote-block-slot-layer" style="top:0;height:${totalHeight}px;bottom:auto"></div>
    ${BLOCKS.filter(b => b.day === idx).map(blockHtml).join("")}
    ${POINTS.filter(p => p.day === idx).map(pointHtml).join("")}
  </div>`;

const legend = DAYS.map((d, i) =>
  `<span class="lg-item"><b>第 ${i + 1} 天</b> ${d.title}</span>`
).join("");

// 探针脚本：用普通字符串拼接，避免与外层模板字符串冲突
const probe = [
  "const wrapper = document.getElementById('wrapper');",
  "const header = document.getElementById('header');",
  "const scrollArea = document.getElementById('scrollArea');",
  "const sync = () => { const g = Math.max(0, scrollArea.offsetWidth - scrollArea.clientWidth); header.style.paddingRight = g + 'px'; return g; };",
  "sync(); new ResizeObserver(sync).observe(scrollArea);",
  "const lines = [...document.querySelectorAll('.timenote-point-line')];",
  "const blocks = [...document.querySelectorAll('.timenote-event-block')];",
  "const worstY = Math.max(...lines.map(el => Math.abs(parseFloat(el.style.top) - Number(el.dataset.y))));",
  "const barColor = getComputedStyle(document.querySelector('.timenote-point-line-bar')).borderTopColor;",
  "const below = [...document.querySelectorAll('.timenote-point-line:not(.is-above) .timenote-point-line-label')].map(el => parseFloat(getComputedStyle(el).top));",
  "const above = [...document.querySelectorAll('.timenote-point-line.is-above .timenote-point-line-label')].map(el => parseFloat(getComputedStyle(el).top));",
  "const hs = [...document.querySelectorAll('.timenote-header-day-col')];",
  "const gs = [...document.querySelectorAll('.timenote-block-column')];",
  "const worstCol = Math.max(...hs.map((h,i) => Math.abs(gs[i].getBoundingClientRect().left - h.getBoundingClientRect().left)));",
  "const out = [",
  "  '点线数量: ' + lines.length + '  /  时间块数量: ' + blocks.length,",
  "  '线 top 与刻度 y 偏差: ' + (worstY < 0.01 ? 'PASS' : 'FAIL') + '  最大 ' + worstY + 'px',",
  "  '横线颜色(真机变量): ' + barColor + (barColor === 'rgba(0, 0, 0, 0)' ? '  ← 透明！' : '  ✓'),",
  "  '线下标签 top: ' + below.slice(0,5).join(', ') + ' ... (均为正数)',",
  "  '线上标签 top: ' + above.join(', ') + ' (均为负数)',",
  "  '表头/网格列偏移: ' + (worstCol < 0.6 ? 'PASS' : 'FAIL') + '  最大 ' + worstCol.toFixed(2) + 'px',",
  "  '同簇堆叠: 09:23 与 09:25 的标签 top 差 ' + (below[1] - below[0]) + 'px（应为 20px）',",
  "  '只读态: ' + document.querySelectorAll('.timenote-point-line.is-readonly').length + ' 条（Blinko 不可拖）'",
  "].join('\\n');",
  "document.getElementById('probe').textContent = out;"
].join("\n");

const outDir = path.join(PROJECT_ROOT, "scripts/dev/out");
fs.mkdirSync(outDir, { recursive: true });

for (const [key, theme] of Object.entries(THEMES)) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>TimeNote 时间点线预览（${theme.label}）</title>
<style>
:root{${theme.vars}}
body{margin:0;padding:18px 20px 28px;background:${theme.body};color:var(--text-normal);font-family:var(--font-interface)}
.note{max-width:1100px;margin:0 auto 12px;font-size:.76rem;line-height:1.75;color:${theme.note}}
.note b{color:var(--color-accent)}
.legend{max-width:1100px;margin:0 auto 12px;display:flex;gap:18px;flex-wrap:wrap;font-size:.72rem;color:${theme.note}}
.lg-item{padding:2px 8px;border:1px solid var(--background-modifier-border);border-radius:5px;background:var(--background-primary)}
.frame{max-width:1100px;margin:0 auto;height:620px;border:1px solid var(--background-modifier-border);border-radius:10px;overflow:hidden;background:var(--background-primary)}
${css}
#probe{max-width:1100px;margin:14px auto 0;padding:10px 12px;border:1px solid var(--background-modifier-border);border-radius:8px;
  background:var(--background-primary);font:12px/1.6 ui-monospace,monospace;white-space:pre-wrap;color:var(--text-normal)}
</style></head>
<body>
<div class="note">复刻 <b>renderBlockGrid 的真实 DOM</b> + 仓库真实 <code>styles.css</code>，变量环境对齐 Obsidian（不提供 <code>--color-accent-rgb</code>）。
<b>只有 HH:mm、没有结束时间与时长标签</b>的记录现在是一条精确落在对应时刻的横线，信息列在<b>线下</b>；同一 15 分钟簇内多条记录逐行错开。
范围记录仍是时间块。整条线可上下拖动改时刻（1 分钟吸附），<b>没有边缘把手、不会拖成时间块</b>；Blinko 等外部来源只读。
这里用等距 56px/行方便核对刻度，真机默认走弹性时间轴。</div>
<div class="legend">${legend}</div>
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
        <div class="timenote-columns-container timenote-block-columns" style="height:${totalHeight + 14}px">
          <div class="timenote-block-ruler">${rulerLabels}</div>
          ${DAYS.map(gridCol).join("")}
          <div class="timenote-now-line" style="top:${yOf(10.5)}px"><span class="timenote-now-label">10:30</span></div>
        </div>
      </div>
    </div>
  </div>
</div>
<pre id="probe">测量中…</pre>
<script>
${probe}
</script>
</body></html>`;
  const file = path.join(outDir, key === "dark" ? "point-lines-dark.html" : "point-lines.html");
  fs.writeFileSync(file, html, "utf8");
  console.log(`生成 ${path.relative(PROJECT_ROOT, file)}`);
}
