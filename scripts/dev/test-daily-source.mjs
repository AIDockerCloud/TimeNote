// 本地日记数据源测试（DEC-026）
//
// 这是**第一个可写的 NoteSource**，所以这套测试的重点不是「能列出条目」，
// 而是把契约的可写半边真正压一遍：改时间 / 改时刻 / 跨天搬行 / 勾选 / 新建。
// 在此之前 memos 与 blinko 两个来源全是 READONLY_REJECT，写路径零覆盖。
//
// 用法：node scripts/dev/test-daily-source.mjs
// 前置：npm run build:core && npm run build:sources
import { loadCore, loadSources } from "./lib/elastic.mjs";

let pass = 0;
const fails = [];
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name + (extra ? `  [${extra}]` : "")); console.log(`  ✗ ${name}${extra ? `  [${extra}]` : ""}`); }
};

const core = await loadCore();
const sources = await loadSources();
const { DailySource, MemoryFileStore, addDays } = sources;

const FOLDER = "SpiralNotes";
const SETTINGS = { periodicNotesFolder: FOLDER, quickAddSection: "## 灵感闪念" };
const DAY = "2026-11-11";
const DAY_PATH = `${FOLDER}/2026/Daily/11/${DAY}.md`;

const SAMPLE = [
  "# 2026-11-11",
  "",
  "## 灵感闪念",
  "- 09:00 晨会要点",
  "- [ ] 10:00-11:00 写文档",
  "  子项一",
  "  子项二",
  "",
  "## 任务计划",
  "- [x] 14:00 回复邮件",
  ""
].join("\n");

/** 新建一个装着样例日记的 source */
function mkSource(extraFiles = {}) {
  const store = new MemoryFileStore({ [DAY_PATH]: SAMPLE, ...extraFiles });
  const src = new DailySource({ store, settings: { ...SETTINGS } });
  return { store, src };
}

// ---------- 1) 契约元数据 ----------
console.log("--- DailySource 契约 ---");
{
  const { src } = mkSource();
  ok("id 为 daily", src.id === "daily");
  ok("声明为可写来源（readonly = false）", src.readonly === false);
  ok("实现了 listEntries", typeof src.listEntries === "function");
  const writes = ["updateEntryTime", "updateEntryPointTime", "moveEntryToDate", "toggleTask", "createEntry"];
  const missing = writes.filter(m => typeof src[m] !== "function");
  ok("实现了全部 5 个写方法", missing.length === 0, missing.join(","));
  ok("写方法不是 READONLY_REJECT（真的是自己的实现）",
    writes.every(m => src[m] !== sources.READONLY_REJECT[m]));
}

// ---------- 2) 读取与解析 ----------
console.log("--- 读取 ---");
{
  const { src } = mkSource();
  const list = await src.listEntries(DAY, DAY);
  ok("单日解析出 3 条顶层记录", list.length === 3, String(list.length));
  ok("全部归属当天", list.every(e => e.dateStr === DAY));
  ok("来源标记为 daily", list.every(e => e.source === "daily"));
  ok("记录带真实行号", list[0].lineNum === 4, String(list[0].lineNum));
  ok("带时间记录有时刻", list[0].hasTime === true && list[0].startSeconds === 9 * 3600);
  ok("任务行被识别为任务", list[1].isTask === true && list[1].isCompleted === false);
  ok("范围行被识别为区间", list[1].isRange === true &&
    list[1].startSeconds === 10 * 3600 && list[1].endSeconds === 11 * 3600);
  ok("缩进子项挂在父条目上（不单独成条）",
    list[1].subItems.length === 2 && list[1].subItems[0] === "子项一");
  ok("已完成任务标记正确", list[2].isTask === true && list[2].isCompleted === true);
  ok("正文里的时间前缀不进文本", !list[1].text.includes("10:00"), list[1].text);
}

// ---------- 3) 区间语义 ----------
console.log("--- 区间 ---");
{
  const today = "## 今天\n- 08:00 甲\n";
  const third = "## 今天\n- 08:00 丙\n";
  const store = new MemoryFileStore({
    [`${FOLDER}/2026/Daily/11/2026-11-10.md`]: "# 2026-11-10\n\n" + today,
    [`${FOLDER}/2026/Daily/11/2026-11-12.md`]: "# 2026-11-12\n\n" + third
  });
  const src = new DailySource({ store, settings: { ...SETTINGS } });

  const span = await src.listEntries("2026-11-10", "2026-11-12");
  const dates = [...new Set(span.map(e => e.dateStr))].sort();
  ok("区间含首尾两天", dates.includes("2026-11-10") && dates.includes("2026-11-12"), dates.join(","));
  ok("区间中间没有日记的日子不报错", span.length === 2, String(span.length));

  const narrow = await src.listEntries("2026-11-11", "2026-11-11");
  ok("区间外的日期不进结果", narrow.every(e => e.dateStr === "2026-11-11"));
  ok("完全没有日记的区间返回空数组", (await src.listEntries("2026-01-01", "2026-01-03")).length === 0);
}

// ---------- 4) 索引优先级 ----------
console.log("--- 索引 ---");
{
  const outside = "# 2026-11-11\n\n## 灵感闪念\n- 07:00 目录外的同名日记\n";
  const { src } = mkSource({ "随手记/2026-11-11.md": outside });
  await src.buildIndexIfNeeded();
  const hit = await src.findDailyNoteFile(DAY);
  ok("同名日记优先取周期笔记目录下的那份", hit && hit.path === DAY_PATH, hit && hit.path);

  const store2 = new MemoryFileStore({ "随手记/2026-11-11.md": outside });
  const src2 = new DailySource({ store: store2, settings: { ...SETTINGS } });
  const fallback = await src2.findDailyNoteFile(DAY);
  ok("目录里没有时退回目录外的同名文件",
    fallback && fallback.path === "随手记/2026-11-11.md", fallback && fallback.path);

  const { src: src3 } = mkSource({ [`${FOLDER}/2026/Daily/11/2026-11-12x.md`]: "x" });
  ok("非日期文件名不进索引", (await src3.findDailyNoteFile("2026-11-12x")) === null);
}

// ---------- 5) 新建（createEntry / addEntry） ----------
console.log("--- ensureDailyNote ---");
{
  const { store, src } = mkSource();
  const newDay = "2027-03-05";
  const note = await src.ensureDailyNote(newDay);
  ok("返回新建文件的元数据", note && note.path === `${FOLDER}/2027/Daily/03/${newDay}.md`, note && note.path);
  ok("索引里立刻能查到（避免建完还找不到）",
    (await src.findDailyNoteFile(newDay))?.path === note.path);
  ok("空日记只含标题与快速记录标题",
    store.peek(note.path) === `# ${newDay}\n\n## 灵感闪念\n`, JSON.stringify(store.peek(note.path)));
  const beforeCreates = store.stats.creates;
  const again = await src.ensureDailyNote(newDay);
  ok("已存在时不重复创建（不抛错、内容不变）",
    again.path === note.path && store.stats.creates === beforeCreates,
    `${beforeCreates} -> ${store.stats.creates}`);
}

console.log("--- 新建 ---");
{
  const { store, src } = mkSource();
  const newDay = "2026-12-01";
  const created = await src.createEntry(newDay, "15:30", "新记录", false, ["tag1"]);
  ok("createEntry 返回 true", created === true);

  const path = `${FOLDER}/2026/Daily/12/${newDay}.md`;
  const text = store.peek(path);
  ok("自动创建了日记文件（按年/月目录）", typeof text === "string");
  ok("文件带日期标题", text.startsWith(`# ${newDay}`));
  ok("文件带快速记录标题", text.includes("## 灵感闪念"));
  ok("新行含时间与正文", text.includes("- 15:30 新记录"));
  ok("新行含标签", text.includes("#tag1"));
  ok("自动建了目录层级", store.stats.folders >= 3, String(store.stats.folders));

  const tasks = await src.createEntry(newDay, "16:00", "待办", true, [], "17:00");
  const t2 = store.peek(path);
  ok("任务型记录带复选框与区间",
    tasks === true && t2.includes("- [ ] 16:00-17:00 待办"), t2.split("\n").slice(-3).join(" | "));
}

{
  // 已有日记且已有同名标题 → 插在标题下一行，不重复建标题
  const { store, src } = mkSource();
  await src.addEntry(DAY, "16:30", "插到灵感闪念下面", false);
  const text = store.peek(DAY_PATH);
  const lines = text.split("\n");
  const headerAt = lines.findIndex(l => l.trim() === "## 灵感闪念");
  ok("已有同名标题时插在它下面", lines[headerAt + 1].includes("插到灵感闪念下面"), lines[headerAt + 1]);
  ok("不重复创建标题",
    lines.filter(l => l.trim() === "## 灵感闪念").length === 1,
    String(lines.filter(l => l.trim() === "## 灵感闪念").length));
  ok("原有内容保持不变", text.includes("- 09:00 晨会要点") && text.includes("子项一"));
}

{
  // 已有日记但缺该标题 → 文末追加一节
  const plain = "# 2026-11-13\n\n随便写点\n";
  const store = new MemoryFileStore({ [`${FOLDER}/2026/Daily/11/2026-11-13.md`]: plain });
  const src = new DailySource({ store, settings: { ...SETTINGS } });
  await src.addEntry("2026-11-13", "20:00", "晚间记录", false);
  const text = store.peek(`${FOLDER}/2026/Daily/11/2026-11-13.md`);
  ok("缺标题时在文末追加一节", text.includes("## 灵感闪念") && text.includes("- 20:00 晚间记录"));
  ok("原正文仍在标题之前", text.indexOf("随便写点") < text.indexOf("## 灵感闪念"));
}

// ---------- 6) 改时间范围 ----------
console.log("--- updateEntryTime ---");
{
  const { store, src } = mkSource();
  const entries = await src.listEntries(DAY, DAY);
  const rangeEntry = entries.find(e => e.isRange);
  const done = await src.updateEntryTime(rangeEntry, 10 * 3600 + 1800, 12 * 3600);
  ok("范围行改写成功", done === true);
  const text = store.peek(DAY_PATH);
  ok("行首范围被替换", text.includes("- [ ] 10:30-12:00 写文档"), text.split("\n")[4]);
  ok("正文与缩进子项原样保留", text.includes("子项一") && text.includes("子项二"));

  const pointEntry = entries.find(e => e.source === "daily" && e.lineNum === 4);
  const p = await src.updateEntryPointTime(pointEntry, 8 * 3600 + 45 * 60);
  ok("单时间行改时刻成功", p === true);
  ok("只改了时刻，没生成结束时间", store.peek(DAY_PATH).includes("- 08:45 晨会要点"));

  const noTime = { ...rangeEntry, filePath: DAY_PATH, lineNum: 2, rawLine: "" };
  ok("无时间行拒绝改写", (await src.updateEntryTime(noTime, 3600, 7200)) === false);
  ok("行号越界拒绝改写",
    (await src.updateEntryTime({ ...rangeEntry, lineNum: 9999 }, 3600, 7200)) === false);
  ok("文件不存在拒绝改写",
    (await src.updateEntryTime({ ...rangeEntry, filePath: "不存在.md" }, 3600, 7200)) === false);
}

{
  // 行尾时长标签与新范围冲突，应被清掉
  const withDur = "# 2026-11-14\n\n## 灵感闪念\n- [ ] 10:00-11:00 写文档 30m\n";
  const store = new MemoryFileStore({ [`${FOLDER}/2026/Daily/11/2026-11-14.md`]: withDur });
  const src = new DailySource({ store, settings: { ...SETTINGS } });
  const [e] = await src.listEntries("2026-11-14", "2026-11-14");
  await src.updateEntryTime(e, 10 * 3600, 12 * 3600);
  const text = store.peek(`${FOLDER}/2026/Daily/11/2026-11-14.md`);
  ok("旧的时长标签被清除", !/30m\s*$/.test(text.trimEnd()), text.split("\n")[3]);
}

// ---------- 7) 改时刻不改块 ----------
console.log("--- updateEntryPointTime ---");
{
  const { src } = mkSource();
  const entries = await src.listEntries(DAY, DAY);
  const rangeEntry = entries.find(e => e.isRange);
  ok("范围行不允许按「点」改（不许隐式把块变点）",
    (await src.updateEntryPointTime(rangeEntry, 15 * 3600)) === false);
}

// ---------- 8) 勾选任务 ----------
console.log("--- toggleTask ---");
{
  const { store, src } = mkSource();
  const entries = await src.listEntries(DAY, DAY);
  const task = entries.find(e => e.isTask && !e.isCompleted);

  ok("勾选成功", (await src.toggleTask(task)) === true);
  ok("[ ] 变 [x]", store.peek(DAY_PATH).includes("- [x] 10:00-11:00 写文档"));
  ok("条目状态被就地更新", task.isCompleted === true);

  ok("再次勾选可取消", (await src.toggleTask(task)) === true);
  ok("[x] 变回 [ ]", store.peek(DAY_PATH).includes("- [ ] 10:00-11:00 写文档"));
  ok("取消后状态复位", task.isCompleted === false);

  const plain = entries.find(e => !e.isTask);
  ok("非任务行拒绝勾选", (await src.toggleTask(plain)) === false);
}

// ---------- 9) 跨天搬行 ----------
console.log("--- moveEntryToDate ---");
{
  const { store, src } = mkSource();
  const entries = await src.listEntries(DAY, DAY);
  const task = entries.find(e => e.isTask && !e.isCompleted);

  const moved = await src.moveEntryToDate(task, "2026-11-12", 10 * 3600, 11 * 3600);
  ok("跨天移动成功", moved === true);

  const srcText = store.peek(DAY_PATH);
  ok("源日记里那一行被删掉", !srcText.includes("写文档"), srcText);
  ok("源日记里它的子项也一起搬走", !srcText.includes("子项一"));
  ok("源日记的其它记录不受影响", srcText.includes("- 09:00 晨会要点") && srcText.includes("回复邮件"));

  const dstPath = `${FOLDER}/2026/Daily/11/2026-11-12.md`;
  const dstText = store.peek(dstPath);
  ok("目标日记被自动创建", typeof dstText === "string");
  ok("目标日记拿到完整原始行（保留复选框与缩进）",
    dstText.includes("- [ ] 10:00-11:00 写文档") && dstText.includes("  子项一"), dstText);
  ok("目标日记落在快速记录标题下", dstText.includes("## 灵感闪念"));
}

{
  const { store, src } = mkSource();
  const entries = await src.listEntries(DAY, DAY);
  const task = entries.find(e => e.isTask && !e.isCompleted);
  const before = store.peek(DAY_PATH);

  ok("同一天移动被拒绝", (await src.moveEntryToDate(task, DAY, 0, 0)) === false);
  ok("来源非 daily 被拒绝",
    (await src.moveEntryToDate({ ...task, source: "blinko" }, "2026-11-12", 0, 0)) === false);
  ok("只读条目被拒绝",
    (await src.moveEntryToDate({ ...task, readonly: true }, "2026-11-12", 0, 0)) === false);

  // 解析之后日记被外部改过：行号漂移时必须拒绝，且源文件一个字都不能动
  const drifted = { ...task, rawLine: "- [ ] 10:00-11:00 这行已经被改过了" };
  ok("原文漂移时拒绝移动", (await src.moveEntryToDate(drifted, "2026-11-12", 10 * 3600, 11 * 3600)) === false);
  ok("拒绝时源文件未被写入", store.peek(DAY_PATH) === before);
  ok("拒绝时目标文件未被创建", store.peek(`${FOLDER}/2026/Daily/11/2026-11-12.md`) === undefined);
}

// ---------- 10) 缓存 ----------
console.log("--- 缓存 ---");
{
  const { store, src } = mkSource();
  await src.listEntries(DAY, DAY);
  const readsAfterFirst = store.stats.reads;
  await src.listEntries(DAY, DAY);
  ok("同一 mtime 下不重复读文件", store.stats.reads === readsAfterFirst,
    `${readsAfterFirst} -> ${store.stats.reads}`);

  const entries = await src.listEntries(DAY, DAY);
  await src.updateEntryTime(entries.find(e => e.isRange), 10 * 3600, 12 * 3600);
  const again = await src.listEntries(DAY, DAY);
  const updated = again.find(e => e.isRange);
  ok("写回后缓存失效（重新解析到新时间）",
    updated && updated.endSeconds === 12 * 3600, updated && String(updated.endSeconds));
}

// ---------- 11) 日期算术 ----------
console.log("--- addDays ---");
{
  ok("跨月进位", addDays("2026-10-31", 1) === "2026-11-01");
  ok("跨年进位", addDays("2026-12-31", 1) === "2027-01-01");
  ok("跨年退位", addDays("2027-01-01", -1) === "2026-12-31");
  ok("闰年 2 月 29 日", addDays("2028-02-28", 1) === "2028-02-29");
  ok("平年 2 月无 29 日", addDays("2027-02-28", 1) === "2027-03-01");
  ok("±0 不变", addDays("2026-11-11", 0) === "2026-11-11");
}

// ---------- 12) 分层边界 ----------
console.log("--- 分层边界 ---");
{
  const fsMod = await import("node:fs");
  const pathMod = await import("node:path");
  const { PROJECT_ROOT } = await import("./lib/elastic.mjs");
  for (const f of ["daily.ts", "fs.ts"]) {
    const code = fsMod.readFileSync(pathMod.join(PROJECT_ROOT, "sources", f), "utf8");
    const stripped = code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const dirty = [
      ["import obsidian", /from\s+["']obsidian["']/],
      ["window", /\bwindow\b/],
      ["document", /\bdocument\b/],
      ["TFile", /\bTFile\b/],
      ["vault", /\bvault\./],
      ["ui 层", /from\s+["'][^"']*ui\//]
    ].filter(([, re]) => re.test(stripped)).map(([n]) => n);
    ok(`sources/${f} 不依赖宿主或 DOM`, dirty.length === 0, dirty.join(","));
  }
}

// ---------- 汇总 ----------
console.log(`\n===== ${pass} passed, ${fails.length} failed =====`);
if (fails.length) {
  console.log("失败项：");
  fails.forEach(f => console.log("  - " + f));
  process.exitCode = 1;
}
