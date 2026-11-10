// DEC-022 交互预览：跨天拖动落点 + 新增时间点入口
// 内联仓库真实 styles.css，变量环境与 Obsidian 对齐（不补任何 --*-rgb 变量）。
//
// 用法：node scripts/dev/preview-cross-day.mjs
// 产物：scripts/dev/out/cross-day.html
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "./lib/elastic.mjs";

const css = fs.readFileSync(path.join(PROJECT_ROOT, "styles.css"), "utf8");
const VARS = `--background-primary:#ffffff;--background-secondary:#fcfcfc;--background-secondary-alt:#f6f6f6;
 --background-primary-alt:#fafafa;--background-modifier-border:#e4e4e4;--background-modifier-hover:#efefef;
 --text-normal:#222222;--text-muted:#707070;--text-faint:#ababab;--text-on-accent:#fff;
 --color-accent:#7c5cff;--color-accent-1:#6a48f0;--color-accent-2:#5636d8;
 --color-orange:#ec7500;--color-green:#08b94e;--color-purple:#7852ee;--color-red:#e93147;
 --color-yellow:#e0ac00;--color-cyan:#00bfbc;--color-blue:#086ddd;--color-pink:#d53984;
 --interactive-accent:#7c5cff;--font-interface:-apple-system,"Segoe UI",sans-serif;--tn-ruler-w:64px;`;

const START = 8;
const END = 18;
const SLOT = 52;
const yOf = (hour) => (hour - START) * SLOT;

const ruler = Array.from({ length: END - START + 1 }, (_, i) => {
  const h = START + i;
  return `<div class="timenote-block-ruler-label" style="top:${yOf(h)}px${i === 0 ? "" : ""}">${String(h).padStart(2, "0")}:00</div>`;
}).join("");
const hourLines = Array.from({ length: END - START + 1 }, (_, i) =>
  `<div class="timenote-block-hour-line" style="top:${yOf(START + i)}px"></div>`).join("");

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<title>TimeNote · DEC-022 跨天拖动 + 新增时间点</title>
<style>
  :root { ${VARS} }
  body { margin:0; padding:24px 28px 40px; background:#f2f3f6; color:var(--text-normal);
         font-family:var(--font-interface); font-size:14px; line-height:1.6; }
  h1 { font-size:20px; margin:0 0 4px; }
  .lead { color:var(--text-muted); margin:0 0 20px; font-size:13px; }
  .grid { display:grid; grid-template-columns:minmax(320px,1fr) minmax(420px,1.35fr); gap:18px; align-items:start; }
  .card { background:var(--background-primary); border:1px solid var(--background-modifier-border);
          border-radius:10px; padding:14px 16px 16px; margin-bottom:16px; }
  .card h2 { font-size:14px; margin:0 0 4px; }
  .card p.hint { color:var(--text-muted); font-size:12px; margin:0 0 12px; }
  .btn { font-size:12px; padding:5px 10px; border-radius:6px; cursor:pointer;
         border:1px solid var(--background-modifier-border); background:var(--background-secondary);
         color:var(--text-normal); margin:0 6px 8px 0; }
  .btn:hover { background:var(--background-modifier-hover); }
  .btn.primary { background:var(--interactive-accent); color:#fff; border-color:transparent; }
  .fake-notice { display:inline-block; font-size:12px; padding:5px 10px; border-radius:6px;
                 background:var(--background-secondary); border:1px solid var(--background-modifier-border); }
  .modal { border:1px solid var(--background-modifier-border); border-radius:8px; padding:12px;
           background:var(--background-primary); }
  .modal h3 { margin:0 0 12px; font-size:14px; }
  .timenote-modal-form { display:flex; flex-direction:column; gap:12px; }
  .timenote-modal-row { display:flex; gap:10px; align-items:center; }
  .timenote-modal-input { width:100%; padding:6px 10px; border-radius:6px;
    border:1px solid var(--background-modifier-border); background:var(--background-primary);
    color:var(--text-normal); box-sizing:border-box; font-size:13px; }
  .timenote-modal-input:disabled { opacity:.45; cursor:not-allowed; }
  .timenote-modal-label { flex:0 0 auto; font-size:12px; color:var(--text-muted); white-space:nowrap; }
  .timenote-duration-hint { font-size:12px; color:var(--text-muted); white-space:nowrap; align-self:center; }
  .timenote-modal-textarea { width:100%; min-height:60px; padding:8px 10px; border-radius:6px;
    border:1px solid var(--background-modifier-border); background:var(--background-primary);
    color:var(--text-normal); box-sizing:border-box; font-size:13px; }
  /* 预览用的固定尺寸时间网格（真实块布局是弹性的，这里只取等距形态示意） */
  .stage { display:flex; border:1px solid var(--background-modifier-border); border-radius:8px;
           overflow:hidden; background:var(--background-primary); }
  .stage .timenote-block-ruler { position:relative; width:var(--tn-ruler-w); flex:0 0 var(--tn-ruler-w);
           border-right:1px solid var(--background-modifier-border); height:${(END - START) * SLOT + 14}px; }
  .stage .timenote-block-ruler-label { position:absolute; right:6px; transform:translateY(-50%);
           font-size:11px; color:var(--text-muted); }
  .stage .timenote-block-column { position:relative; flex:1 1 0; min-width:0; height:${(END - START) * SLOT + 14}px;
           border-right:none; border-left:1px solid var(--background-modifier-border); }
  .stage .timenote-event-block { left:6% !important; width:88% !important; }
  .stage .timenote-event-block.is-dragging { transform:translateX(150px); }
  .stage .timenote-point-line { left:0; right:0; }
  .probe { margin-top:14px; font-size:12px; color:var(--text-muted); background:var(--background-secondary);
           border:1px solid var(--background-modifier-border); border-radius:6px; padding:8px 10px;
           font-family:ui-monospace,SFMono-Regular,Consolas,monospace; white-space:pre-wrap; }
  code { background:var(--background-secondary); padding:1px 5px; border-radius:4px; font-size:12px; }
</style>
<style>${css}</style>
</head><body>
<h1>TimeNote · DEC-022 跨天拖动 + 新增时间点</h1>
<p class="lead">真实 styles.css 内联 · 变量环境与 Obsidian 对齐（不补 <code>--*-rgb</code>）· 点下面的按钮看三种交互状态</p>

<div class="grid">
  <div>
    <div class="card">
      <h2>① 新增：时间块 / 时间点</h2>
      <p class="hint">工具栏按钮、设置页、弹窗下拉共用同一个 <code>defaultAddType</code>。默认时间块，旧用户行为不变。</p>
      <button class="btn timenote-layout-toggle" id="addTypeBtn">新增：时间块</button>
      <button class="btn primary" id="addBtn">+ 记一条</button>
      <div><span class="fake-notice" id="notice">点击按钮切换类型</span></div>
      <div class="modal" style="margin-top:12px">
        <h3>⚡ 快速记录至时间笔记 (Daily Note)</h3>
        <div class="timenote-modal-form">
          <div class="timenote-modal-row">
            <span class="timenote-modal-label">记录类型</span>
            <select class="timenote-modal-input" id="typeSelect">
              <option value="block">时间块（起止时间）</option>
              <option value="point">时间点（只记时刻）</option>
            </select>
          </div>
          <div class="timenote-modal-row">
            <input class="timenote-modal-input" value="09:15" aria-label="开始时间">
            <input class="timenote-modal-input" id="endInput" value="10:15" aria-label="结束时间">
            <span class="timenote-duration-hint" id="durationHint">时长 1h</span>
          </div>
          <textarea class="timenote-modal-textarea" placeholder="输入灵感闪念、随手记或任务内容..."></textarea>
        </div>
      </div>
      <p class="hint" style="margin-top:10px">切到「时间点」时结束时间框会清空并禁用，保存只写 <code>- 09:15 到公司</code> —— 日历上是一条线，不是块。按住 <code>Alt</code> 点空白槽可临时记时间点。</p>
    </div>
    <div class="card">
      <h2>② 空白槽的点预览</h2>
      <p class="hint">点模式下点 / 拖空白槽只定一个时刻：虚线 <code>.timenote-point-ghost</code> 跟随指针，15 分钟吸附。</p>
      <button class="btn" id="ghostBtn">显示 / 隐藏点预览</button>
      <div class="stage" style="margin-top:4px">
        <div class="timenote-block-ruler">${ruler}</div>
        <div class="timenote-block-column" id="ghostCol">
          ${hourLines}
          <div class="timenote-point-ghost" id="pointGhost" style="top:${yOf(9.25)}px">09:15</div>
          <div class="timenote-point-line is-memo" style="top:${yOf(11)}px;--tn-tint:var(--color-green,#08b94e)">
            <div class="timenote-point-line-hit"></div><div class="timenote-point-line-bar"></div>
            <div class="timenote-point-line-dot"></div>
            <div class="timenote-point-line-label" style="--tn-label-offset:3px">
              <span class="timenote-point-line-time">11:00</span>
              <span class="timenote-point-line-text">已存在的一条时间点</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div>
    <div class="card">
      <h2>③ 跨天拖动落点</h2>
      <p class="hint">拖块<b>中部</b>或整条时间点线横向进入别的日期列 → 目标列描边高亮、块 meta 显示 <code>→ 日期</code>；松手先写目标日记、再删源行。</p>
      <button class="btn" id="dragBtn">模拟：拖到 11-11</button>
      <span class="fake-notice" id="moveNotice" style="display:none">已移动到 2026-11-11：14:00 - 15:30</span>
      <div class="stage" style="margin-top:10px">
        <div class="timenote-block-ruler">${ruler}</div>
        <div class="timenote-block-column" id="colA">
          ${hourLines}
          <div class="timenote-event-block is-memo" id="dragBlock" style="top:${yOf(14)}px;height:${SLOT * 1.5}px;--tn-tint:var(--color-purple,#7852ee)">
            <div class="timenote-event-block-title"><span>写周报 #工作</span></div>
            <div class="timenote-event-block-meta" id="dragMeta">14:00 – 15:30 · #工作</div>
            <div class="timenote-event-block-duration">1h 30m</div>
          </div>
        </div>
        <div class="timenote-block-column" id="colB">
          ${hourLines}
          <div class="timenote-point-line is-memo" style="top:${yOf(10.5)}px;--tn-tint:var(--color-blue,#086ddd)">
            <div class="timenote-point-line-hit"></div><div class="timenote-point-line-bar"></div>
            <div class="timenote-point-line-dot"></div>
            <div class="timenote-point-line-label" style="--tn-label-offset:3px">
              <span class="timenote-point-line-time">10:30</span>
              <span class="timenote-point-line-text">这条点线也能横拖到别的天</span>
            </div>
          </div>
        </div>
      </div>
      <p class="hint" style="margin-top:10px">边界：只认当前视图真实存在的日期列；拖上下边缘改起止不跨天；Blinko 只读；跨零点范围仍不支持；日记行被外部改动导致行号对不上时整笔拒绝，不删任何内容。</p>
      <div class="probe" id="probe"></div>
    </div>
  </div>
</div>

<script>
const typeSelect = document.getElementById("typeSelect");
const endInput = document.getElementById("endInput");
const durationHint = document.getElementById("durationHint");
const addTypeBtn = document.getElementById("addTypeBtn");
const notice = document.getElementById("notice");
let addType = "block";

function syncType() {
  const isPoint = addType === "point";
  endInput.disabled = isPoint;
  endInput.value = isPoint ? "" : "10:15";
  durationHint.textContent = isPoint ? "时间点（只记时刻，不成块）" : "时长 1h";
  addTypeBtn.textContent = isPoint ? "新增：时间点" : "新增：时间块";
  typeSelect.value = addType;
  notice.textContent = isPoint
    ? "新建记录：时间点（只记时刻）"
    : "新建记录：时间块（起止时间）";
  probe();
}
typeSelect.onchange = () => { addType = typeSelect.value; syncType(); };
addTypeBtn.onclick = () => { addType = addType === "point" ? "block" : "point"; syncType(); };
document.getElementById("addBtn").onclick = () => { notice.textContent = "打开快速记录（类型：" + addType + "）"; };

let ghostOn = true;
const pointGhost = document.getElementById("pointGhost");
document.getElementById("ghostBtn").onclick = () => {
  ghostOn = !ghostOn;
  pointGhost.style.display = ghostOn ? "" : "none";
  probe();
};

let dragging = false;
const colB = document.getElementById("colB");
const dragBlock = document.getElementById("dragBlock");
const dragMeta = document.getElementById("dragMeta");
const moveNotice = document.getElementById("moveNotice");
document.getElementById("dragBtn").onclick = () => {
  dragging = !dragging;
  colB.classList.toggle("is-drop-target", dragging);
  dragBlock.classList.toggle("is-dragging", dragging);
  dragMeta.textContent = dragging ? "14:00 – 15:30 · #工作 → 2026-11-11" : "14:00 – 15:30 · #工作";
  moveNotice.style.display = dragging ? "" : "none";
  probe();
};

function probe() {
  document.getElementById("probe").textContent = [
    "defaultAddType      = " + addType,
    "结束时间输入框      = " + (endInput.disabled ? "disabled（时间点）" : "可编辑（时间块）"),
    "点槽预览线          = " + (ghostOn ? "显示" : "隐藏"),
    "目标列 is-drop-target = " + colB.classList.contains("is-drop-target"),
    "块 is-dragging      = " + dragBlock.classList.contains("is-dragging"),
    "落点日期            = " + (dragging ? "2026-11-11" : "（无，留在本列）")
  ].join("\\n");
}
syncType();
</script>
</body></html>`;

// 生成前自检：内联脚本必须能被解析，且没有引入真机不存在的 -rgb 变量
const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/);
if (!inlineScript) throw new Error("预览里找不到内联脚本");
new Function(inlineScript[1]);
if (/--color-\w+-rgb\s*:/.test(html)) throw new Error("预览不许自行补 -rgb 变量（DEC-015）");

const outDir = path.join(PROJECT_ROOT, "scripts/dev/out");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "cross-day.html");
fs.writeFileSync(out, html, "utf8");
console.log(`已生成 ${out}`);
