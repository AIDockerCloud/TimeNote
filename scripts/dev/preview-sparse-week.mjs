// 稀疏一天（周视图里只有一条 4 小时记录）的视觉对比预览
//
// 用真实的设置与真实算法：startHour 6 / endHour 24 / slotHeight 36 / 视口 409px / 7 列。
// 左栏 = 当前实现（块铺满跨度，纯色块）
// 右栏 = 候选优化（空档更薄 + 刻度隔一小时 + 块内「内容卡 + 时长带」，块边界仍然精确对齐时间）
//
// 用法：node scripts/dev/preview-sparse-week.mjs
// 产物：scripts/dev/out/sparse-week.html
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, loadElasticInternals } from "./lib/elastic.mjs";

const { buildTimeScale, estimateBlockNeed } = loadElasticInternals();

const H = (h) => h * 3600;
const START = 6;
const END = 24;
const SLOT = 36;
const DAYS = 7;
const PANEL_W = 1079;
const VIEWPORT = 409;          // 06:00–24:00 在截图里占的像素高度
const RULER_W = 52;
const ALL_DAY_H = 89;

const COL_W = (PANEL_W - RULER_W) / DAYS;
const LANE_W = COL_W - 6;
const NEED = estimateBlockNeed({ text: "睡觉" }, LANE_W);

const ENTRY = { start: H(6), end: H(10), text: "睡觉", task: false };

const fmt = (sec) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const SAMPLE_CSS = `
/* ---- 候选优化：块 = 时间带 + 顶部内容卡 ---- */
.tn-band {
  position: absolute;
  box-sizing: border-box;
  left: 0;
  width: calc(100% - 6px);
  border-left: 3px solid var(--color-orange);
  border-radius: 6px;
  background: rgba(var(--color-orange-rgb), 0.035);
  cursor: pointer;
}
.tn-band.is-memo { border-left-color: var(--color-accent); background: rgba(var(--color-accent-rgb), 0.035); }
.tn-band-card {
  margin: 3px 3px 0 3px;
  padding: 4px 7px;
  border-radius: 5px;
  background: rgba(var(--color-orange-rgb), 0.13);
}
.tn-band.is-memo .tn-band-card { background: rgba(var(--color-accent-rgb), 0.11); }
.tn-band-duration {
  position: absolute;
  left: 10px;
  bottom: 6px;
  font-size: 0.66rem;
  color: var(--text-muted);
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}
`;

function header(cols) {
  const days = ["周日 8", "周一 9", "周二 10", "周三 11", "周四 12", "周五 13", "周六 14"];
  return `
      <div class="timenote-timegrid-header">
        <div class="timenote-header-days">
          <div class="timenote-block-ruler-spacer"></div>
          ${days
            .slice(0, cols)
            .map(
              (d, i) => `<div class="timenote-header-day-col ${i === 1 ? "is-today" : ""}">
              <div class="timenote-day-title-row"><span class="timenote-day-name">${d.split(" ")[0]}</span><span class="timenote-day-num">${d.split(" ")[1]}</span></div>
              <div class="timenote-day-allday-container" style="height:${ALL_DAY_H}px;min-height:${ALL_DAY_H}px;max-height:${ALL_DAY_H}px"></div>
            </div>`
            )
            .join("")}
        </div>
        <div class="timenote-header-resizer"></div>
      </div>`;
}

// ---------- 左：当前实现（真实 buildTimeScale） ----------
function panelCurrent() {
  const scale = buildTimeScale({
    startHour: START,
    endHour: END,
    slotHeight: SLOT,
    top: 0,
    elastic: true,
    viewportHeight: VIEWPORT,
    entries: [{ s: ENTRY.start, en: ENTRY.end, needH: NEED }]
  });
  const top = scale.yOf(ENTRY.start);
  const height = scale.yOf(ENTRY.end) - top;

  let labels = "";
  let lines = "";
  for (let h = START; h <= END; h++) {
    const y = scale.yOf(h * 3600).toFixed(1);
    const cls = ["timenote-block-ruler-label"];
    if (h === START) cls.push("is-first");
    if (scale.heights[h - START] < SLOT * 0.5) cls.push("is-dense");
    labels += `<div class="${cls.join(" ")}" style="top:${y}px">${String(h).padStart(2, "0")}:00</div>`;
    lines += `<div class="timenote-block-hour-line" style="top:${y}px"></div>`;
  }

  const block = `<div class="timenote-event-block" style="top:${top.toFixed(1)}px;height:${height.toFixed(1)}px;left:0;width:calc(100% - 6px)">
      <div class="timenote-event-block-title"><span>${ENTRY.text}</span></div>
      <div class="timenote-event-block-meta">${fmt(ENTRY.start)} - ${fmt(ENTRY.end)} · 4h</div>
    </div>`;

  const cols = Array.from({ length: DAYS }, (_, i) => `
      <div class="timenote-column timenote-block-column ${i === 1 ? "is-today" : ""}" style="height:${scale.totalHeight}px">
        ${lines}
        ${i === 1 ? block : ""}
      </div>`).join("");

  return {
    scale,
    html: `
  <section class="panel">
    <div class="panel-head"><strong>现在</strong><span>块铺满跨度 · 空档 ${scale.heights[10].toFixed(0)}px · 内容行 ${scale.heights[0].toFixed(0)}px · 轴 ${scale.totalHeight.toFixed(0)}px</span></div>
    <div class="timenote-container" style="width:${PANEL_W}px;height:${VIEWPORT + 12 + ALL_DAY_H + 38 + 2}px">
      <div class="timenote-timegrid-wrapper">
        ${header(DAYS)}
        <div class="timenote-scroll-area timenote-block-scroll" style="height:${VIEWPORT + 12}px">
          <div class="timenote-columns-container timenote-block-columns is-elastic" style="height:${scale.totalHeight + 14}px">
            <div class="timenote-block-ruler" style="height:${scale.totalHeight + 14}px">${labels}</div>
            ${cols}
          </div>
        </div>
      </div>
    </div>
    <div class="panel-foot">块高 ${height.toFixed(0)}px = 06:00→10:00 的真实跨度（每行 ${scale.heights[0].toFixed(0)}px）</div>
  </section>`
  };
}

// ---------- 右：候选优化 ----------
// 行高策略：内容行 = 内容需要的高度（不因填满视口被吹大）
//           空档行 = 12px 起，缺口优先补给它，单个空档最多 26px
function heightsCandidate() {
  const CONTENT = Math.max(40, Math.round(SLOT * 1.1)); // 40
  const EMPTY_BASE = 12;
  const EMPTY_CAP = 26;
  const h = [];
  for (let i = 0; i < END - START; i++) {
    const sec = (START + i) * 3600;
    const covered = sec < ENTRY.end && sec + 3600 > ENTRY.start;
    h.push(covered ? CONTENT : EMPTY_BASE);
  }
  const total = h.reduce((a, b) => a + b, 0);
  const gap = VIEWPORT - total;
  if (gap > 0) {
    const emptyIdx = h.map((v, i) => (v === EMPTY_BASE ? i : -1)).filter((i) => i >= 0);
    const room = emptyIdx.length * (EMPTY_CAP - EMPTY_BASE);
    const add = Math.min(gap, room) / Math.max(1, emptyIdx.length);
    emptyIdx.forEach((i) => (h[i] += add));
  }
  return h;
}

function panelCandidate() {
  const heights = heightsCandidate();
  const bounds = [0];
  heights.forEach((v, i) => bounds.push(bounds[i] + v));
  const total = bounds[bounds.length - 1];
  const yOf = (sec) => {
    const rel = Math.max(0, Math.min(heights.length, (sec - START * 3600) / 3600));
    const i = Math.min(heights.length - 1, Math.floor(rel));
    return bounds[i] + (rel - i) * heights[i];
  };

  const top = yOf(ENTRY.start);
  const height = yOf(ENTRY.end) - top;

  let labels = "";
  let lines = "";
  for (let h = START; h <= END; h++) {
    const y = yOf(h * 3600).toFixed(1);
    lines += `<div class="timenote-block-hour-line" style="top:${y}px"></div>`;
    // 空档太薄时只标偶数点，避免标签糊成一片
    const rowH = heights[Math.min(heights.length - 1, h - START)];
    if (h < END && rowH < 20 && h % 2 !== 0) continue;
    const cls = ["timenote-block-ruler-label"];
    if (h === START) cls.push("is-first");
    if (rowH < SLOT * 0.5) cls.push("is-dense");
    labels += `<div class="${cls.join(" ")}" style="top:${y}px">${String(h).padStart(2, "0")}:00</div>`;
  }

  const block = `<div class="tn-band" style="top:${top.toFixed(1)}px;height:${height.toFixed(1)}px">
      <div class="tn-band-card">
        <div class="timenote-event-block-title"><span>${ENTRY.text}</span></div>
        <div class="timenote-event-block-meta">${fmt(ENTRY.start)} - ${fmt(ENTRY.end)} · 4h</div>
      </div>
      <div class="tn-band-duration">4 小时</div>
    </div>`;

  const cols = Array.from({ length: DAYS }, (_, i) => `
      <div class="timenote-column timenote-block-column ${i === 1 ? "is-today" : ""}" style="height:${total}px">
        ${lines}
        ${i === 1 ? block : ""}
      </div>`).join("");

  return `
  <section class="panel">
    <div class="panel-head"><strong>候选优化</strong><span>块 = 时间带 + 顶部内容卡 · 空档 ${heights[10].toFixed(0)}px · 内容行 ${heights[0].toFixed(0)}px · 轴 ${total.toFixed(0)}px</span></div>
    <div class="timenote-container" style="width:${PANEL_W}px;height:${VIEWPORT + 12 + ALL_DAY_H + 38 + 2}px">
      <div class="timenote-timegrid-wrapper">
        ${header(DAYS)}
        <div class="timenote-scroll-area timenote-block-scroll" style="height:${VIEWPORT + 12}px">
          <div class="timenote-columns-container timenote-block-columns is-elastic" style="height:${total + 14}px">
            <div class="timenote-block-ruler" style="height:${total + 14}px">${labels}</div>
            ${cols}
          </div>
        </div>
      </div>
    </div>
    <div class="panel-foot">块的上下沿仍是 06:00 与 10:00（${height.toFixed(0)}px），只是内容只占顶部一张卡，下方淡带表示「这段时间在做这件事」</div>
  </section>`;
}

const left = panelCurrent();
const css = fs.readFileSync(path.join(PROJECT_ROOT, "styles.css"), "utf8");

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>TimeNote 稀疏一天 — 现状 / 候选优化</title>
<style>
:root{
  --background-primary:#ffffff; --background-secondary:#f7f7f8; --background-secondary-alt:#f0f0f1;
  --background-modifier-border:#e3e3e6; --background-modifier-hover:rgba(0,0,0,.06);
  --text-normal:#22252a; --text-muted:#8a8f98; --text-accent:#7c5cff; --text-on-accent:#fff;
  --interactive-accent:#7c5cff; --color-accent:#7c5cff; --color-accent-rgb:124,92,255;
  --color-orange:#e8890c; --color-orange-rgb:232,137,12; --color-green:#2eab58; --color-red:#e5484d;
  --font-interface:-apple-system,"Segoe UI","PingFang SC","Noto Sans CJK SC",sans-serif;
}
body.dark{
  --background-primary:#1b1b1d; --background-secondary:#232326; --background-secondary-alt:#28282c;
  --background-modifier-border:#38383d; --background-modifier-hover:rgba(255,255,255,.07);
  --text-normal:#dcdde0; --text-muted:#8e8e96; --text-accent:#a78bfa; --text-on-accent:#fff;
  --interactive-accent:#7c5cff; --color-accent:#8b6dff; --color-accent-rgb:139,109,255;
  --color-orange:#f0a047; --color-orange-rgb:240,160,71; --color-green:#4ec97a; --color-red:#ff6369;
}
*{box-sizing:border-box}
body{margin:0;padding:20px 22px 36px;background:var(--background-primary);color:var(--text-normal);
  font-family:var(--font-interface);font-size:16px}
h1{font-size:1rem;margin:0 0 6px;font-weight:600}
.sub{color:var(--text-muted);font-size:.78rem;line-height:1.7;margin-bottom:16px;max-width:900px}
.stack{display:flex;flex-direction:column;gap:20px}
.panel{border:1px solid var(--background-modifier-border);border-radius:10px;overflow:hidden;background:var(--background-primary);width:fit-content}
.panel-head{display:flex;align-items:baseline;gap:8px;padding:9px 12px;background:var(--background-secondary);
  border-bottom:1px solid var(--background-modifier-border);font-size:.8rem}
.panel-head span{color:var(--text-muted);font-size:.72rem}
.panel-foot{padding:7px 12px;font-size:.7rem;color:var(--text-muted);border-top:1px solid var(--background-modifier-border);
  background:var(--background-secondary);font-variant-numeric:tabular-nums}
.toggle{position:fixed;right:18px;top:18px;font-size:.75rem;padding:5px 11px;border-radius:6px;cursor:pointer;
  border:1px solid var(--background-modifier-border);background:var(--background-secondary);color:var(--text-normal)}
.timenote-event-block{bottom:auto}
${SAMPLE_CSS}
${css}
</style></head>
<body>
<h1>稀疏的一天（周视图只有一条 06:00–10:00 的记录）</h1>
<div class="sub">
真实参数：起始 06:00 / 结束 24:00 / 槽高 36px / 视口 409px / 7 列 / 列宽 ${COL_W.toFixed(0)}px。两栏用的是同一份记录与同一套行高算法，差别只在「行高怎么分配」和「块怎么画」。<br>
上方是当前实现：块铺满 06:00→10:00（这个已经对了），但空档行被视口填充放大、整条轴被吹成均匀 ~23px/行，块就是一大片纯色。<br>
下方是候选优化：内容行按内容给（${(Math.max(40, Math.round(SLOT * 1.1))).toFixed(0)}px，不为填满而放大），空档压到 12–26px 并把刻度隔一小时显示；块仍是精确的 06:00→10:00，但画成「顶部一张内容卡 + 下方淡色时间带」。
</div>
<button class="toggle" onclick="document.body.classList.toggle('dark')">切换深色</button>
<div class="stack">
${left.html}
${panelCandidate()}
</div>
</body></html>`;

const outDir = path.join(PROJECT_ROOT, "scripts", "dev", "out");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "sparse-week.html");
fs.writeFileSync(outFile, html);
console.log(`已生成：${path.relative(PROJECT_ROOT, outFile)}`);
console.log(`need=${NEED.toFixed(1)} 当前行高=${left.scale.heights[0].toFixed(1)}/${left.scale.heights[10].toFixed(1)} 轴=${left.scale.totalHeight.toFixed(0)}`);
