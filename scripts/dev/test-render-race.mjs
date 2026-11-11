// 视图并发渲染防回归（DEC-021）：写日记会同时触发 vault.on("modify") 与 QuickAdd 的 onSaved，
// 两次 async renderView 若各自 append 一整套 DOM，页面下方就会多出一个日历视图（刷新才恢复）。
//
// 用法：node scripts/dev/test-render-race.mjs（需先 npm run build）
// 抽 main.ts 里真实的 renderView 方法体 + 假 DOM，模拟并发调用与不同完成顺序。
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, loadPluginSources } from "./lib/elastic.mjs";

const src = loadPluginSources();
const bundle = fs.readFileSync(path.join(PROJECT_ROOT, "main.js"), "utf8");

let pass = 0;
const fails = [];
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name + (extra ? `  [${extra}]` : "")); console.log(`  ✗ ${name}${extra ? `  [${extra}]` : ""}`); }
};

// ---------- 抽真实 renderView 方法体 ----------
const SIG = "  async renderView() {";
const mStart = src.indexOf(SIG);
if (mStart < 0) throw new Error("main.ts 里找不到 renderView");
let depth = 0;
let mEnd = -1;
for (let i = src.indexOf("{", mStart); i < src.length; i++) {
  if (src[i] === "{") depth++;
  else if (src[i] === "}") { depth--; if (depth === 0) { mEnd = i + 1; break; } }
}
const inner = src.slice(mStart, mEnd)
  .replace(/^\s*async renderView\(\) \{/, "")
  .replace(/\}\s*$/, "");
const renderView = new Function(`return async function(){ ${inner} };`)();

// ---------- 假 DOM / 假视图 ----------
// renderHeader / renderSubHeader / renderXxx 只往 container.children 追加一个节点，
// 一套完整渲染 = 3 个节点。出现 6 个即「两个日历视图叠在一起」的 bug 现场。
const MODES = ["Day", "3Day", "Week", "Month", "Quarter", "Year", "Timeline"];
function makeView(refreshImpl) {
  const container = {
    children: [],
    empty() { this.children = []; return this; },
    addClass() { return this; }
  };
  const view = {
    containerEl: { children: [{}, container] },
    contentEl: container,
    // DEC-025：渲染引擎改名为 TimenoteRenderer，容器由宿主注入为 this.root
    root: container,
    currentViewMode: "week",
    hideHoverTooltip() {},
    refreshData: refreshImpl,
    renderHeader: (c) => c.children.push("header"),
    renderSubHeader: (c) => c.children.push("subheader")
  };
  for (const m of MODES) view[`render${m}View`] = (c) => c.children.push(m.toLowerCase());
  return view;
}
const deferred = () => {
  let resolve;
  const p = new Promise((r) => { resolve = r; });
  return { p, resolve };
};
const layout = (view) => view.contentEl.children.join(",");
const ONE_SET = "header,subheader,week";

// ---------- 1) 单次 / 串行渲染 ----------
console.log("--- 单次与串行 ---");
{
  const view = makeView(async () => {});
  await renderView.call(view);
  ok("单次渲染产出一套完整 DOM", layout(view) === ONE_SET, layout(view));
  await renderView.call(view);
  ok("串行第二次渲染仍只有一套（empty 生效）", layout(view) === ONE_SET, layout(view));
}

// ---------- 2) 并发：不同完成顺序都只能落地最后一次 ----------
console.log("--- 并发防重入 ---");
const concurrent = async (count, resolveOrder) => {
  const all = Array.from({ length: count }, () => deferred());
  const queue = all.map((d) => d.p);
  const view = makeView(async () => {
    // 每次调用按进入顺序领一个 deferred，完成顺序由 resolveOrder 控制
    await queue.shift();
  });
  const calls = Array.from({ length: count }, () => renderView.call(view));
  for (const i of resolveOrder) all[i].resolve();
  await Promise.all(calls);
  return view;
};
{
  const view = await concurrent(2, [0, 1]); // 旧调用先完成
  ok("两次并发（先发先完成）只渲染一套", layout(view) === ONE_SET, layout(view));
  ok("落地的是最后一次调用", view.renderGeneration === 2);
}
{
  const view = await concurrent(2, [1, 0]); // 新调用先完成
  ok("两次并发（后发先完成）只渲染一套", layout(view) === ONE_SET, layout(view));
}
{
  const view = await concurrent(3, [0, 1, 2]);
  ok("三次并发只渲染一套", layout(view) === ONE_SET, layout(view));
  ok("代号递增到 3", view.renderGeneration === 3);
}
{
  const view = await concurrent(3, [2, 0, 1]); // 乱序完成
  ok("乱序完成也不会追加第二套", layout(view) === ONE_SET, layout(view));
}
{
  // 子渲染方法调用次数：并发 2 次时应只有 1 次（另一份在 await 后被丢弃）
  let headerCalls = 0;
  const d1 = deferred();
  const d2 = deferred();
  const queue = [d1.p, d2.p];
  const view = makeView(async () => { await queue.shift(); });
  view.renderHeader = (c) => { headerCalls++; c.children.push("header"); };
  const a = renderView.call(view);
  const b = renderView.call(view);
  d1.resolve(); d2.resolve();
  await Promise.all([a, b]);
  ok("旧调用在 await 后被丢弃（renderHeader 只跑一次）", headerCalls === 1, `实际 ${headerCalls}`);
}

// ---------- 2.5) 对照组：去掉代号检查就是修复前的现场 ----------
console.log("--- 对照组（证明测试确实抓得到这个 bug） ---");
{
  const legacyInner = inner.replace(/if \(gen !== this\.renderGeneration\) return;/, "");
  if (legacyInner === inner) throw new Error("对照组构造失败：没找到代号检查");
  const renderViewLegacy = new Function(`return async function(){ ${legacyInner} };`)();
  const d1 = deferred();
  const d2 = deferred();
  const queue = [d1.p, d2.p];
  const view = makeView(async () => { await queue.shift(); });
  const a = renderViewLegacy.call(view);
  const b = renderViewLegacy.call(view);
  d1.resolve(); d2.resolve();
  await Promise.all([a, b]);
  ok("无代号检查时两次并发会叠出两套 DOM（= 用户看到的重复视图）",
    view.contentEl.children.length === 6, `实际 ${view.contentEl.children.length} 个节点`);
}

// ---------- 3) 静态断言：根因链路仍在，但已被代号兜住 ----------
console.log("--- 源码 / 产物 ---");
const body = src.slice(mStart, mEnd);
ok("renderView 用递增代号", /const gen = \(this\.renderGeneration \|\| 0\) \+ 1/.test(body));
ok("await 之后检查代号再渲染", /await this\.refreshData\(\);\s*\n\s*if \(gen !== this\.renderGeneration\) return;/.test(body));
ok("容器用 this.root（宿主注入，不再靠 children[1] 索引）",
  /const container = this\.root;/.test(body) && !/containerEl\.children\[1\]/.test(body));
ok("empty() 仍在 await 之前", body.indexOf("container.empty()") < body.indexOf("await this.refreshData()"));
// DEC-025：文件监听从 ItemView.registerEvent 移到 HostAdapter.onExternalChange
ok("vault.modify 监听保留（不靠删事件规避）", /vault\.on\("modify"/.test(src));
ok("QuickAdd 保存后 onSaved 仍触发渲染", /if \(this\.onSaved\) this\.onSaved\(\)/.test(src));
ok("产物含代号检查", bundle.includes("this.renderGeneration") && bundle.includes("gen !== this.renderGeneration"));
ok("产物不再用 children[1]", !bundle.includes("containerEl.children[1]"));

console.log(`\n===== ${pass} passed, ${fails.length} failed =====`);
if (fails.length) { fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
