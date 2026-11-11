// 本地 Blinko 导出 md 来源测试（DEC-027）
//
// 这块代码之前住在 main.ts 的 DailyNoteService.parseBlinkoFile 里，
// **一个测试都没有覆盖** —— 迁走时把 parseBlinkoFile 删掉，598 项测试
// 一个都没红，就是证据。所以这套测试要同时补两件事：
//   ① 解析规则（frontmatter / 标签 / 文字截断 / 区间）
//   ② 一个历史误解的反证：注释说「本地 Blinko 导出历史上一直可拖拽改时间」，
//      实际三个写方法全部返回 false、零次写入。这条断言就是防止有人
//      照着旧注释又给它绑一个拖拽把手。
//
// 用法：node scripts/dev/test-blinko-local.mjs
// 前置：npm run build:core && npm run build:sources
import fs from "fs";
import path from "path";
import { PROJECT_ROOT, loadCore, loadSources, loadPluginSource } from "./lib/elastic.mjs";

let pass = 0;
const fails = [];
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name + (extra ? `  [${extra}]` : "")); console.log(`  ✗ ${name}${extra ? `  [${extra}]` : ""}`); }
};

await loadCore();
const sources = await loadSources();
const { BlinkoLocalSource, MemoryFileStore, DailySource, defaultBlinkoPathMatch } = sources;

const NOTE = "Blinko/Notes/2026/11/abc.md";

/** 一份真实导出文件的样子 */
const EXPORT = [
  "---",
  "date: 2026-11-09T14:30:00",
  "tags: [work, '会议']",
  "---",
  "今天开了个会，讨论了三件事 #projectx",
  ""
].join("\n");

function mk(files = {}) {
  const store = new MemoryFileStore(files);
  const src = new BlinkoLocalSource({ store });
  return { store, src };
}

function fileOf(p) {
  return { path: p, basename: p.split("/").pop().replace(/\.md$/, ""), mtime: 1 };
}

// ---------- 1) 契约元数据 ----------
console.log("--- 契约 ---");
{
  const { src } = mk();
  ok("id 沿用 blinko（改 id 会让既有条目配色/徽标失效）", src.id === "blinko");
  ok("label 是 Blinko", src.label === "Blinko");
  ok("readonly 为 false（条目有本地文件，openEntry 靠它决定能不能跳转）",
    src.readonly === false);
  ok("不实现任何写方法（时间在 frontmatter 里，没有行首锚点）",
    src.updateEntryTime === undefined &&
    src.updateEntryPointTime === undefined &&
    src.moveEntryToDate === undefined &&
    src.toggleTask === undefined &&
    src.createEntry === undefined);
}

// ---------- 2) 解析 ----------
console.log("--- 解析 ---");
{
  const e = mk().src.parseContent(fileOf(NOTE), EXPORT);
  ok("能解析出条目", !!e);
  ok("日期取自 frontmatter 的 date", e.dateStr === "2026-11-09");
  ok("导出文件带秒 → timeStr 保留秒（原实现即如此）", e.timeStr === "14:30:00", e.timeStr);
  ok("起始秒 = 14:30", e.startSeconds === 14 * 3600 + 30 * 60, String(e.startSeconds));
  ok("结束秒 = 起始 + 30 分钟（导出没给区间，固定半小时）",
    e.endSeconds === 14 * 3600 + 60 * 60);
  ok("startMinutes / endMinutes 同步", e.startMinutes === 14 * 60 + 30 && e.endMinutes === 15 * 60);
  ok("hasTime 为真（会画时间线）", e.hasTime === true);
  ok("isRange 为 false → isPointEntry 判定为点线，不是块", e.isRange === false);
  ok("tint 显式为 null", e.tint === null);
  ok("isTask / isCompleted 恒假（导出文件不是任务清单）",
    e.isTask === false && e.isCompleted === false);
  ok("source 为 blinko", e.source === "blinko");
  ok("id 带 #blinko 后缀，避免与日记条目撞 id", e.id === `${NOTE}#blinko`);
  ok("subItems 为空数组", Array.isArray(e.subItems) && e.subItems.length === 0);
}

// ---------- 3) 标签与正文 ----------
console.log("--- 标签与正文 ---");
{
  const e = mk().src.parseContent(fileOf(NOTE), EXPORT);
  ok("frontmatter 的 tags 数组被读出来", e.tags.includes("work") && e.tags.includes("会议"),
    JSON.stringify(e.tags));
  ok("标签两侧引号被剥掉", !e.tags.some(t => /['"]/.test(t)), JSON.stringify(e.tags));
  ok("正文里的 #tag 也被收进 tags", e.tags.includes("projectx"), JSON.stringify(e.tags));
  ok("正文里的 #tag 被从文字里剥掉", !e.rawLine.includes("#projectx"), e.rawLine);
  ok("正文不含 frontmatter", !e.rawLine.includes("---") && !e.rawLine.includes("date:"), e.rawLine);
  ok("text 取正文前 80 字", e.text.startsWith("今天开了个会"), e.text);

  // 正文为空时，退回标签文字，再退回固定文案
  const empty = mk().src.parseContent(fileOf(NOTE),
    "---\ndate: 2026-11-09T08:00:00\ntags: [a]\n---\n#b\n");
  ok("正文只有标签时，文字用标签拼", empty.text === "#a #b", empty.text);
  const bare = mk().src.parseContent(fileOf(NOTE), "---\ndate: 2026-11-09T08:00:00\n---\n");
  ok("正文与标签都空时用固定文案", bare.text === "Blinko 闪念", bare.text);
}

// ---------- 4) 各种"不合格"文件 ----------
console.log("--- 容错 ---");
{
  const src = mk().src;
  ok("没有 frontmatter → null", src.parseContent(fileOf(NOTE), "就是一段普通文字\n") === null);
  ok("frontmatter 里没有 date → null",
    src.parseContent(fileOf(NOTE), "---\ntags: [a]\n---\n正文\n") === null);
  ok("date 不是 ISO 时间 → null",
    src.parseContent(fileOf(NOTE), "---\ndate: 2026-11-09\n---\n正文\n") === null);
  const withSec = src.parseContent(fileOf(NOTE), "---\ndate: 2026-11-09T09:05:07\n---\nx\n");
  ok("带秒时 timeStr 保留秒", withSec.timeStr === "09:05:07", withSec.timeStr);
  ok("带秒时起始秒含秒", withSec.startSeconds === 9 * 3600 + 5 * 60 + 7);
  // 少数导出配置会去掉秒，此时不该硬补 :00
  const noSec = src.parseContent(fileOf(NOTE), "---\ndate: 2026-11-09T09:05\n---\nx\n");
  ok("无秒时 timeStr 为 HH:mm", noSec.timeStr === "09:05", noSec.timeStr);
  ok("无秒时秒数按 0 计", noSec.startSeconds === 9 * 3600 + 5 * 60);
  const late = src.parseContent(fileOf(NOTE), "---\ndate: 2026-11-09T23:50:00\n---\nx\n");
  ok("结束秒夹取到当天 86400（不跨到次日）", late.endSeconds === 86400, String(late.endSeconds));
}

// ---------- 5) 路径匹配 ----------
console.log("--- 路径匹配 ---");
{
  ok("Blinko/Notes 前缀命中", defaultBlinkoPathMatch("Blinko/Notes/a.md"));
  ok("路径里含 Blinko 也命中（兼容自定义导出目录）",
    defaultBlinkoPathMatch("Inbox/Blinko/2026/a.md"));
  ok("普通日记不命中", !defaultBlinkoPathMatch("SpiralNotes/2026/Daily/11/2026-11-11.md"));
  const custom = new BlinkoLocalSource({ store: new MemoryFileStore(), matchPath: p => p.startsWith("My/") });
  ok("matchPath 可替换（其他宿主可能有不同目录约定）", custom.matchPath("My/x.md") === true);
}

// ---------- 6) listEntries ----------
console.log("--- 列条目 ---");
{
  const OTHER = "Blinko/Notes/2026/11/def.md";
  const PLAIN = "SpiralNotes/2026/Daily/11/2026-11-09.md";
  const { src } = mk({
    [NOTE]: EXPORT,
    [OTHER]: "---\ndate: 2026-11-20T10:00:00\n---\n范围外\n",
    [PLAIN]: "---\ndate: 2026-11-09T10:00:00\n---\n不是 blinko\n"
  });
  const inRange = await src.listEntries("2026-11-09", "2026-11-09");
  ok("区间含首尾：当天命中 1 条", inRange.length === 1, String(inRange.length));
  ok("区间外的导出文件被挡掉", !inRange.some(e => e.dateStr === "2026-11-20"));
  ok("路径不含 Blinko 的文件不参与", !inRange.some(e => e.filePath === PLAIN));
  const wide = await src.listEntries("2026-11-09", "2026-11-20");
  ok("放宽区间能拿到两条", wide.length === 2, String(wide.length));
  const none = await src.listEntries("2026-10-01", "2026-10-02");
  ok("区间内没有文件时返回空数组", Array.isArray(none) && none.length === 0);
}

// ---------- 7) mtime 缓存 ----------
console.log("--- 缓存 ---");
{
  const { store, src } = mk({ [NOTE]: EXPORT });
  await src.listEntries("2026-11-09", "2026-11-09");
  const readsAfterFirst = store.stats.reads;
  await src.listEntries("2026-11-09", "2026-11-09");
  ok("mtime 未变时不再读文件", store.stats.reads === readsAfterFirst,
    `${readsAfterFirst} -> ${store.stats.reads}`);

  // 改文件 → mtime 变 → 必须重读
  await store.write(NOTE, EXPORT.replace("14:30:00", "16:45:00"));
  const after = await src.listEntries("2026-11-09", "2026-11-09");
  ok("mtime 变化后缓存失效、读到新时间", after[0].startSeconds === 16 * 3600 + 45 * 60,
    after[0].timeStr);
  ok("缓存按文件路径各自独立", src.fileCache.size === 1, String(src.fileCache.size));
  src.fileCache.clear();
  const beforeClear = store.stats.reads;
  await src.listEntries("2026-11-09", "2026-11-09");
  ok("清缓存后会重新读文件", store.stats.reads > beforeClear);
}

// ---------- 8) 反证：历史注释说的"可拖拽改时间"不成立 ----------
// 这一组是**故意**去撞旧说法：如果哪天真给 Blinko 导出实现了回写，
// 这里会红，那正是提醒改注释、补契约、更新 UI 的时候。
console.log("--- 反证：不可回写 ---");
{
  const { store, src } = mk({ [NOTE]: EXPORT });
  const [entry] = await src.listEntries("2026-11-09", "2026-11-09");

  // 拿真实的可写来源去改它 —— 这是用户拖拽时实际走的路径
  const daily = new DailySource({ store, settings: {} });
  const r1 = await daily.updateEntryTime(entry, 15 * 3600, 16 * 3600);
  const r2 = await daily.updateEntryPointTime(entry, 15 * 3600);
  const r3 = await daily.moveEntryToDate(entry, "2026-11-10", 15 * 3600, 16 * 3600);
  ok("updateEntryTime 返回 false（lineNum=1 指向 frontmatter 的 ---）", r1 === false);
  ok("updateEntryPointTime 返回 false", r2 === false);
  ok("moveEntryToDate 返回 false（source 不是 daily）", r3 === false);
  ok("三次调用零次写入 —— 旧注释「历史上一直可拖」不成立",
    store.stats.writes === 0 && store.stats.creates === 0,
    `writes=${store.stats.writes} creates=${store.stats.creates}`);
  ok("文件内容一个字节都没变", store.peek(NOTE) === EXPORT);
  ok("条目仍画成时间点线（点线的拖拽入口本就挡掉非 daily 来源）",
    entry.isRange === false && entry.hasTime === true);
}

// ---------- 9) 分层：main.ts 不再自己解析 Blinko ----------
console.log("--- 分层 ---");
{
  // 与 test-hosts 同一套剥注释规则：注释里提到旧方法名不该判成"还在用"
  const stripNonCode = (s) => s.split("\n")
    .map(line => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) return "";
      return line.replace(/\s+\/\/.*$/, "");
    })
    .join("\n");

  const mainCode = stripNonCode(loadPluginSource("main.ts"));
  ok("main.ts 里不再有 parseBlinkoFile", !/parseBlinkoFile/.test(mainCode));
  ok("main.ts 里不再直接 getMarkdownFiles", !/getMarkdownFiles\(/.test(mainCode));
  ok("main.ts 里不再有 frontmatter 解析（fmMatch）", !/fmMatch/.test(mainCode));
  ok("service 委托给 blinkoLocal", /this\.blinkoLocal\.listEntries\(/.test(mainCode));

  const srcCode = fs.readFileSync(path.join(PROJECT_ROOT, "sources", "blinko-local.ts"), "utf8");
  ok("blinko-local.ts 不依赖宿主", !/from ["']obsidian["']/.test(srcCode) &&
    !/\bwindow\./.test(srcCode) && !/\bdocument\./.test(srcCode) && !/\bvault\./.test(srcCode));
}

// ---------- 汇总 ----------
console.log(`\n===== ${pass} passed, ${fails.length} failed =====`);
if (fails.length) {
  console.log("失败项：");
  fails.forEach(f => console.log("  - " + f));
  process.exitCode = 1;
}
