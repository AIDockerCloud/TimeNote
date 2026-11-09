// 时间点线测试（DEC-018）：单时间点记录画成线、不扩成任务块；拖动只改时刻。
//
// 用法：node scripts/dev/test-point-lines.mjs（需先 npm run build，测的是产物里的真实实现）
// 覆盖：解析判定 / 分簇堆叠 / 弹性轴行高 / 只改时间不生成范围的回写 / 无边缘拖动静态断言。
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, loadElasticInternals } from "./lib/elastic.mjs";

const src = fs.readFileSync(path.join(PROJECT_ROOT, "main.ts"), "utf8");
const css = fs.readFileSync(path.join(PROJECT_ROOT, "styles.css"), "utf8");
const bundle = fs.readFileSync(path.join(PROJECT_ROOT, "main.js"), "utf8");

let pass = 0;
const fails = [];
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name + (extra ? `  [${extra}]` : "")); console.log(`  ✗ ${name}${extra ? `  [${extra}]` : ""}`); }
};

// ---------- 抽真实实现 ----------
const { buildTimeScale, layoutPointLines, isPointEntry } = loadElasticInternals();

const pStart = src.indexOf("function parseLine(");
const pEnd = src.indexOf("\n}\n", pStart) + 3;
if (pStart < 0 || pEnd < 3) throw new Error("main.ts 里找不到 parseLine");
const parseLine = new Function(`${src.slice(pStart, pEnd)}\nreturn parseLine;`)();

// 与 test-drag-writeback 同一套括号配对：把类方法体取出来，注入 TFile / 时间格式化
const extractMethod = (signature) => {
  const mStart = src.indexOf(signature);
  if (mStart < 0) throw new Error(`main.ts 里找不到 ${signature}`);
  let depth = 0;
  let mEnd = -1;
  for (let i = src.indexOf("{", mStart); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) { mEnd = i + 1; break; }
    }
  }
  return src.slice(mStart, mEnd);
};
const pointMethodSrc = extractMethod("  async updateEntryPointTime(entry, startSec) {");
const pointInner = pointMethodSrc
  .replace(/^\s*async updateEntryPointTime\(entry, startSec\) \{/, "")
  .replace(/\}\s*$/, "");

class FakeTFile {
  constructor(p, text) { this.path = p; this._text = text; }
}
const formatSecondsToTime = (sec) => {
  const c = Math.max(0, Math.min(86400, sec));
  return String(Math.floor(c / 3600)).padStart(2, "0") + ":" +
         String(Math.floor((c % 3600) / 60)).padStart(2, "0");
};
const pointRuntime = new Function(
  "TFile", "formatSecondsToTime",
  `return async function(entry, startSec){ ${pointInner} };`
)(FakeTFile, formatSecondsToTime);

function buildRunner(text) {
  const file = new FakeTFile("SpiralNotes/2026/Daily/11/2026-11-09.md", text);
  const app = {
    vault: {
      getAbstractFileByPath: (p) => (p === file.path ? file : null),
      read: async () => file._text,
      modify: async (_f, t) => { file._text = t; }
    }
  };
  const service = { app, fileCache: new Map([["x", 1]]) };
  return { file, run: (entry, s) => pointRuntime.call(service, entry, s) };
}

const H = (h, m = 0) => h * 3600 + m * 60;
const pl = (line) => parseLine(line, 1, "2026-11-09", "day.md");
const point = (sec, lineNum, text, extra = {}) => ({
  hasTime: true, isRange: false, startSeconds: sec, lineNum, text, ...extra
});

console.log("--- 判定：什么才叫时间点 ---");
ok("纯 HH:mm 记录是时间点", isPointEntry(pl("- 09:23 喝水")));
ok("显式范围仍是时间块", !isPointEntry(pl("- 09:00-10:00 开会")) && pl("- 09:00-10:00 开会").isRange);
ok("单时间 + 时长标签仍是时间块", !isPointEntry(pl("- 09:00 站会 30m")) && pl("- 09:00 站会 30m").isRange);
ok("带复选框的单时间点也是点（不因任务语义变成块）",
  isPointEntry(pl("- [ ] 14:05 交水电费")) && pl("- [ ] 14:05 交水电费").isTask);
ok("无时间记录不是点", !isPointEntry(pl("- 随手记")));
ok("Blinko 闪念（无 isRange 字段）按时间点显示",
  isPointEntry({ hasTime: true, startSeconds: H(12), source: "blinko" }));
ok("单点记录解析出的时刻精确到秒", pl("- 14:00:31 带秒").startSeconds === H(14, 0) + 31);

console.log("--- 分簇与堆叠 ---");
{
  const pts = layoutPointLines([
    point(H(9, 5), 3, "B"),
    point(H(9, 23), 1, "A"),
    point(H(9, 5), 2, "C"),
    point(H(9, 5), 5, "D")
  ], 0, 86400);
  ok("排序：同时刻按行号稳定排列",
    pts.slice(0, 3).map(p => p.entry.text).join("") === "CBD",
    pts.slice(0, 3).map(p => p.entry.text).join(""));
  ok("同时刻三条归为一簇、逐行错开",
    pts[0].clusterSize === 3 &&
    pts.slice(0, 3).map(p => p.rowInCluster).join(",") === "0,1,2");
  ok("18 分钟后另起一簇", pts[3].clusterIndex === 1 && pts[3].clusterSize === 1);
  ok("每条都保留精确秒", pts[0].sec === H(9, 5) && pts[3].sec === H(9, 23));
  const again = layoutPointLines([
    point(H(9, 5), 3, "B"), point(H(9, 23), 1, "A"),
    point(H(9, 5), 2, "C"), point(H(9, 5), 5, "D")
  ], 0, 86400);
  ok("重渲染结果完全稳定", JSON.stringify(pts.map(p => [p.sec, p.clusterIndex, p.rowInCluster, p.entry.text]))
    === JSON.stringify(again.map(p => [p.sec, p.clusterIndex, p.rowInCluster, p.entry.text])));
}
{
  const boundary = layoutPointLines([
    point(H(9), 1, "a"), point(H(9) + 899, 2, "b"), point(H(9) + 1799, 3, "c")
  ], 0, 86400);
  ok("差 14 分 59 秒仍同簇、满 15 分钟另起簇",
    boundary[1].clusterIndex === 0 && boundary[2].clusterIndex === 1);
}
ok("越出可见时间轴的点被丢弃",
  layoutPointLines([point(H(5), 1, "早"), point(H(23), 2, "晚")], H(6), H(22)).length === 0);
ok("范围条目不混进点线",
  layoutPointLines([
    point(H(9), 1, "点"),
    { hasTime: true, isRange: true, startSeconds: H(9), lineNum: 2, text: "块" }
  ], 0, 86400).length === 1);

console.log("--- 弹性轴：点线按小时撑开行高 ---");
{
  const base = { startHour: 0, endHour: 24, slotHeight: 52, top: 0, entries: [], elastic: true, viewportHeight: 0 };
  const needs = new Array(24).fill(0);
  needs[9] = 60;
  const plain = buildTimeScale(base);
  const withPoints = buildTimeScale({ ...base, pointNeeds: needs });
  ok("有 3 条点线的小时被撑高", withPoints.heights[9] > plain.heights[9],
    `${plain.heights[9]} -> ${withPoints.heights[9]}`);
  ok("没有点线的小时保持原高度", withPoints.heights[10] === plain.heights[10]);
  ok("不传 pointNeeds 与全 0 等价",
    buildTimeScale({ ...base, pointNeeds: new Array(24).fill(0) }).heights[9] === plain.heights[9]);
  ok("等距模式忽略点线需求",
    buildTimeScale({ ...base, elastic: false, pointNeeds: needs }).heights[9] === 52);
  let mono = true;
  let inverse = true;
  for (let s = 0; s <= 86400; s += 600) {
    if (s > 0 && withPoints.yOf(s) <= withPoints.yOf(s - 600)) mono = false;
    if (Math.abs(withPoints.secOf(withPoints.yOf(s)) - s) > 1) inverse = false;
  }
  ok("加了点线后 yOf 仍严格单调", mono);
  ok("加了点线后 yOf / secOf 仍互逆", inverse);
}

console.log("--- 回写：只改时刻，绝不生成范围 ---");
{
  const { file, run } = buildRunner("- 09:23 喝水\n");
  const changed = await run({ filePath: file.path, lineNum: 1 }, H(10, 45));
  ok("单时间点改成新时刻", changed === true && file._text === "- 10:45 喝水\n", JSON.stringify(file._text));
  ok("结果里没有结束时间 / 范围", !/\d{2}:\d{2}\s*[-~至到/]\s*\d{1,2}:\d{2}/.test(file._text));
}
{
  const { file, run } = buildRunner("\t* [ ] 14:05 交水电费 #生活\n");
  await run({ filePath: file.path, lineNum: 1 }, H(15, 30));
  ok("缩进 / * 列表符 / 复选框 / 标签原样保留",
    file._text === "\t* [ ] 15:30 交水电费 #生活\n", JSON.stringify(file._text));
}
{
  const { file, run } = buildRunner("- 09:00-10:00 站会\n");
  const changed = await run({ filePath: file.path, lineNum: 1 }, H(11));
  ok("范围行拒绝改写（不会把块压成点）", changed === false && file._text === "- 09:00-10:00 站会\n");
}
{
  const { file, run } = buildRunner("- 纯文本记录\n");
  const changed = await run({ filePath: file.path, lineNum: 1 }, H(11));
  ok("无时间行返回 false 且不写盘", changed === false && file._text === "- 纯文本记录\n");
}
{
  const { file, run } = buildRunner("- 09:00 x\n");
  ok("行号越界返回 false", (await run({ filePath: file.path, lineNum: 99 }, H(11))) === false);
}
{
  const multi = "# 2026-11-09\n\n- 09:00 早会 30m\n- 14:00-15:00 写代码\n- 16:00 复盘\n";
  const { file, run } = buildRunner(multi);
  await run({ filePath: file.path, lineNum: 5 }, H(17, 20));
  ok("多行日记只改目标行",
    file._text === "# 2026-11-09\n\n- 09:00 早会 30m\n- 14:00-15:00 写代码\n- 17:20 复盘\n",
    JSON.stringify(file._text.split("\n")[4]));
}
{
  const { file, run } = buildRunner("- 14:00:31 带秒记录\n");
  await run({ filePath: file.path, lineNum: 1 }, H(15, 5));
  ok("带秒的时间前缀可改写", file._text === "- 15:05 带秒记录\n", JSON.stringify(file._text));
}
{
  const { file, run } = buildRunner("- 09:00\n");
  await run({ filePath: file.path, lineNum: 1 }, H(10));
  ok("行尾只有时间也能改", file._text === "- 10:00\n", JSON.stringify(file._text));
}
{
  const { file, run } = buildRunner("- 09:00 不动\n");
  const changed = await run({ filePath: file.path, lineNum: 1 }, H(9));
  ok("时刻没变时返回 false，不产生无意义写盘",
    changed === false && file._text === "- 09:00 不动\n", JSON.stringify(file._text));
}
{
  const { file, run } = buildRunner("- 23:30 收尾\n");
  await run({ filePath: file.path, lineNum: 1 }, 86400);
  ok("24:00 边界可写", file._text === "- 24:00 收尾\n", JSON.stringify(file._text));
}

console.log("--- 静态断言：渲染与交互没有把点扩成块 ---");
{
  const rStart = src.indexOf("      // 时间点线：top 严格等于");
  const rEnd = src.indexOf("    });\n\n    // 当前时间指示线", rStart);
  const pointRender = rStart >= 0 && rEnd > rStart ? src.slice(rStart, rEnd) : "";
  ok("点线渲染段落存在", pointRender.length > 200);
  ok("点线 top 严格走 scale.yOf(startSeconds)", /scale\.yOf\(p\.sec\)/.test(pointRender));
  ok("点线渲染不创建时间块 DOM / 复选框",
    !pointRender.includes("timenote-event-block") && !pointRender.includes("timenote-card-checkbox"));
  ok("点线沿用当天 --tn-tint 配色", pointRender.includes("--tn-tint"));
  ok("同簇标签按行号错开", pointRender.includes("p.rowInCluster * POINT_ROW_H"));
  ok("点线仍可悬停预览 / 点击跳转", pointRender.includes("showHoverTooltip") && pointRender.includes("jumpToFileLine"));
}
ok("块分簇明确排除点记录", /\.filter\(e => !isPointEntry\(e\)\)/.test(src));
ok("点线需求按小时汇总后交给弹性轴", src.includes("entries: scaleEntries, pointNeeds, elastic, viewportHeight"));
{
  const dStart = src.indexOf("  attachPointDrag(line, entry, timeBadge, scale) {");
  const dEnd = src.indexOf("\n  }\n", dStart);
  const dragSrc = dStart >= 0 && dEnd > dStart ? src.slice(dStart, dEnd) : "";
  ok("点拖拽实现存在", dragSrc.length > 200);
  ok("点拖拽没有边缘命中区 / 起止模式",
    !dragSrc.includes("blockEdgeHit") && !dragSrc.includes('mode === "start"') && !dragSrc.includes('mode === "end"'));
  ok("点拖拽位移走 scale 反函数、1 分钟吸附",
    dragSrc.includes("scale.secOf(baseY + dy)") && dragSrc.includes("snapSeconds(raw, POINT_SNAP_MINUTES)"));
  ok("点拖拽不调用范围回写", !dragSrc.includes("updateEntryTime"));
  ok("外部来源（Blinko）只读不可拖", dragSrc.includes('entry.source !== "daily"') && dragSrc.includes("is-readonly"));
}
{
  const cStart = src.indexOf("  async commitEntryPoint(entry, startSec) {");
  const cSrc = src.slice(cStart, src.indexOf("\n  }\n", cStart));
  ok("松手后走 updateEntryPointTime", cSrc.includes("updateEntryPointTime") && !cSrc.includes("updateEntryTime("));
}
ok("新回写方法里没有范围字符串构造", !pointMethodSrc.includes("rangeStr"));
ok("点拖拽会吃掉拖拽后的补发 click", src.includes("line.dataset.dragMoved"));
ok("时间线视图不再给点记录补虚构的 30m", src.includes("isPointEntry(entry) ? entry.timeStr"));
ok("快速记录提示不再宣称「按默认 30m 显示」", !src.includes("按默认 30m 显示"));
ok("紧凑流空闲段不再把点当 30 分钟块", src.includes("isPointEntry(entry)\n          ? entryStartSec"));

console.log("--- 样式与产物 ---");
ok("横线是 2px 且颜色走 --tn-tint",
  /\.timenote-point-line-bar \{[\s\S]*?border-top: 2px solid var\(--tn-tint\)/.test(css));
ok("标签默认在线下（--tn-label-offset 为正偏移）", /top: var\(--tn-label-offset/.test(css));
ok("线上模式只需加 .is-above 类", css.includes(".timenote-point-line.is-above"));
ok("点线没有把手 / edge DOM 规则", !css.includes("timenote-point-line-edge"));
ok("只读与拖动态都有定义", css.includes(".timenote-point-line.is-readonly") && css.includes(".timenote-point-line.is-dragging"));
ok("产物含点线渲染与新回写", bundle.includes("timenote-point-line") && bundle.includes("updateEntryPointTime"));

console.log(`\n===== ${pass} passed, ${fails.length} failed =====`);
if (fails.length) {
  console.log("FAILED:");
  fails.forEach(f => console.log("  ✗", f));
  process.exit(1);
}
