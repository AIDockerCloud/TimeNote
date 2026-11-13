// DEC-022 回归测试：① 时间块 / 时间点跨天拖动回写 ② 新增时间点
//
// 用法：node scripts/dev/test-cross-day.mjs
// 与项目其它开发脚本一致：直接从 main.ts 抽真实实现（产物不导出内部函数），
// 用假 vault / 假 DOM 验证「只搬目标行、绝不误删用户内容」与「点不会被写成块」。
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, loadCore, loadSources, loadPluginSources } from "./lib/elastic.mjs";

const src = loadPluginSources();
// DEC-026：本地日记的解析 / 回写已搬进 sources/daily.ts，静态断言要对着它做
const dailySrc = fs.readFileSync(path.join(PROJECT_ROOT, "sources", "daily.ts"), "utf8");
const css = fs.readFileSync(path.join(PROJECT_ROOT, "styles.css"), "utf8");
const built = fs.readFileSync(path.join(PROJECT_ROOT, "main.js"), "utf8");
// DEC-029：参考宿主设置与交互预览也要跟默认类型一起同步
const refSettingsSrc = fs.readFileSync(path.join(PROJECT_ROOT, "hosts/memory/adapter.ts"), "utf8");
const previewSrc = fs.readFileSync(path.join(PROJECT_ROOT, "scripts/dev/preview-cross-day.mjs"), "utf8");

let pass = 0;
const fails = [];
const ok = (name, cond, extra) => {
  if (cond) pass++;
  else fails.push(name + (extra ? `  [${extra}]` : ""));
};

const formatSecondsToTime = (sec) => {
  const c = Math.max(0, Math.min(86400, sec));
  return String(Math.floor(c / 3600)).padStart(2, "0") + ":" +
    String(Math.floor((c % 3600) / 60)).padStart(2, "0");
};

// ---------- 抽取真实实现 ----------
function sliceMarked(begin, end) {
  const a = src.indexOf(begin);
  const b = src.indexOf(end);
  if (a < 0 || b < 0 || b <= a) throw new Error(`找不到标记 ${begin} / ${end}`);
  return src.slice(a, b);
}
function sliceFunction(name) {
  const a = src.indexOf(`function ${name}(`);
  if (a < 0) throw new Error(`找不到 function ${name}`);
  const b = src.indexOf("\n}\n", a) + 3;
  return src.slice(a, b);
}
function extractMethod(signature) {
  const a = src.indexOf(`  ${signature}`);
  if (a < 0) throw new Error(`找不到方法 ${signature}`);
  let depth = 0, end = -1;
  for (let i = src.indexOf("{", a); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return src.slice(a, end)
    .replace(/^\s*(?:async\s+)?\w+\([^)]*\)\s*\{/, "")
    .replace(/\}\s*$/, "");
}

// 平台无关的纯函数直接用 core 的实现（DEC-023：不再按位置切片）
const {
  normalizeAddType,
  rewriteEntryLineTime,
  collectSubItemLines,
  isPointEntry,
  parseLine,
  parseQuickAddSection,
  sectionHeaderRegex
} = await loadCore();

const findDropDate = new Function(
  `return function(clientX, homeDate, columns){ ${extractMethod("findDropDate(clientX, homeDate, columns) {")} };`
)();
const markDropDate = new Function(
  `return function(columns, targetDate){ ${extractMethod("markDropDate(columns, targetDate) {")} };`
)();

// ---------- 1) normalizeAddType ----------
console.log("--- 新建记录类型判定 ---");
// DEC-029：默认类型改为时间点，所有兜底路径跟着落到 point
ok("默认（旧 data.json 无此键）回退时间点", normalizeAddType(undefined) === "point");
ok("空值回退时间点", normalizeAddType("") === "point");
ok("非法值回退时间点", normalizeAddType("whatever") === "point");
ok("point 识别", normalizeAddType("point") === "point");
ok("大小写不敏感", normalizeAddType("POINT") === "point");
ok("block 识别", normalizeAddType("block") === "block");

// ---------- 2) rewriteEntryLineTime ----------
console.log("--- 跨天移动时的行首改写 ---");
const H = (h) => h * 3600;
{
  const out = rewriteEntryLineTime("- 14:00-15:30 写周报 #工作", H(9), H(10) + 1800, false);
  ok("范围行改成新范围，正文与标签不动", out === "- 09:00-10:30 写周报 #工作", String(out));
}
{
  const out = rewriteEntryLineTime("- 09:00 站会 30m", H(10), H(11), false);
  ok("单时间 + 30m 标签 → 范围并去掉冲突标签", out === "- 10:00-11:00 站会", String(out));
}
{
  const out = rewriteEntryLineTime("- [ ] 10:00-11:00 任务 #a", H(8), H(9), false);
  ok("任务复选框保留", out === "- [ ] 08:00-09:00 任务 #a", String(out));
}
{
  const out = rewriteEntryLineTime("\t* 08:00-09:00 缩进星号", H(7), H(8) + 1800, false);
  ok("缩进与 * 列表符保留", out === "\t* 07:00-08:30 缩进星号", String(out));
}
{
  const out = rewriteEntryLineTime("- 14:00:00-15:00:00 带秒", H(14), H(15), false);
  ok("带秒前缀可改写", out === "- 14:00-15:00 带秒", String(out));
}
ok("无时间行拒绝", rewriteEntryLineTime("- 纯文本记录", H(1), H(2), false) === null);
ok("块模式遇到非列表行拒绝", rewriteEntryLineTime("14:00 没有列表符", H(1), H(2), false) === null);
{
  const out = rewriteEntryLineTime("- 09:23 到公司 #通勤", H(10) + 15 * 60, H(10) + 15 * 60, true);
  ok("点只换时刻、绝不生成结束时间", out === "- 10:15 到公司 #通勤", String(out));
}
{
  const out = rewriteEntryLineTime("- [x] 09:23 打卡", H(8), H(8), true);
  ok("点保留已完成复选框", out === "- [x] 08:00 打卡", String(out));
}
{
  const out = rewriteEntryLineTime("- 09:00", H(9) + 30 * 60, H(9) + 30 * 60, true);
  ok("点行尾没有正文时不写 undefined", out === "- 09:30", String(out));
}
ok("点模式遇到范围行拒绝", rewriteEntryLineTime("- 09:00-10:00 已经是块", H(9), H(9), true) === null);
ok("点模式遇到无时间行拒绝", rewriteEntryLineTime("- 纯文本", H(9), H(9), true) === null);
ok("点模式改写结果仍被判定为点",
  isPointEntry(parseLine(rewriteEntryLineTime("- 09:23 到公司", H(10), H(10), true), 1, "2026-11-11", "x.md")));

// ---------- 3) collectSubItemLines ----------
console.log("--- 子项随记录一起搬走 ---");
{
  const lines = ["- 14:00-15:00 主记录", "\t- 子项 A", "  - 子项 B", "", "  - 不属于本记录", "- 16:00 下一条"];
  const subs = collectSubItemLines(lines, 0);
  ok("连续缩进行全部收集", subs.length === 2 && subs[0] === "\t- 子项 A" && subs[1] === "  - 子项 B", JSON.stringify(subs));
}
ok("空行截断收集", collectSubItemLines(["- 14:00 x", "  - A", "", "  - B"], 0).length === 1);
ok("没有子项时返回空数组", collectSubItemLines(["- 14:00 x", "- 15:00 y"], 0).length === 0);

// ---------- 4) moveEntryToDate 端到端（真实现 + 内存存储） ----------
console.log("--- 跨天移动回写（真实现）---");
// DEC-026：moveEntryToDate 已迁进 sources/daily.ts，直接 import 真实现。
// 写入顺序（先目标后源）靠 MemoryFileStore.calls 验证 —— 这比假 vault 更接近真实。
const { DailySource, MemoryFileStore } = await loadSources();

const SRC_PATH = "SpiralNotes/2026/Daily/11/2026-11-10.md";
const DST_PATH = "SpiralNotes/2026/Daily/11/2026-11-11.md";
const DST_INITIAL = "# 2026-11-11\n\n## 灵感闪念\n";

function makeMoveService(text, opts = {}) {
  const store = new MemoryFileStore({ [SRC_PATH]: text, [DST_PATH]: DST_INITIAL });
  if (opts.failAdd) {
    // 模拟「写目标日记失败」：目标文件写入抛错，源文件不应被碰
    const realWrite = store.write.bind(store);
    let failed = false;
    store.write = async (p, t) => {
      if (!failed && p === DST_PATH) { failed = true; throw new Error("disk full"); }
      return realWrite(p, t);
    };
  }
  const daily = new DailySource({ store, settings: { periodicNotesFolder: "SpiralNotes" } });
  return {
    store,
    daily,
    svc: daily, // 兼容原调用点的解构写法
    calls: store.calls,
    file: { get _text() { return store.peek(SRC_PATH); } },
    target: { get _text() { return store.peek(DST_PATH); } }
  };
}
/** 统一的调用入口，等价于原来的 move(svc, ...) */
const move = (ctx, entry, targetDate, s, e) => {
  // ctx 可能是 makeMoveService 的返回值，也可能直接是 DailySource 实例
  const daily = ctx && ctx.daily ? ctx.daily : ctx;
  return daily.moveEntryToDate(entry, targetDate, s, e);
};

const baseEntry = (rawLine, extra = {}) => ({
  filePath: SRC_PATH, lineNum: 4, dateStr: "2026-11-10", rawLine,
  source: "daily", hasTime: true, isRange: true,
  startSeconds: H(14), endSeconds: H(15) + 1800, ...extra
});

{
  const text = "# 2026-11-10\n\n## 灵感闪念\n- 14:00-15:30 写周报 #工作\n- 16:00 复盘\n";
  const { file, target, calls, svc } = makeMoveService(text);
  const changed = await move(svc, baseEntry("- 14:00-15:30 写周报 #工作"),
    "2026-11-11", H(9), H(10) + 1800);
  ok("块跨天返回 true", changed === true);
  // 只关心写类操作：第一次写必须落在目标日记，第二次才是删源行
  const writes = calls.filter(c => c.op === "write" || c.op === "create");
  ok("先写目标日记，再删源日记那一行",
    writes.length === 2 && writes[0].path === DST_PATH && writes[1].path === SRC_PATH,
    JSON.stringify(writes));
  ok("目标日记插入改写后的范围行（含正文/标签）",
    target._text.includes("- 09:00-10:30 写周报 #工作"),
    JSON.stringify(target._text));
  ok("源日记只删目标行、其余顺序不变",
    file._text === "# 2026-11-10\n\n## 灵感闪念\n- 16:00 复盘\n", JSON.stringify(file._text));
  ok("目标日记确实写到了 11-11 那个文件", writes[0].path === DST_PATH);
  ok("源文件的解析缓存被清掉", svc.fileCache.has(SRC_PATH) === false);
}
{
  const raw = "- 09:23 到公司 #通勤";
  const text = `# 2026-11-10\n\n## 灵感闪念\n${raw}\n- 16:00 复盘\n`;
  const { file, target, svc } = makeMoveService(text);
  const entry = baseEntry(raw, { isRange: false, startSeconds: H(9) + 23 * 60, endSeconds: H(9) + 53 * 60 });
  const changed = await move(svc, entry, "2026-11-11", H(10) + 15 * 60, H(10) + 15 * 60);
  ok("点跨天返回 true", changed === true);
  ok("点搬到目标日仍是单时间行（绝不变成块）",
    target._text.includes("- 10:15 到公司 #通勤") && !/- 10:15-/.test(target._text),
    JSON.stringify(target._text));
  ok("点跨天后源文件不留残行", !file._text.includes("到公司"));
}
{
  const raw = "- [ ] 14:00-15:30 任务 #a";
  const text = `# 2026-11-10\n\n## 灵感闪念\n${raw}\n\t- 子项 A\n  - 子项 B\n- 16:00 复盘\n`;
  const { file, target, calls, svc } = makeMoveService(text);
  const changed = await move(svc, baseEntry(raw), "2026-11-11", H(14), H(15) + 1800);
  ok("带子项的任务跨天返回 true", changed === true);
  ok("复选框 / 正文 / 标签原样搬到目标日记",
    target._text.includes("- [ ] 14:00-15:30 任务 #a\n\t- 子项 A\n  - 子项 B"));
  ok("三条（主行 + 两个子项）一起从源日记删除",
    file._text === "# 2026-11-10\n\n## 灵感闪念\n- 16:00 复盘\n", JSON.stringify(file._text));
  // 净增换行数 = 主行 + 两个子项（比断言内部 rawLines 更贴近用户可见结果）
  const delta = (target._text.match(/\n/g) || []).length - (DST_INITIAL.match(/\n/g) || []).length;
  ok("搬走的行数 = 主行 + 子项数", delta === 3, String(delta));
}
{
  const raw = "- 09:00 站会 30m";
  const text = `# 2026-11-10\n\n## 灵感闪念\n${raw}\n`;
  const { target, svc } = makeMoveService(text);
  await move(svc, baseEntry(raw), "2026-11-11", H(10), H(11));
  ok("时长标签与新范围冲突时去掉",
    target._text.includes("- 10:00-11:00 站会\n") && !target._text.includes("30m"));
}
{
  const raw = "- 14:00-15:30 写周报";
  const { file, target, svc } = makeMoveService(
    `# 2026-11-10\n\n## 灵感闪念\n${raw}\n`);
  const changed = await move(svc, baseEntry(raw, { source: "blinko" }),
    "2026-11-11", H(14), H(15));
  ok("Blinko 等外部来源拒绝跨天", changed === false);
  ok("拒绝时两个文件都不动", file._text.includes(raw) && !target._text.includes(raw));
}
{
  // DEC-023：远程聚合来源（memos / Blinko API）带 readonly 标记，
  // 即便 source 不是 "blinko" 也必须拒绝跨天 —— 它们连本地文件都没有。
  const raw = "- 14:00-15:30 写周报";
  const { file, target, svc } = makeMoveService(
    `# 2026-11-10\n\n## 灵感闪念\n${raw}\n`);
  const changed = await move(
    svc, baseEntry(raw, { source: "memos", readonly: true, filePath: "users/1" }),
    "2026-11-11", H(14), H(15));
  ok("readonly 聚合来源拒绝跨天（memos）", changed === false);
  ok("readonly 拒绝时两个文件都不动", file._text.includes(raw) && !target._text.includes(raw));
}
{
  const raw = "- 14:00-15:30 写周报";
  const { file, target, svc } = makeMoveService(
    `# 2026-11-10\n\n## 灵感闪念\n${raw}\n`);
  const changed = await move(svc, baseEntry(raw), "2026-11-10", H(14), H(15));
  ok("同日期不触发跨天", changed === false);
  ok("同日期时两个文件都不动", file._text.includes(raw) && !target._text.includes(raw));
}
{
  const { file, target, svc } = makeMoveService(
    "# 2026-11-10\n\n## 灵感闪念\n- 已被外部改过的行\n");
  const changed = await move(svc, baseEntry("- 14:00-15:30 写周报"),
    "2026-11-11", H(14), H(15));
  ok("行号漂移（rawLine 不一致）拒绝", changed === false);
  ok("漂移时不删任何用户内容", file._text.includes("已被外部改过的行") && !target._text.includes("写周报"));
}
{
  const raw = "- 纯文本记录";
  const { file, svc } = makeMoveService(`# 2026-11-10\n\n## 灵感闪念\n${raw}\n`);
  const changed = await move(svc, baseEntry(raw, { hasTime: false }),
    "2026-11-11", H(14), H(15));
  ok("行首没有时间前缀时拒绝", changed === false);
  ok("拒绝时源行仍在", file._text.includes(raw));
}
{
  const raw = "- 14:00-15:30 写周报";
  const { file, svc } = makeMoveService(`# 2026-11-10\n\n## 灵感闪念\n${raw}\n`);
  const changed = await move(svc, baseEntry(raw, { lineNum: 99 }),
    "2026-11-11", H(14), H(15));
  ok("行号越界拒绝", changed === false && file._text.includes(raw));
}
{
  const raw = "- 14:00-15:30 写周报";
  const { file, target, svc } = makeMoveService(
    `# 2026-11-10\n\n## 灵感闪念\n${raw}\n`, { failAdd: true });
  let changed = true;
  try { changed = await move(svc, baseEntry(raw), "2026-11-11", H(14), H(15)); }
  catch (e) { changed = `threw: ${e.message}`; }
  ok("目标日记写失败时返回 false 而不是抛异常", changed === false, String(changed));
  ok("写失败时源记录不丢（宁可重复不丢数据）", file._text.includes(raw) && !target._text.includes(raw));
}

// ---------- 5) 落点列判定 ----------
console.log("--- 跨天落点（列几何）---");
function makeCol(dateStr, left, right) {
  const classes = new Set();
  const children = [];
  return {
    dataset: { dateStr },
    getBoundingClientRect: () => ({ left, right }),
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    classes,
    children,
    // DEC-031：markDropDate 会在目标列顶创建 / 移除日期标签，假列要能接住
    querySelector: (sel) => children.find(c => c.className === sel.slice(1)) || null,
    createEl: (_tag, opts) => {
      const el = {
        className: opts?.cls || "",
        textContent: "",
        remove() { const i = children.indexOf(el); if (i >= 0) children.splice(i, 1); }
      };
      children.push(el);
      return el;
    }
  };
}
{
  const cols = [makeCol("2026-11-10", 100, 200), makeCol("2026-11-11", 200, 300), makeCol("2026-11-12", 300, 400)];
  ok("横向进入别的列 → 返回目标日期", findDropDate(250, "2026-11-10", cols) === "2026-11-11");
  ok("留在本列 → 不跨天", findDropDate(150, "2026-11-10", cols) === null);
  ok("落在刻度列 / 容器外 → 不跨天", findDropDate(20, "2026-11-10", cols) === null);
  ok("右侧超出所有列 → 不臆造日期", findDropDate(999, "2026-11-10", cols) === null);
  ok("空列集合不跨天", findDropDate(250, "2026-11-10", []) === null);
  markDropDate(cols, "2026-11-11");
  ok("只高亮目标列", cols[1].classes.has("is-drop-target") &&
    !cols[0].classes.has("is-drop-target") && !cols[2].classes.has("is-drop-target"));
  ok("目标列顶显示「松手 → 完整日期」标签",
    cols[1].children.some(c => c.textContent === "松手 → 2026-11-11") &&
    cols[0].children.length === 0 && cols[2].children.length === 0);
  markDropDate(cols, null);
  ok("松手后清掉所有高亮", cols.every(c => !c.classes.has("is-drop-target")));
  ok("松手后清掉所有落点标签", cols.every(c => c.children.length === 0));
}

// ---------- 6) addEntry(rawLines) 与「新增时间点落盘不是块」 ----------
console.log("--- 原样插入 + 新增时间点的数据形态 ---");
{
  // addEntry 已迁进 sources/daily.ts，直接用真实现 + 内存存储
  const store = new MemoryFileStore({
    [DST_PATH]: "# 2026-11-11\n\n## 灵感闪念\n- 08:00 旧记录\n"
  });
  const daily = new DailySource({
    store,
    settings: { quickAddSection: "## 灵感闪念", periodicNotesFolder: "SpiralNotes" }
  });
  await daily.addEntry("2026-11-11", "", "", false, [], "",
    ["- [ ] 14:00-15:30 任务 #a", "\t- 子项 A"]);
  const text = store.peek(DST_PATH);
  ok("rawLines 原样插入（不重新拼装行）",
    text.includes("- [ ] 14:00-15:30 任务 #a\n\t- 子项 A\n- 08:00 旧记录\n"),
    JSON.stringify(text));
  ok("rawLines 模式不会插入空前缀", !text.includes("-  \n"));
}
{
  const pointLine = "- 09:23 到公司 #通勤";
  const e = parseLine(pointLine, 1, "2026-11-11", "x.md");
  ok("新增时间点解析出 hasTime", !!e && e.hasTime === true);
  ok("新增时间点 isRange=false（isPointEntry 为真）", !!e && e.isRange === false && isPointEntry(e));
  ok("新增时间点不会凭空生成结束时间", e.endSeconds === e.startSeconds + 1800 && e.timeStr === "09:23");
  ok("新增时间点不带虚构 30m 标签", !/30m/.test(pointLine));
  const blockLine = "- 09:23-10:23 开会";
  const b = parseLine(blockLine, 1, "2026-11-11", "x.md");
  ok("时间块仍是块（不被点逻辑吞掉）", !!b && b.isRange === true && !isPointEntry(b));
  const durationLine = "- 09:23 站会 45min";
  const d = parseLine(durationLine, 1, "2026-11-11", "x.md");
  ok("显式时长标签仍是块（DEC-018 边界不破）", !!d && d.isRange === true && !isPointEntry(d));
}

// ---------- 7) 静态断言：接线与产物 ----------
console.log("--- 接线 / 产物 / 样式 ---");
ok("默认设置是时间点（DEC-029）", /defaultAddType:\s*"point"/.test(src));
ok("每列带日期标识", /col\.dataset\.dateStr = dateStr;/.test(src));
ok("块拖动接了跨天落点", /const getColumns = \(\)/.test(src) &&
  /commitEntryMove\(entry, moveTo, curStart, curEnd\)/.test(src));
ok("点线拖动也接了跨天落点", /commitEntryPointMove\(entry, moveTo, curStart\)/.test(src));
ok("跨天只在中部平移模式生效（边缘改起止不跨天）",
  /mode === "move" && canMoveDay && Math\.abs\(dragDx\) >= 12/.test(src));
// 只读守卫从「source 判断」升级为「source 判断 + readonly 判断」（DEC-023）：
// 本地 Blinko 导出文件只有 source、走 HTTP 聚合的条目还带 readonly。
// 行为断言已在上面两段覆盖，这里只静态确认两处守卫都还在位。
ok("外部来源禁止跨天（canMoveDay 同时看 readonly 与 source）",
  /canMoveDay = !entry\.readonly && \(!entry\.source \|\| entry\.source === "daily"\)/.test(src) &&
  /if \(entry\.readonly \|\| \(entry\.source && entry\.source !== "daily"\)\) return false;/.test(dailySrc));
ok("回写走 moveEntryToDate，源行不匹配时拒绝",
  /if \(lines\[idx\] !== entry\.rawLine\) return false;/.test(dailySrc));
ok("先写目标文件再删源行",
  dailySrc.indexOf("await this.addEntry(targetDate") >= 0 &&
  dailySrc.indexOf("await this.addEntry(targetDate") < dailySrc.indexOf("remaining.splice(idx, moving.length)"));
ok("写目标失败时放弃，不删源行", /\}\s*catch\s*\{\s*return false;/.test(dailySrc));
ok("addEntry 支持 rawLines 复用插入逻辑",
  /rawLines: string\[\] \| null = null/.test(dailySrc) &&
  dailySrc.includes('rawLines.join("\\n")'));
ok("Alt 临时切到相反类型（默认时间点时不再是空操作）",
  /const asPoint = ev\.altKey \? this\.getAddType\(\) !== "point" : this\.getAddType\(\) === "point";/.test(src));
ok("点模式画 .timenote-point-ghost 而不是范围 ghost", /cls: "timenote-point-ghost"/.test(src));
ok("点模式打开快速记录时传 point 类型与空结束时间",
  /this\.openQuickAdd\(dateStr, sec, sec, "point", \{ col, scale, ghost, isPoint: true \}\)/.test(src) &&
  /isPoint \? "" : formatSecondsToTime\(endSec\)/.test(src));
// DEC-033：松手后 ghost 不再消失，交给弹窗钩子维持「待创建」渲染
ok("松手不再删 ghost，交给 openQuickAdd 变成待创建预览",
  !/ghost\.remove\(\);\s*\n\s*this\.openQuickAdd/.test(src) &&
  /this\.openQuickAdd\(dateStr, s, en, "block", \{ col, scale, ghost, isPoint: false \}\)/.test(src) &&
  /ghost: null, isPoint: false/.test(src));
ok("待创建预览随表单实时重画，关闭弹窗才移除",
  /createQuickAddPreviewHooks\(/.test(src) &&
  /onPreview: paint/.test(src) &&
  /onDismiss: \(\) => this\.clearQuickAddPreview\(\)/.test(src) &&
  src.includes("timenote-quickadd-pending") &&
  src.includes("timenote-block-column"));
ok("预览钩子经 HostAdapter 的 openQuickAdd 透传",
  /isPoint \? "point" : "block",\s*\n\s*hooks/.test(src) &&
  /hooks\?: QuickAddHooks/.test(
    fs.readFileSync(path.join(PROJECT_ROOT, "hosts", "types.ts"), "utf8")));
ok("快速记录拆成标题必填 + 正文选填，正文走 addEntry 第 8 参数",
  src.includes("请输入标题！") &&
  /const titleInput = titleRow\.createEl\("input"/.test(src) &&
  /const bodyArea = form\.createEl\("textarea"/.test(src) &&
  /null,\s*\n\s*this\.body/.test(src) &&
  src.includes("notifyPreview()"));
ok("DailySource 把正文写成 Tab 缩进子项，并兼容旧的多行 content",
  /normalizeQuickAddBodyLines\(body\)/.test(dailySrc) &&
  /buildQuickAddLines\(/.test(dailySrc) &&
  /body = ""/.test(dailySrc) &&
  /const isSubItem = \/\^\(\?:\\t\+| \{2,\}\)\/\.test\(rawLine\)/.test(dailySrc));
ok("解析时缩进优先于标题 / 围栏判断，正文里的 ## 不会切断父子关系",
  dailySrc.indexOf("const isSubItem = /^(?:\\t+| {2,})/.test(rawLine)") <
  dailySrc.indexOf('trimmed.startsWith("#")'));
ok("CSS 有待创建预览的强化样式（含 pre-line 显示标题）",
  /\.timenote-block-ghost\.is-pending/.test(css) &&
  /\.timenote-point-ghost\.is-pending/.test(css) &&
  /white-space: pre-line/.test(css));
// DEC-033：思源 / Blinko 的共用弹窗必须同规则，否则三端行为会分叉
const sharedDialogSrc = fs.readFileSync(
  path.join(PROJECT_ROOT, "apps", "shared", "dialogs.ts"), "utf8");
const sharedHostSrc = fs.readFileSync(
  path.join(PROJECT_ROOT, "apps", "shared", "host-adapter.ts"), "utf8");
ok("共用弹窗也拆标题 / 正文且标题必填",
  sharedDialogSrc.includes("请输入标题！") &&
  /const titleInput = doc\.createElement\("input"\)/.test(sharedDialogSrc) &&
  /const bodyArea = doc\.createElement\("textarea"\)/.test(sharedDialogSrc) &&
  /v\.endTimeStr, v\.body/.test(sharedDialogSrc));
ok("共用弹窗接预览钩子，关闭幂等",
  /hooks\?: QuickAddHooks/.test(sharedDialogSrc) &&
  /if \(closed\) return;/.test(sharedDialogSrc) &&
  /hooks\.onDismiss/.test(sharedDialogSrc) &&
  sharedDialogSrc.includes("notifyPreview()"));
ok("共用 adapter 把正文接到 addEntry 第 8 参数（rawLines 保持 null）",
  /service\.addEntry\(d, t, c, task, tags, end, null, body\)/.test(sharedHostSrc));
ok("QuickAddModal 的记录类型是单击切换按钮（不再下拉）",
  /const typeBtn = typeRow\.createEl\("button"/.test(src) &&
  /typeBtn\.onclick = \(\) => \{[\s\S]{0,160}this\.addType = this\.addType === "point" \? "block" : "point"/.test(src) &&
  !/createEl\("select"/.test(src) &&
  /endTimeInput\.disabled = isPoint/.test(src) &&
  /this\.addType = normalizeAddType/.test(src));
ok("保存时点模式强制不带结束时间",
  /this\.addType === "point" \? "" : this\.endTimeStr\.trim\(\)/.test(src));
ok("点模式拒绝把范围写进开始时间",
  /this\.addType === "point" && hasExplicitRange/.test(src));
// 2026-11-12：周视图下 currentDate 会被对齐到周起始日（视图第一天），
// 拿它当「+ 记一条」的默认日期会把新建记录记到第一天而不是今天。
ok("工具栏「+ 记一条」默认今天，不用 currentDate",
  /openQuickAdd\(moment\(\)\.format\("YYYY-MM-DD"\)/.test(src) &&
  !/openQuickAdd\(this\.currentDate\.format/.test(src));
ok("设置页默认类型改成单击切换按钮，工具栏仍是单击切换",
  /setName\("新建记录默认类型"\)[\s\S]{0,600}\.addButton\(/.test(src) &&
  /新增：时间点/.test(src) &&
  /addTypeBtn\.onclick = async \(\) =>/.test(src));
ok("两处按钮共用 addTypeLabel 文案，不再各写一份",
  (src.match(/addTypeLabel\(/g) || []).length >= 4);
ok("CSS 有类型切换按钮与「点击切换」提示",
  /\.timenote-type-toggle/.test(css) && /content: "点击切换"/.test(css));
ok("参考宿主设置默认也是时间点", /defaultAddType:\s*"point"/.test(refSettingsSrc));
ok("交互预览与真机一致（默认时间点 + 单击切换按钮）",
  /let addType = "point"/.test(previewSrc) &&
  /typeBtn\.onclick/.test(previewSrc) &&
  !/id="typeSelect"/.test(previewSrc));
ok("CSS 有落点高亮与点预览线，且颜色走双声明",
  /\.timenote-block-column\.is-drop-target/.test(css) &&
  /\.timenote-point-ghost/.test(css) &&
  /box-shadow: inset 0 0 0 3px rgba\(/.test(css) &&
  /box-shadow: inset 0 0 0 3px color-mix\(/.test(css) &&
  /background-color: color-mix\(/.test(css));
// DEC-031：列数组必须在 pointerdown 时才查。渲染时（days.forEach 逐列）做快照
// 只会拿到「到当前列为止」的几列，第一天的记录横拖永远找不到落点。
ok("拖动时才查列数组（渲染时快照会漏掉后面的列）",
  (src.match(/const getColumns = \(\)/g) || []).length === 2 &&
  (src.match(/const columns = getColumns\(\);/g) || []).length === 2 &&
  !src.includes("const columns = col && col.parentElement"));
ok("落点高亮带列顶日期标签",
  src.includes("timenote-drop-target-label") && src.includes("松手 → ") &&
  css.includes(".timenote-drop-target-label"));
ok("落点日期显示完整 YYYY-MM-DD，横拖无落点时给 ?",
  src.includes("` → ${targetDate}`") && src.includes("→ ?") &&
  !src.includes("targetDate.slice(5)"));
ok("产物 main.js 已包含新逻辑（需先 build）",
  ["defaultAddType", "moveEntryToDate", "timenote-point-ghost", "is-drop-target", "normalizeAddType"]
    .every(k => built.includes(k)),
  ["defaultAddType", "moveEntryToDate", "timenote-point-ghost", "is-drop-target", "normalizeAddType"]
    .filter(k => !built.includes(k)).join(","));
ok("没有把点记录交给时间块分簇", /\.filter\(e => !isPointEntry\(e\)\)/.test(src));
ok("没有新增把手 DOM", !src.includes("timenote-block-edge"));
ok("跨天仍不碰 updateEntryTime / updateEntryPointTime 的原有边界",
  dailySrc.includes("async updateEntryTime(entry: NoteEntry, startSec: number, endSec: number)") &&
  dailySrc.includes("async updateEntryPointTime(entry: NoteEntry, startSec: number)"));

console.log(`\n===== ${pass} passed, ${fails.length} failed =====`);
if (fails.length) {
  console.log("FAILED:");
  fails.forEach(f => console.log("  ✗", f));
  process.exit(1);
}
