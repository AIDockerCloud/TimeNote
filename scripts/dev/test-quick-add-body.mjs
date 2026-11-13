// DEC-033 回归：快速记录「标题 / 正文」拆分 + 正文写成 Tab 缩进子项
//
// 用户反馈：创建框里按回车换行，第二段文字会另起一行、没有时间前缀，
// 于是被解析成 ALL DAY 任务。修法是标题必填且只占一行，正文选填、可多行，
// 落盘时每行前面加 Tab，成为标题记录的缩进子项。
//
// 这套测试用真的 DailySource + MemoryFileStore 压「写进去长什么样」和
// 「读回来是不是还挂在父条目上」，而不是只做源码静态断言。
//
// 用法：node scripts/dev/test-quick-add-body.mjs
// 前置：npm run build:core && npm run build:sources
import { loadCore, loadSources } from "./lib/elastic.mjs";

let pass = 0;
const fails = [];
const ok = (name, cond, extra) => {
  if (cond) pass++;
  else fails.push(name + (extra ? `  [${extra}]` : ""));
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const core = await loadCore();
const sources = await loadSources();
const { DailySource, MemoryFileStore } = sources;
const { normalizeQuickAddBodyLines, buildQuickAddLines } = core;

const FOLDER = "SpiralNotes";
const SETTINGS = { periodicNotesFolder: FOLDER, quickAddSection: "## 灵感闪念" };
const DAY = "2026-11-13";
const DAY_PATH = `${FOLDER}/2026/Daily/11/${DAY}.md`;
const HEAD = ["# 2026-11-13", "", "## 灵感闪念", ""].join("\n");

function mk() {
  const store = new MemoryFileStore({ [DAY_PATH]: HEAD });
  return { store, src: new DailySource({ store, settings: { ...SETTINGS } }) };
}
const textOf = (store) => store.read(DAY_PATH);
const entriesOf = (src) => src.listEntries(DAY, DAY);

// ---------- 1) 正文切分纯函数 ----------
{
  ok("多行正文按行切开",
    eq(normalizeQuickAddBodyLines("第一行\n第二行"), ["第一行", "第二行"]));
  ok("空行必须丢掉（留一个 \\t 空行会清空 currentParent）",
    eq(normalizeQuickAddBodyLines("一\n\n   \n二\n"), ["一", "二"]));
  ok("CRLF 与行尾空白被归一化，行首缩进保留",
    eq(normalizeQuickAddBodyLines("  一  \r\n\t二  "), ["  一", "\t二"]));
  ok("null / 空正文返回空数组",
    normalizeQuickAddBodyLines(null).length === 0 &&
    normalizeQuickAddBodyLines("   ").length === 0);
  ok("buildQuickAddLines 给每行正文加一个 Tab",
    buildQuickAddLines("- 09:00 A", ["一", "二"]) === "- 09:00 A\n\t一\n\t二");
  ok("无正文时只产出主行",
    buildQuickAddLines("- 09:00 A", []) === "- 09:00 A");
}

// ---------- 2) 落盘格式 ----------
{
  const { store, src } = mk();
  await src.addEntry(DAY, "14:00", "写周报", false, ["工作"], "15:30", null,
    "先列大纲\n补充数据\n\n收尾");
  const text = await textOf(store);
  ok("主行：范围 + 标题 + 标签", text.includes("- 14:00-15:30 写周报 #工作"));
  ok("正文每行前面恰好一个 Tab",
    text.includes("\n\t先列大纲\n\t补充数据\n\t收尾"));
  ok("空行没有变成孤立的 \\t 行", !/^\t$/m.test(text));
  ok("没有出现无时间前缀的顶层行",
    !text.split("\n").some(l => /^[^\s#-]/.test(l) && l.trim().length > 0));
  ok("任务复选框与标签共存",
    (await (async () => {
      const s = mk();
      await s.src.addEntry(DAY, "08:00", "晨检", true, ["运维"], "", null, "检查日志\n检查证书");
      return (await textOf(s.store)).includes("- [ ] 08:00 晨检 #运维\n\t检查日志\n\t检查证书");
    })()));
}

// ---------- 3) 读回来：正文必须是子项，不是 ALL DAY ----------
{
  const { src } = mk();
  await src.addEntry(DAY, "14:00", "写周报", false, ["工作"], "15:30", null,
    "先列大纲\n补充数据\n收尾");
  const list = await entriesOf(src);
  ok("只解析出 1 条顶层记录（正文没有变成 ALL DAY）", list.length === 1, String(list.length));
  ok("父条目时间范围正确",
    list[0] && list[0].startSeconds === 14 * 3600 &&
    list[0].endSeconds === 15 * 3600 + 30 * 60);
  ok("3 行正文都挂在父条目的 subItems 上",
    list[0] && eq(list[0].subItems, ["先列大纲", "补充数据", "收尾"]),
    JSON.stringify(list[0] && list[0].subItems));
  ok("没有无时间的 ALL DAY 条目",
    list.every(e => e.hasTime === true));
}

// ---------- 4) 缩进优先：正文里的标题 / 围栏 / 注释不切断父子关系 ----------
{
  const { src } = mk();
  await src.addEntry(DAY, "09:00", "晨会", false, [], "", null,
    "## 小标题\n```\n代码片段\n%% 备注");
  const list = await entriesOf(src);
  ok("正文里的 ## / ``` / %% 都被当成子项",
    list.length === 1 && list[0].subItems.length === 4,
    `list=${list.length} subs=${JSON.stringify(list[0] && list[0].subItems)}`);
  ok("父条目仍是时间点记录",
    list[0] && list[0].hasTime === true && list[0].startSeconds === 9 * 3600);
}

// ---------- 5) 兼容旧调用方：content 里带换行也不产生 ALL DAY ----------
{
  const { store, src } = mk();
  await src.addEntry(DAY, "10:00", "标题行\n正文一\n正文二", false, [], "11:00");
  const text = await textOf(store);
  ok("多行 content 的第一行当标题", text.includes("- 10:00-11:00 标题行"));
  ok("其余行并进 Tab 子项", text.includes("\n\t正文一\n\t正文二"));
  const list = await entriesOf(src);
  ok("仍只有 1 条顶层记录", list.length === 1, String(list.length));
  ok("子项内容正确", eq(list[0].subItems, ["正文一", "正文二"]));
}

// ---------- 6) content 残留正文 + 独立正文参数会按顺序合并 ----------
{
  const { store, src } = mk();
  await src.addEntry(DAY, "10:00", "标题\n旧正文", false, [], "11:00", null, "新正文");
  const text = await textOf(store);
  ok("两路正文合并且顺序稳定", text.includes("\n\t旧正文\n\t新正文"));
}

// ---------- 7) 空正文 / rawLines 通道不受影响 ----------
{
  const { store, src } = mk();
  await src.addEntry(DAY, "16:00", "纯标题", false);
  const emptyText = await textOf(store);
  ok("空正文时只写主行，不产生 Tab 行",
    emptyText.includes("- 16:00 纯标题") && !emptyText.includes("\t"));

  const other = mk();
  await other.src.addEntry(DAY, "12:00", "", false, [], "",
    ["- 12:00 搬来的", "\t子项"], "不该出现");
  const rawText = await textOf(other.store);
  ok("DEC-022 的 rawLines 原样插入，正文参数被忽略",
    rawText.includes("- 12:00 搬来的\n\t子项") && !rawText.includes("不该出现"));
}

// ---------- 汇总 ----------
console.log(`\n===== ${pass} passed, ${fails.length} failed =====`);
if (fails.length) {
  console.log("失败项：");
  fails.forEach(f => console.log("  - " + f));
  process.exitCode = 1;
}
