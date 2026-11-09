// 快速记录默认插入标题（DEC-020）：设置里写 "## 灵感闪念" / "### 随手记" 指定层级与标题。
//
// 用法：node scripts/dev/test-quick-add-section.mjs（需先 npm run build）
// 覆盖：纯函数解析 / 标题行匹配 / addEntry 假 vault 端到端插入 / 四处调用点静态断言。
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "./lib/elastic.mjs";

const src = fs.readFileSync(path.join(PROJECT_ROOT, "main.ts"), "utf8");
const bundle = fs.readFileSync(path.join(PROJECT_ROOT, "main.js"), "utf8");

let pass = 0;
const fails = [];
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name + (extra ? `  [${extra}]` : "")); console.log(`  ✗ ${name}${extra ? `  [${extra}]` : ""}`); }
};

// ---------- 抽真实实现（按 SECTION_HEADING 区块标记，测的就是进产物的那份代码） ----------
const BEGIN = "// --- SECTION_HEADING_BEGIN ---";
const END = "// --- SECTION_HEADING_END ---";
const bStart = src.indexOf(BEGIN);
const bEnd = src.indexOf(END);
if (bStart < 0 || bEnd < 0 || bEnd <= bStart) throw new Error("main.ts 里找不到 SECTION_HEADING 区块");
const headingSrc = src.slice(bStart, bEnd + END.length);
const { parseQuickAddSection, sectionHeaderRegex } = new Function(
  `${headingSrc}\nreturn { parseQuickAddSection, sectionHeaderRegex };`
)();

// ---------- 1) 纯函数：层级 / 标题解析 ----------
console.log("--- 解析配置值 ---");
const p = (v) => parseQuickAddSection(v);
ok("默认值为二级标题", p("## 灵感闪念").level === 2 && p("## 灵感闪念").heading === "## 灵感闪念");
ok("### 指定三级", p("### 灵感闪念").level === 3 && p("### 灵感闪念").heading === "### 灵感闪念");
ok("# 指定一级", p("# 随手记").level === 1 && p("# 随手记").heading === "# 随手记");
ok("###### 指定六级", p("###### 随手记").level === 6);
ok("超过六级夹到六级", p("######## 随手记").level === 6 && p("######## 随手记").heading === "###### 随手记");
ok("# 与标题之间可不带空格", p("###随手记").level === 3 && p("###随手记").title === "随手记");
ok("标题文本可自定义", p("## 随手记").title === "随手记" && p("## 随手记").heading === "## 随手记");
ok("旧配置纯文本按二级兼容", p("灵感闪念").level === 2 && p("灵感闪念").title === "灵感闪念");
ok("旧配置纯文本也能改名", p("随手记").heading === "## 随手记");
ok("空值回退默认", p("").heading === "## 灵感闪念" && p(undefined).heading === "## 灵感闪念");
ok("只有 # 时回退默认标题", p("###").heading === "### 灵感闪念" && p("### ").title === "灵感闪念");
ok("行尾闭合井号不进标题", p("## 灵感闪念 ##").title === "灵感闪念" && p("## 灵感闪念 ##").heading === "## 灵感闪念");
ok("首尾空白被清理", p("   ###   随手记   ").heading === "### 随手记");
ok("返回值三字段齐全", Object.keys(p("### x")).sort().join(",") === "heading,level,title");

// ---------- 2) 已有日记里按「标题名」找节，忽略层级 ----------
console.log("--- 标题行匹配 ---");
const re = sectionHeaderRegex("随手记");
ok("匹配同级标题", re.test("### 随手记"));
ok("匹配不同层级标题", re.test("## 随手记") && re.test("#### 随手记"));
ok("容忍行首缩进与行尾空白", re.test("  ### 随手记   "));
ok("不匹配正文里的同名文字", !re.test("- 参考 ## 随手记"));
ok("不匹配标题后缀文字", !re.test("## 随手记 备注"));
ok("不匹配别的标题", !sectionHeaderRegex("灵感闪念").test("## 随手记"));
ok("正则元字符被转义", sectionHeaderRegex("A+B").test("## A+B") && !sectionHeaderRegex("A+B").test("## ABB"));

// ---------- 3) addEntry 假 vault 端到端 ----------
console.log("--- addEntry 插入行为 ---");
const mStart = src.indexOf("  async addEntry(dateStr, timeStr, content, isTask, tags = [], endTimeStr = \"\") {");
if (mStart < 0) throw new Error("main.ts 里找不到 addEntry");
let depth = 0;
let mEnd = -1;
for (let i = src.indexOf("{", mStart); i < src.length; i++) {
  if (src[i] === "{") depth++;
  else if (src[i] === "}") { depth--; if (depth === 0) { mEnd = i + 1; break; } }
}
const addInner = src.slice(mStart, mEnd)
  .replace(/^\s*async addEntry\([^)]*\) \{/, "")
  .replace(/\}\s*$/, "");
const fakeWindow = { moment: () => ({ format: (f) => (f === "YYYY" ? "2026" : "11") }) };
const addEntry = new Function(
  "window", "parseQuickAddSection", "sectionHeaderRegex",
  `return async function(dateStr, timeStr, content, isTask, tags = [], endTimeStr = ""){ ${addInner} };`
)(fakeWindow, parseQuickAddSection, sectionHeaderRegex);

function makeService(text, setting, hasFile = true) {
  const file = { path: "SpiralNotes/2026/Daily/11/2026-11-09.md", _text: text };
  const created = [];
  const svc = {
    settings: { quickAddSection: setting, periodicNotesFolder: "SpiralNotes" },
    fileCache: new Map([[file.path, 1]]),
    dailyNoteIndex: new Map(),
    findDailyNoteFile: () => (hasFile ? file : null),
    app: { vault: {
      read: async () => file._text,
      modify: async (_f, t) => { file._text = t; },
      adapter: { exists: async () => true },
      createFolder: async () => {},
      create: async (p, t) => { created.push({ p, t }); return { path: p }; }
    } },
    file, created
  };
  return svc;
}
const add = async (svc) => addEntry.call(svc, "2026-11-09", "09:00", "写周报", false, [], "");

{
  const svc = makeService("# 2026-11-09\n\n### 随手记\n- 08:00 旧记录\n", "### 随手记");
  await add(svc);
  const lines = svc.file._text.split("\n");
  ok("新条目插在配置标题正下方", lines[3] === "- 09:00 写周报");
  ok("原有内容顺序不变", lines[4] === "- 08:00 旧记录");
  ok("不重复创建同名标题", (svc.file._text.match(/随手记/g) || []).length === 1);
  ok("沿用日记里已有的三级层级", svc.file._text.includes("### 随手记"));
}
{
  const svc = makeService("# 2026-11-09\n\n### 灵感闪念\n", "## 灵感闪念");
  await add(svc);
  ok("配置层级与已有不同时沿用已有标题",
    svc.file._text.includes("### 灵感闪念\n- 09:00 写周报") &&
    !/^## 灵感闪念$/m.test(svc.file._text));
}
{
  const svc = makeService("# 2026-11-09\n\n## 工作\n- 08:00 站会\n", "### 随手记");
  await add(svc);
  ok("没有同名标题时按配置层级追加一节", svc.file._text.includes("\n\n### 随手记\n- 09:00 写周报\n"));
  ok("追加时不破坏原有内容", svc.file._text.startsWith("# 2026-11-09\n\n## 工作\n- 08:00 站会"));
}
{
  const svc = makeService("# 2026-11-09\n\n- 参考 ## 灵感闪念 这一节\n", "## 灵感闪念");
  await add(svc);
  ok("正文里同名文字不算标题（不误插）",
    svc.file._text.includes("\n\n## 灵感闪念\n- 09:00 写周报\n") &&
    svc.file._text.indexOf("- 参考 ## 灵感闪念 这一节") < svc.file._text.indexOf("\n\n## 灵感闪念\n"));
}
{
  const svc = makeService("# 2026-11-09\n\n## 工作\n", "灵感闪念");
  await add(svc);
  ok("旧配置纯文本仍按二级建节", svc.file._text.includes("\n\n## 灵感闪念\n- 09:00 写周报\n"));
}
{
  const svc = makeService("", "### 随手记", false);
  await add(svc);
  ok("新建日记用配置的三级标题", svc.created.length === 1 && svc.created[0].t.includes("\n\n### 随手记\n- 09:00 写周报\n"));
  ok("新建日记仍以日期为一级标题", svc.created[0].t.startsWith("# 2026-11-09\n"));
  ok("新建日记写回索引", svc.dailyNoteIndex.has("2026-11-09"));
}
{
  const svc = makeService("# 2026-11-09\n\n### 随手记\n", "### 随手记");
  await add(svc);
  ok("写入后清掉文件缓存", svc.fileCache.size === 0);
}

// ---------- 4) 调用点静态断言 ----------
console.log("--- 写死层级已清除 / 四处调用点 ---");
ok("main.ts 不再有写死的 `## ${...quickAddSection}`", !/## \$\{[^}]*quickAddSection/.test(src));
ok("默认设置带二级前缀", /quickAddSection:\s*"## 灵感闪念"/.test(src));
ok("addEntry 走纯函数且按标题名逐行匹配",
  /const section = parseQuickAddSection\(this\.settings\.quickAddSection\)/.test(src) &&
  /const headerIdx = lines\.findIndex\(l => headerRe\.test\(l\)\)/.test(src));
ok("addEntry 不再用 includes/replace 子串匹配标题", !/fileText\.includes\(sectionHeader\)/.test(src));
const openStart = src.indexOf("async openDailyNoteForDate(");
const openBody = openStart < 0 ? "" : src.slice(openStart, src.indexOf("\n  }\n", openStart) + 5);
ok("日期标题新建日记用配置 heading", /parseQuickAddSection\(this\.plugin\.settings\.quickAddSection\)\.heading/.test(openBody));
ok("parseDailyFile 用配置标题判定随手记区",
  /const memoTitle = parseQuickAddSection\(this\.settings\.quickAddSection\)\.title/.test(src) &&
  /currentSection === memoTitle/.test(src));
ok("设置项说明写明可指定层级", /或「### 随手记」/.test(src) && /setPlaceholder\("## 灵感闪念"\)/.test(src));
ok("设置项空值回退默认配置", /val\.trim\(\) \|\| DEFAULT_SETTINGS\.quickAddSection/.test(src));
ok("产物包含两个纯函数", bundle.includes("function parseQuickAddSection(") && bundle.includes("function sectionHeaderRegex("));
ok("产物不再写死二级标题", !/## \$\{[^}]*quickAddSection/.test(bundle));

console.log(`\n===== ${pass} passed, ${fails.length} failed =====`);
if (fails.length) { fails.forEach((f) => console.log("  - " + f)); process.exit(1); }
