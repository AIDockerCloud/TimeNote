// 宿主层测试（DEC-025）
//
// 核心目的：证明「三宿主共用渲染层」不是纸面架构 —— 用一份**完全没有
// Obsidian 依赖**的内存宿主实例化 TimenoteRenderer，跑通状态流转、导航、
// 过滤和写操作。同时静态守住 ui/view.ts 的零宿主耦合。
//
// 用法：node scripts/dev/test-hosts.mjs
// 前置：npm run build（或 build:ui + build:hosts）
import fs from "node:fs";
import path from "node:path";
import {
  PROJECT_ROOT, loadUi, loadHosts, loadApps, loadPluginSource, loadPluginSources
} from "./lib/elastic.mjs";

let pass = 0;
const fails = [];
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name + (extra ? `  [${extra}]` : "")); console.log(`  ✗ ${name}${extra ? `  [${extra}]` : ""}`); }
};

const ui = await loadUi();
const hosts = await loadHosts();
const { TimenoteRenderer, setMomentFactory, nativeMoment } = ui;
const { createMemoryHostAdapter, REFERENCE_SETTINGS } = hosts;

// 渲染引擎用的是「注入式日期」，这里注入零依赖实现 —— 全程没有 window.moment
setMomentFactory(nativeMoment);

const stripNonCode = (s) => s.split("\n")
  .map(line => {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) return "";
    return line.replace(/\s+\/\/.*$/, "");
  })
  .join("\n")
  .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""')
  .replace(/`(?:[^`\\\n]|\\.)*`/g, "``");

// ---------- 1) 渲染引擎零宿主耦合 ----------
console.log("--- ui/view.ts 的宿主边界 ---");
{
  const viewCode = stripNonCode(loadPluginSource("ui/view.ts"));
  const forbidden = [
    ["import obsidian", /from\s+["']obsidian["']/],
    ["this.app", /\bthis\.app\b/],
    ["this.plugin", /\bthis\.plugin\b/],
    ["ItemView 基类", /\bItemView\b/],
    ["Notice", /\bnew Notice\b/],
    ["TFile", /\bTFile\b/],
    ["normalizePath", /\bnormalizePath\b/],
    ["window.moment", /window\.moment/],
    ["vault.", /\bvault\./],
    ["workspace.", /\bworkspace\./],
    ["QuickAddModal / SubItemsModal", /new (QuickAddModal|SubItemsModal)\b/]
  ];
  const dirty = forbidden.filter(([, re]) => re.test(viewCode)).map(([n]) => n);
  ok("ui/view.ts 不含任何 Obsidian 宿主依赖", dirty.length === 0, dirty.join(", "));
  ok("渲染引擎全部宿主调用走 this.host.*",
    (viewCode.match(/this\.host\./g) || []).length >= 40,
    String((viewCode.match(/this\.host\./g) || []).length));
  ok("渲染引擎导出为 TimenoteRenderer", /export class TimenoteRenderer\b/.test(viewCode));

  const mainCode = stripNonCode(loadPluginSource("main.ts"));
  ok("main.ts 只剩 ItemView 薄壳（走共用装配入口）",
    /mountTimeNote\(/.test(mainCode) && /createObsidianHostAdapter\(/.test(mainCode) &&
    /prepareHostEnvironment\(/.test(mainCode));
  ok("main.ts 里不再有渲染逻辑", !/renderTimeGrid\(container, days\)/.test(mainCode));

  // 装配时机：mountTimeNote 必须在 onOpen 里，不能在 constructor 里。
  // ItemView.contentEl 在构造期不保证已挂好，提前取会把 undefined 固定成 root。
  {
    const start = mainCode.indexOf("class TimenoteView");
    const end = mainCode.indexOf("class QuickAddModal", start);
    const shell = start >= 0 && end > start ? mainCode.slice(start, end) : "";
    const ctorStart = shell.indexOf("constructor(");
    const ctorEnd = ctorStart >= 0 ? shell.indexOf("getViewType(", ctorStart) : -1;
    const ctorBody = ctorStart >= 0 && ctorEnd > ctorStart ? shell.slice(ctorStart, ctorEnd) : "";
    const onOpenIdx = shell.indexOf("onOpen(");
    ok("已定位 TimenoteView 薄壳", shell.length > 0 && ctorBody.length > 0 && onOpenIdx > 0);
    ok("TimenoteView 构造函数不装配渲染引擎", !/mountTimeNote\(/.test(ctorBody));
    ok("TimenoteView 在 onOpen 里装配渲染引擎",
      onOpenIdx > 0 && /mountTimeNote\(/.test(shell.slice(onOpenIdx)));
  }
}

// ---------- 2) HostAdapter 契约完整 ----------
console.log("--- HostAdapter 契约 ---");
{
  const t = loadPluginSource("hosts/types.ts");
  const tCode = stripNonCode(t);
  const methods = [
    "saveSettings", "notice", "setIcon", "openQuickAdd", "openSubItems",
    "openEntry", "openDailyNote", "onExternalChange", "getEntriesForRange",
    "invalidateCache", "toggleTask", "updateEntryTime",
    "updateEntryPointTime", "moveEntryToDate"
  ];
  ok("契约定义了全部 14 个宿主能力", methods.every(m => new RegExp(`\\b${m}\\s*\\(`).test(t)));
  ok("契约引用 MomentLike 与 NoteEntry（不依赖具体宿主类型）",
    /MomentLike/.test(tCode) && /NoteEntry/.test(tCode) && !/obsidian/i.test(tCode));

  const adapter = loadPluginSource("hosts/obsidian/adapter.ts");
  const missing = methods.filter(m => !new RegExp(`\\b${m}\\s*[(:]`).test(adapter));
  ok("Obsidian 适配器实现了全部能力", missing.length === 0, missing.join(", "));
  ok("Obsidian 适配器集中持有 vault / workspace / Notice / setIcon",
    /vault\./.test(adapter) && /workspace\./.test(adapter) &&
    /new Notice/.test(adapter) && /setIcon\(/.test(adapter));
  // DEC-026：路径规范化与 TFile 解析随本地文件存储一起搬进 vault-store
  const vaultStore = loadPluginSource("hosts/obsidian/vault-store.ts");
  ok("vault-store 负责路径规范化与 TFile 解析",
    /normalizePath/.test(vaultStore) && /instanceof TFile/.test(vaultStore));
  ok("vault-store 读写走 vault.read / vault.modify（保住 modify 事件）",
    /vault\.read\(file\)/.test(vaultStore) && /vault\.modify\(file, content\)/.test(vaultStore));
  ok("弹窗构造函数由 deps 注入（避免 main.ts ↔ adapter 循环 import）",
    /QuickAddModal: any/.test(adapter) && /deps\.QuickAddModal/.test(adapter));
}

// ---------- 3) 内存宿主：契约的第二份实现 ----------
console.log("--- 内存参考宿主 ---");
const mkEntry = (id, dateStr, extra = {}) => ({
  id, filePath: `${dateStr}.md`, dateStr, lineNum: 1, rawLine: `- 09:00 ${id}`,
  isTask: false, isCompleted: false, hasTime: true, isRange: false,
  startSeconds: 9 * 3600, endSeconds: 9 * 3600 + 1800,
  startMinutes: 540, endMinutes: 570, timeStr: "09:00",
  text: id, tags: [], tint: null, subItems: [], source: "daily", ...extra
});

const host = createMemoryHostAdapter({
  settings: { layoutMode: "compact", defaultAddType: "point", firstDayOfWeek: 1 },
  entries: {
    "2026-11-10": [mkEntry("a", "2026-11-10")],
    "2026-11-11": [
      mkEntry("b", "2026-11-11"),
      mkEntry("m1", "2026-11-11", { source: "memos", readonly: true })
    ]
  }
});
ok("内存宿主默认设置齐全", !!REFERENCE_SETTINGS.quickAddSection && host.settings.firstDayOfWeek === 1);

const range = await host.getEntriesForRange(nativeMoment("2026-11-10"), nativeMoment("2026-11-11"));
ok("区间包含首尾两天", range.has("2026-11-10") && range.has("2026-11-11"));
ok("区间内条目正确", range.get("2026-11-10").length === 1 && range.get("2026-11-11").length === 2);
ok("区间外日期不进结果", !range.has("2026-11-09") && !range.has("2026-11-12"));

host.notice("测试通知");
ok("通知被记录", host.state.notices.length === 1 && host.state.notices[0] === "测试通知");
await host.saveSettings();
ok("设置保存被记录", host.state.saves === 1);
host.invalidateCache();
ok("缓存失效被记录", host.state.cacheClears === 1);
host.openQuickAdd("2026-11-11", () => {}, "09:00");
ok("快速记录弹窗被记录", host.state.quickAdds.length === 1 && host.state.quickAdds[0].dateStr === "2026-11-11");
host.openSubItems(mkEntry("x", "2026-11-11"));
ok("子项弹窗被记录", host.state.subItems.length === 1);
const unsub = host.onExternalChange(() => {});
ok("变更监听可注册", host.state.listeners.length === 1);
if (typeof unsub === "function") unsub();
ok("变更监听可取消", host.state.listeners.length === 0);

const writable = mkEntry("a", "2026-11-10");
const readonlyEntry = mkEntry("m1", "2026-11-11", { source: "memos", readonly: true });
ok("内存宿主可写条目能改时间", await host.updateEntryTime(writable, 10 * 3600, 11 * 3600));
ok("内存宿主只读条目拒绝改时间", !(await host.updateEntryTime(readonlyEntry, 10 * 3600, 11 * 3600)));
ok("内存宿主只读条目拒绝跨天", !(await host.moveEntryToDate(readonlyEntry, "2026-11-12", 0, 0)));
ok("内存宿主可写条目能跨天", await host.moveEntryToDate(writable, "2026-11-12", 0, 0));

// ---------- 4) 关键：渲染引擎在非 Obsidian 宿主下真的能跑 ----------
console.log("--- 渲染引擎 × 非 Obsidian 宿主 ---");
{
  const renderer = new TimenoteRenderer(/* root */ {}, host);
  ok("TimenoteRenderer 无需 ItemView / leaf 即可实例化", !!renderer && typeof renderer === "object");
  ok("渲染引擎读的是注入的 host.settings",
    renderer.getLayoutMode() === "compact" && renderer.getAddType() === "point");
  ok("渲染引擎用注入的日期实现（nativeMoment）",
    /^\d{4}-\d{2}-\d{2}$/.test(renderer.currentDate.format("YYYY-MM-DD")));

  // 不测 DOM 渲染（那要完整浏览器），测状态流转：导航、过滤、生命周期
  renderer.renderView = async () => { /* 屏蔽 DOM 渲染，只验证状态流转 */ };
  const before = renderer.currentDate.clone().format("YYYY-MM-DD");
  renderer.navigateDay(1);
  const after = renderer.currentDate.format("YYYY-MM-DD");
  ok("非 Obsidian 宿主下「按天导航」仍工作", before !== after, `${before} -> ${after}`);
  renderer.navigateDay(-1);
  ok("反向导航回到原日期", renderer.currentDate.format("YYYY-MM-DD") === before);

  renderer.currentFilterType = "external";
  const filtered = renderer.filterEntries([
    mkEntry("local", "2026-11-11", { source: "daily" }),
    mkEntry("remote", "2026-11-11", { source: "memos", readonly: true })
  ]);
  ok("「外部来源」过滤只留聚合条目", filtered.length === 1 && filtered[0].id === "remote");

  // 订阅必须真的生效（不是只调用了 onExternalChange 就算过）
  let renderCount = 0;
  renderer.renderView = async () => { renderCount++; };
  await renderer.onOpen();
  ok("onOpen 后渲染一次", renderCount === 1);
  host.state.listeners.forEach(fn => fn());
  ok("外部变更经订阅触发重渲染", renderCount === 2);

  // onOpen 幂等：重复调用不应叠加订阅（leaf 复用场景）
  await renderer.onOpen();
  ok("重复 onOpen 不会重复注册订阅", host.state.listeners.length === 1);

  await renderer.onClose();
  ok("onClose 会解绑 onOpen 注册的订阅", host.state.listeners.length === 0);
  await renderer.onClose();
  ok("重复 onClose 安全（不抛错、不重复解绑）", host.state.listeners.length === 0);
  ok("jumpToFileLine 委托给 host.openEntry", (() => {
    // 同步调用，异步结果不阻塞断言；检查是否记录了跳转请求
    renderer.jumpToFileLine(mkEntry("z", "2026-11-11"));
    return host.state.opened.some(o => o.kind === "entry" && o.value === "z");
  })());
}

// ---------- 5) 共用装配入口 apps/bootstrap.ts ----------
console.log("--- 三宿主共用装配入口 ---");
{
  const apps = await loadApps();
  const { prepareHostEnvironment, mountTimeNote } = apps;
  ok("bootstrap 导出 prepareHostEnvironment / mountTimeNote",
    typeof prepareHostEnvironment === "function" && typeof mountTimeNote === "function");

  const bootSrc = loadPluginSource("apps/bootstrap.ts");
  ok("bootstrap 默认用零依赖 nativeMoment（新宿主无需额外依赖）",
    /opts\.momentFactory \?\? nativeMoment/.test(bootSrc));
  ok("bootstrap 默认不开 forceDomHelpers（Obsidian 侧零变化）",
    /opts\.forceDomHelpers === true/.test(bootSrc) && !/installDomHelpers\(true\)/.test(bootSrc));

  // 真跑一遍：不传任何宿主专属参数，用内存宿主 + 默认 nativeMoment
  prepareHostEnvironment();
  const h2 = createMemoryHostAdapter({ settings: { defaultView: "day" } });
  const r2 = mountTimeNote(/* root */ {}, h2);
  ok("无宿主参数也能完成装配", !!r2 && r2.currentViewMode === "day");
  ok("装配后日期实现可用", /^\d{4}-\d{2}-\d{2}$/.test(r2.currentDate.format("YYYY-MM-DD")));
  r2.renderView = async () => {};
  const d0 = r2.currentDate.clone().format("YYYY-MM-DD");
  r2.navigateDay(1);
  ok("装配出的 renderer 导航可用", r2.currentDate.format("YYYY-MM-DD") !== d0);
}

// ---------- 6) 产物 ----------
console.log("--- 产物与装配 ---");
{
  const bundle = fs.readFileSync(path.join(PROJECT_ROOT, "main.js"), "utf8");
  ok("产物里含共享渲染引擎", /TimenoteRenderer/.test(bundle));
  ok("产物里含 Obsidian 适配器装配", /createObsidianHostAdapter|QuickAddModal:/.test(bundle));
  const full = loadPluginSources();
  ok("源码全集覆盖三处（main / view / adapter）",
    full.includes("class TimenoteView extends ItemView") &&
    full.includes("export class TimenoteRenderer") &&
    full.includes("createObsidianHostAdapter"));
}

console.log(`\n===== ${pass} passed, ${fails.length} failed =====`);
if (fails.length) {
  console.log(fails.map(f => "  - " + f).join("\n"));
  process.exit(1);
}
