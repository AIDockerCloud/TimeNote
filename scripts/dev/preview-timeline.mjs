// 生成时间块布局的静态对比预览（纯 HTML，可直接用浏览器打开）
//
// 用法：
//   node scripts/dev/preview-timeline.mjs              # 左：等距轴　右：当前弹性轴
//   node scripts/dev/preview-timeline.mjs --compare=clip  # 左：块被内容截短（v1.0.4 首版）　右：当前
// 产物：scripts/dev/out/timeline-preview.html
//
// 复用真实的 buildTimeScale 与仓库里的 styles.css，所以预览里看到的行高、块位置
// 与插件里的实际渲染一致，不是示意图。
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, loadElasticInternals } from "./lib/elastic.mjs";

const { buildTimeScale, estimateBlockNeed } = loadElasticInternals();

const H = (h) => h * 3600;
const SLOT = 52;
const COL_W = 520;
const VIEWPORT = 470;

const SAMPLE = [
  { s: H(9), en: H(10.5), text: "系统巡检：ALB 证书续期与告警复核", task: true },
  { s: H(10.5), en: H(11), text: "写周报" },
  { s: H(11), en: H(12), text: "例会", task: true },
  { s: H(14), en: H(15.5), text: "排查线上告警：502 突增，定位到上游超时" },
  { s: H(16), en: H(16.5), text: "复盘" },
  { s: H(20), en: H(21), text: "读书" }
];

const argCompare = (process.argv.find((a) => a.startsWith("--compare=")) || "").split("=")[1];
const compare = argCompare === "clip" ? "clip" : "equidistant";

const fmt = (sec) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/**
 * @param {string} title
 * @param {string} subtitle
 * @param {{ elastic: boolean, heightMode?: "span" | "clip" }} opts
 */
function panel(title, subtitle, { elastic, heightMode = "span" }) {
  const entries = SAMPLE.map((e) => ({
    s: e.s,
    en: e.en,
    needH: estimateBlockNeed({ text: e.text }, COL_W)
  }));
  const scale = buildTimeScale({
    startHour: 0,
    endHour: 24,
    slotHeight: SLOT,
    top: 0,
    entries: elastic ? entries : [],
    elastic,
    viewportHeight: VIEWPORT
  });
  const H0 = scale.totalHeight + 14;

  let labels = "";
  let lines = "";
  for (let h = 0; h <= 24; h++) {
    const cls = ["timenote-block-ruler-label"];
    if (h === 0) cls.push("is-first");
    if (elastic && scale.heights[Math.min(23, h)] < SLOT * 0.5) cls.push("is-dense");
    const y = scale.yOf(h * 3600).toFixed(1);
    labels += `<div class="${cls.join(" ")}" style="top:${y}px">${String(h).padStart(2, "0")}:00</div>`;
    lines += `<div class="timenote-block-hour-line" style="top:${y}px"></div>`;
  }

  let blocks = "";
  SAMPLE.forEach((e) => {
    const top = scale.yOf(e.s);
    const spanH = Math.max(16, scale.yOf(e.en) - top);
    const needH = estimateBlockNeed({ text: e.text }, COL_W);
    const height = heightMode === "clip" ? Math.max(16, Math.min(spanH, needH)) : spanH;
    const cls = ["timenote-event-block", e.task ? "is-task" : "is-memo"];
    if (height < 34) cls.push("is-dense");
    if (height < 24) cls.push("is-tiny");
    blocks += `<div class="${cls.join(" ")}" style="top:${top.toFixed(1)}px;height:${height.toFixed(1)}px;left:0;width:calc(100% - 6px)">
      <div class="timenote-event-block-title">${e.task ? '<input type="checkbox" class="timenote-card-checkbox">' : ""}<span>${e.text}</span></div>
      <div class="timenote-event-block-meta">${fmt(e.s)} - ${fmt(e.en)} · ${Math.round((e.en - e.s) / 60)} 分钟</div>
    </div>`;
  });

  const nowY = scale.yOf(15 * 3600 + 20 * 60);

  return `
  <section class="panel">
    <div class="panel-head"><strong>${title}</strong><span>${subtitle}</span></div>
    <div class="timenote-container" style="height:${VIEWPORT + 92}px">
      <div class="timenote-timegrid-wrapper">
        <div class="timenote-timegrid-header">
          <div class="timenote-header-days">
            <div class="timenote-block-ruler-spacer"></div>
            <div class="timenote-header-day-col is-today">
              <div class="timenote-day-title-row"><span class="timenote-day-name">周日</span><span class="timenote-day-num">8</span></div>
              <div class="timenote-day-allday-container" style="height:56px;min-height:56px;max-height:56px">
                <div class="timenote-all-day-chip is-task"><span class="timenote-all-day-chip-text">整理季度预算表</span></div>
                <div class="timenote-all-day-chip is-memo"><span class="timenote-all-day-chip-text">记得给网络续费</span></div>
              </div>
            </div>
          </div>
          <div class="timenote-header-resizer"></div>
        </div>
        <div class="timenote-scroll-area timenote-block-scroll">
          <div class="timenote-columns-container timenote-block-columns ${elastic ? "is-elastic" : ""}" style="height:${H0.toFixed(0)}px">
            <div class="timenote-block-ruler">${labels}</div>
            <div class="timenote-column timenote-block-column is-today" style="height:${H0.toFixed(0)}px">
              ${lines}
              <div class="timenote-block-slot-layer" style="top:0;height:${scale.totalHeight.toFixed(0)}px"></div>
              ${blocks}
              <div class="timenote-now-line" style="top:${nowY.toFixed(1)}px"><span class="timenote-now-label">15:20</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="panel-foot">轴总高 ${scale.totalHeight.toFixed(0)}px ｜ 空档行 ${scale.heights[3].toFixed(0)}px ｜ 有内容行 ${scale.heights[9].toFixed(0)}px</div>
  </section>`;
}

const leftPanel =
  compare === "clip"
    ? panel("改前 · 块被内容截短", "块高 = min(跨度, 内容需要)", { elastic: true, heightMode: "clip" })
    : panel("改前 · 等距轴", "每小时恒 52px，块高 = 时长", { elastic: false });

const rightTitle = compare === "clip" ? "改后 · 块铺满时间跨度" : "现在 · 自适应时间轴";
const rightSub = compare === "clip" ? "块高 = yOf(end) - yOf(start)" : "空档压扁 · 行高跟内容 · 块铺满跨度";

const css = fs.readFileSync(path.join(PROJECT_ROOT, "styles.css"), "utf8");

const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>TimeNote 时间块布局 — 改前 / 改后</title>
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
body{margin:0;padding:22px 24px 40px;background:var(--background-primary);color:var(--text-normal);
  font-family:var(--font-interface);font-size:16px;transition:background .2s}
h1{font-size:1rem;margin:0 0 4px;font-weight:600}
.sub{color:var(--text-muted);font-size:.78rem;margin-bottom:18px;line-height:1.6}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:22px;align-items:start}
.panel{border:1px solid var(--background-modifier-border);border-radius:10px;overflow:hidden;background:var(--background-primary)}
.panel-head{display:flex;align-items:baseline;gap:8px;padding:9px 12px;background:var(--background-secondary);
  border-bottom:1px solid var(--background-modifier-border);font-size:.8rem}
.panel-head span{color:var(--text-muted);font-size:.72rem}
.panel-foot{padding:7px 12px;font-size:.7rem;color:var(--text-muted);border-top:1px solid var(--background-modifier-border);
  background:var(--background-secondary);font-variant-numeric:tabular-nums}
.toggle{position:fixed;right:18px;top:18px;font-size:.75rem;padding:5px 11px;border-radius:6px;cursor:pointer;
  border:1px solid var(--background-modifier-border);background:var(--background-secondary);color:var(--text-normal)}
.timenote-event-block{bottom:auto}
${css}
</style></head>
<body>
<h1>TimeNote 时间块布局 · 改前 / 改后</h1>
<div class="sub">同一批记录、同一个面板高度，复用插件真实的 buildTimeScale 与 styles.css。<br>
左：${compare === "clip" ? "块高被 min(跨度, 内容需要) 截短，下沿不对应结束时间" : "等距轴（每小时 52px）"}　→　右：块高恒等于时间跨度，空档压扁、行高跟内容。</div>
<button class="toggle" onclick="document.body.classList.toggle('dark')">切换深色</button>
<div class="grid">
${leftPanel}
${panel(rightTitle, rightSub, { elastic: true, heightMode: "span" })}
</div>
</body></html>`;

const outDir = path.join(PROJECT_ROOT, "scripts", "dev", "out");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "timeline-preview.html");
fs.writeFileSync(outFile, html);
console.log(`已生成：${path.relative(PROJECT_ROOT, outFile)}（${compare === "clip" ? "截短 vs 铺满" : "等距 vs 弹性"}）`);
