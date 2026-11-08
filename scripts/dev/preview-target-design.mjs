// 目标态视觉设计稿：整张表格化的周视图（不是「表头 + 网格」两块拼起来）
//
// 用法：node scripts/dev/preview-target-design.mjs [--dark]
// 产物：scripts/dev/out/target-design.html（--dark 则 target-design-dark.html）
//
// 目标态已落到插件（DEC-014）。本稿保留为视觉基准，并演示「无把手边缘拖动」：
// 打开 HTML 后把光标移到任一块的上/下沿会变 ns-resize，块再矮也一样。
// 左栏：整点等距（36px/行，共 16 行 = 576px）
// 右栏：内容驱动（有记录覆盖的小时 40px、空档 22px）
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "./lib/elastic.mjs";

const START = 6;
const END = 24;
const RULER_W = 64;
const PANEL_W = 1110;
const BODY_H = 576;
const COL_W = (PANEL_W - RULER_W) / 7;
const ALL_DAY_H = 36;
const HEAD_H = 46;

// ---- 场景：周一 8 日是你真实的那条「睡觉」，其它几天的记录是示例，用来看密度 ----
const DAYS = [
  { dow: "周日", num: 8, today: true, allDay: [{ text: "整理季度预算表", kind: "task" }], blocks: [
    { s: 6, e: 10, text: "睡觉", kind: "memo" }
  ] },
  { dow: "周一", num: 9, allDay: [], blocks: [] },
  { dow: "周二", num: 10, allDay: [{ text: "给服务器续费", kind: "memo" }], blocks: [
    { s: 9, e: 9.5, text: "站会", kind: "task" },
    { s: 10, e: 11.5, text: "写周报", kind: "memo" },
    { s: 14, e: 15.5, text: "排查线上告警", kind: "memo" }
  ] },
  { dow: "周三", num: 11, allDay: [], blocks: [
    { s: 8, e: 11, text: "体检", kind: "task" }
  ] },
  { dow: "周四", num: 12, allDay: [], blocks: [
    { s: 11, e: 12, text: "例会", kind: "task" },
    { s: 16, e: 17, text: "复盘", kind: "memo" }
  ] },
  { dow: "周五", num: 13, allDay: [], blocks: [] },
  { dow: "周六", num: 14, allDay: [], blocks: [
    { s: 20, e: 21.5, text: "读书", kind: "memo" }
  ] }
];

const fmtH = (h) => {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};
const dur = (b) => {
  const m = Math.round((b.e - b.s) * 60);
  return m % 60 === 0 ? `${m / 60}h` : `${m}m`;
};

// ---- 行高与坐标 ----
function makeRowHeights(mode) {
  if (mode === "even") return Array.from({ length: END - START }, () => BODY_H / (END - START));
  const covered = new Set();
  DAYS.forEach((d) => d.blocks.forEach((b) => {
    for (let h = Math.floor(b.s); h < Math.ceil(b.e); h++) covered.add(h);
  }));
  return Array.from({ length: END - START }, (_, i) => (covered.has(START + i) ? 40 : 22));
}

function geom(mode) {
  const heights = makeRowHeights(mode);
  // 等距模式下把总量拉到填满 BODY_H（表格满屏更接近真实观感）
  if (mode === "even") {
    const scale = BODY_H / heights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < heights.length; i++) heights[i] *= scale;
  }
  const bounds = [0];
  heights.forEach((h, i) => bounds.push(bounds[i] + h));
  const yOf = (hour) => {
    const rel = Math.max(0, Math.min(heights.length, hour - START));
    const i = Math.min(heights.length - 1, Math.floor(rel));
    return bounds[i] + (rel - i) * heights[i];
  };
  return { heights, yOf, total: bounds[bounds.length - 1] };
}

function blockHtml(b, g) {
  const top = g.yOf(b.s);
  const h = g.yOf(b.e) - top;
  const compact = h < 34;
  const cls = ["blk", b.kind === "task" ? "is-task" : "is-memo", compact ? "is-compact" : ""].join(" ");
  const meta = h >= 40 ? `<div class="blk-meta">${fmtH(b.s)} – ${fmtH(b.e)}</div>` : "";
  const tail = h >= 78 ? `<div class="blk-end">${dur(b)}</div>` : "";
  // 没有任何把手 DOM：上下边缘本身就是命中区，任意高度都能改起止
  return `<div class="${cls}" style="top:${top.toFixed(1)}px;height:${h.toFixed(1)}px">
      <div class="blk-title">${b.text}</div>
      ${meta}
      ${tail}
    </div>`;
}

function panel(mode) {
  const g = geom(mode);

  let hlines = "";
  for (let h = START; h <= END; h++) {
    const y = g.yOf(h).toFixed(1);
    hlines += `<div class="hline" style="top:${y}px"></div>`;
  }

  let times = "";
  for (let h = START; h <= END; h++) {
    const cls = (h === START ? " is-first" : h === END ? " is-last" : "") + (h === 15 ? " is-now" : "");
    times += `<div class="time${cls}" style="top:${g.yOf(h).toFixed(1)}px">${String(h).padStart(2, "0")}:00</div>`;
  }

  const heads = DAYS.map(
    (d) => `<div class="cell day ${d.today ? "is-today" : ""}">
        <span class="dow">${d.dow}</span><span class="dnum">${d.num}</span>
      </div>`
  ).join("");

  const allDay = DAYS.map(
    (d) => `<div class="cell allday-cell ${d.today ? "is-today" : ""}">
        ${d.allDay.map((a) => `<span class="chip ${a.kind === "task" ? "is-task" : "is-memo"}">${a.text}</span>`).join("")}
      </div>`
  ).join("");

  const plots = DAYS.map(
    (d) => `<div class="dayplot ${d.today ? "is-today" : ""}">
        ${d.blocks.map((b) => blockHtml(b, g)).join("")}
      </div>`
  ).join("");

  const label = mode === "even" ? "等距 · 36px/行" : "内容驱动 · 内容行 40 / 空档 22";

  return `
  <section class="panel">
    <div class="panel-head"><strong>${label}</strong><span>轴总高 ${g.total.toFixed(0)}px，超出视口时滚动</span></div>
    <div class="cal" style="width:${PANEL_W}px">
      <div class="head" style="height:${HEAD_H}px">
        <div class="cell corner"></div>
        ${heads}
      </div>
      <div class="allday" style="height:${ALL_DAY_H}px">
        <div class="cell allday-label"><span>ALL DAY</span></div>
        ${allDay}
      </div>
      <div class="body" style="height:${Math.ceil(g.total)}px">
        <div class="lines">${hlines}</div>
        ${times}
        <div class="plots">${plots}</div>
      </div>
    </div>
    <div class="panel-foot">竖线从表头一直贯穿到网格底部 · 时间标签用描边断开横线 · 块的上下边缘就是拖拽命中区（无把手，任意高度可拖）</div>
  </section>`;
}

const css = `
:root{
  --bg:#ffffff; --bg-sub:#fcfcfd; --line:#ececf0; --line-strong:#e3e3e9;
  --text:#1f2328; --muted:#8b8f99; --faint:#a8acb5;
  --accent:#7c5cff; --accent-tint:rgba(124,92,255,.20); --accent-line:rgba(124,92,255,.42);
  --accent-soft:rgba(124,92,255,.05);
  --orange:#d97f00; --orange-tint:rgba(232,137,12,.22); --orange-line:rgba(232,137,12,.45);
  --blk-sub:#6f7480; --chip-bg:rgba(124,92,255,.12); --chip-bg-task:rgba(232,137,12,.13);
  --font:-apple-system,"Segoe UI","PingFang SC","Noto Sans CJK SC",sans-serif;
}
body.dark{
  --bg:#191a1c; --bg-sub:#1e1f22; --line:#2b2c31; --line-strong:#34353b;
  --text:#e7e7ec; --muted:#8d8f99; --faint:#6d707a;
  --accent:#a48bff; --accent-tint:rgba(140,110,255,.22); --accent-line:rgba(160,132,255,.42);
  --accent-soft:rgba(140,110,255,.08);
  --orange:#f0a53c; --orange-tint:rgba(240,165,60,.20); --orange-line:rgba(240,165,60,.4);
  --blk-sub:rgba(228,228,240,.72); --chip-bg:rgba(150,124,255,.20); --chip-bg-task:rgba(240,165,60,.20);
}
*{box-sizing:border-box}
body{margin:0;padding:22px 24px 40px;background:var(--bg);color:var(--text);
  font-family:var(--font);-webkit-font-smoothing:antialiased}
h1{font-size:.95rem;margin:0 0 6px;font-weight:600}
.sub{color:var(--muted);font-size:.76rem;line-height:1.75;margin-bottom:18px;max-width:960px}
.stack{display:flex;flex-direction:column;gap:22px}
.panel{width:fit-content;border:1px solid var(--line-strong);border-radius:12px;overflow:hidden;background:var(--bg)}
.panel-head{display:flex;align-items:baseline;gap:8px;padding:10px 14px;font-size:.78rem;
  border-bottom:1px solid var(--line-strong);background:var(--bg-sub)}
.panel-head span{color:var(--muted);font-size:.7rem}
.panel-foot{padding:8px 14px;font-size:.68rem;color:var(--muted);border-top:1px solid var(--line);background:var(--bg-sub)}
.toggle{position:fixed;right:20px;top:20px;font-size:.72rem;padding:6px 12px;border-radius:7px;cursor:pointer;
  border:1px solid var(--line-strong);background:var(--bg-sub);color:var(--text);font-family:var(--font)}

/* ---------- 整张表 ---------- */
.cal{display:flex;flex-direction:column;background:var(--bg);border-right:1px solid var(--line)}

/* 表头：和网格同底、同一套竖线，不再是一块灰底 */
.head{display:flex;border-bottom:1px solid var(--line)}
.allday{display:flex;border-bottom:1px solid var(--line)}
.cell{width:${COL_W.toFixed(2)}px;flex:0 0 ${COL_W.toFixed(2)}px;border-left:1px solid var(--line);
  display:flex;align-items:center;justify-content:center;position:relative}
.cell:first-child{width:${RULER_W}px;flex:0 0 ${RULER_W}px;border-left:none}
.cell.is-today{background:var(--accent-soft)}
.head .day{gap:7px;cursor:pointer}
.head .day.is-today{background:var(--accent-soft)}
.head .day.is-today::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--accent)}
.dow{font-size:.7rem;color:var(--muted);letter-spacing:.02em}
.dnum{font-size:.95rem;font-weight:600;font-variant-numeric:tabular-nums}
.head .day.is-today .dnum{color:var(--accent)}

/* ALL DAY 行：就是表格的一行，左侧有行标签 */
.allday-label{justify-content:flex-end;padding-right:9px}
.allday-label span{font-size:.625rem;letter-spacing:.1em;color:var(--text);font-weight:600;white-space:nowrap;opacity:.72}
.allday-cell{justify-content:flex-start;padding:3px 6px;gap:5px;flex-wrap:wrap;align-content:center}
.chip{display:inline-flex;align-items:center;max-width:100%;padding:1px 7px 1px 6px;border-radius:4px;
  font-size:.7rem;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  border-left:2px solid var(--accent);background:var(--chip-bg);color:var(--text)}
.chip.is-task{border-left-color:var(--orange);background:var(--chip-bg-task)}
.chip.is-memo{border-left-color:var(--accent);background:var(--chip-bg)}

/* 网格主体 */
.body{position:relative;background:var(--bg)}
.lines{position:absolute;inset:0;pointer-events:none}
.hline{position:absolute;left:0;right:0;height:0;border-top:1px solid var(--line)}
.time{position:absolute;left:0;width:${RULER_W - 9}px;text-align:right;transform:translateY(-50%);
  font-size:.685rem;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums;
  letter-spacing:-.01em;line-height:1.1;z-index:2;
  text-shadow:0 0 2px var(--bg),0 0 2px var(--bg),0 0 3px var(--bg)}
.time.is-now{color:var(--accent)}
.time.is-now::after{content:"";position:absolute;right:-13px;top:50%;width:9px;height:1px;
  background:var(--accent);transform:translateY(-50%)}
.time.is-first{transform:translateY(0)}
.time.is-last{transform:translateY(-100%)}
.plots{position:absolute;left:${RULER_W}px;right:0;top:0;bottom:0;display:flex}
.dayplot{flex:1 1 0;position:relative;border-left:1px solid var(--line)}
.dayplot.is-today{background:var(--accent-soft)}

/* 时间块：实色卡片，文字用正文色；没有把手，上下边缘本身就是命中区 */
.blk{position:absolute;left:4px;right:4px;border-radius:7px;padding:7px 8px 6px 10px;
  background:var(--accent-tint);border:1px solid var(--accent-line);border-left:4px solid var(--accent);
  overflow:hidden;cursor:grab;user-select:none;transition:background .12s ease,box-shadow .12s ease}
.blk.is-task{background:var(--orange-tint);border-color:var(--orange-line);border-left-color:var(--orange)}
.blk:hover{box-shadow:0 2px 10px rgba(0,0,0,.10)}
.blk.is-compact{padding:3px 7px 3px 8px}
.blk-title{font-size:.775rem;font-weight:550;line-height:1.3;color:var(--text);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.blk.is-compact{padding:2px 6px 2px 8px}
.blk.is-compact .blk-title{font-size:.7rem;line-height:1.15}
.blk-meta{margin-top:2px;font-size:.665rem;line-height:1.25;color:var(--blk-sub);font-variant-numeric:tabular-nums;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.blk-end{position:absolute;right:9px;bottom:5px;font-size:.63rem;font-weight:600;color:var(--blk-sub);
  font-variant-numeric:tabular-nums;opacity:.9}

/* 无把手：命中区按块高 1/3 取（2–9px），靠光标变化提示；
   下方脚本让预览 HTML 里可以直接体验 ns-resize / grab 的切换 */
.blk:hover{border-color:var(--accent);box-shadow:0 2px 12px rgba(0,0,0,.10)}
.blk.is-task:hover{border-color:var(--orange)}

.note{display:inline-flex;align-items:center;gap:6px;margin:10px 0 0;font-size:.7rem;color:var(--muted)}
.note b{color:var(--text);font-weight:600}
`;

const dark = process.argv.includes("--dark");

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>TimeNote 目标态设计稿</title>
<style>${css}</style></head>
<body${dark ? ' class="dark"' : ""}>
<h1>目标态：把周视图做成「一整张表格」</h1>
<div class="sub">
已按此稿实现到插件（DEC-014）。<b>①</b> 表头、ALL DAY、整点网格共用同一套竖线和底色，竖线从日期行一路贯穿到底；<b>②</b> 06:00 之上的 <code>ALL DAY</code> 就是表格里普通的一行 —— 不加底色、不加粗线，去掉那几个字母它和 07:00 那行没有区别；<b>③</b> 时间刻度用 600 字重 + 正文色（当前小时染成主色），标签用描边把横线断开而不是盖一块白底；<b>④</b> 时间块是实色卡片、文字用正文色，块内只写标题与起止时间，时长落在右下角；<b>⑤</b> <b>没有任何把手</b> —— 上下边缘本身就是拖拽命中区，按块高 1/3 自适应，块再矮也能改起止，光标靠近边缘时变成 ns-resize。
</div>
${dark ? "" : `<button class="toggle" onclick="document.body.classList.toggle('dark')">切换深色</button>`}
<div class="stack">
${panel("even")}
${panel("content")}
</div>
<div class="note">示例数据：周一 8 日「睡觉 06:00–10:00」是你的真实记录；其余几条用来观察密度。把鼠标移到任意块的上/下沿（包括最矮的「站会」）即可看到光标变成 ns-resize —— 没有把手，边缘直接拖。</div>
<script>
document.querySelectorAll(".blk").forEach(function (el) {
  el.addEventListener("pointermove", function (ev) {
    var r = el.getBoundingClientRect();
    var edge = Math.max(2, Math.min(9, r.height / 3));
    var off = ev.clientY - r.top;
    el.style.cursor = (off <= edge || r.height - off <= edge) ? "ns-resize" : "grab";
  });
  el.addEventListener("pointerleave", function () { el.style.cursor = ""; });
});
</script>
</body></html>`;

const outDir = path.join(PROJECT_ROOT, "scripts", "dev", "out");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, dark ? "target-design-dark.html" : "target-design.html");
fs.writeFileSync(outFile, html);
console.log(`已生成：${path.relative(PROJECT_ROOT, outFile)}`);
