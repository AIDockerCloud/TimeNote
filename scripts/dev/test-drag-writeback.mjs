// 拖拽相关纯逻辑测试：snapSeconds 吸附 + updateEntryTime 行内时间前缀回写
//
// 用法：node scripts/dev/test-drag-writeback.mjs
// 直接从 main.ts 抽真实实现（这两个函数是模块级 / 类方法，产物里不外露），
// 用一个假 vault 验证「只改目标行、其余原样保留」这条红线。
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, loadCore, loadSources, loadPluginSources } from "./lib/elastic.mjs";

const src = loadPluginSources();
const { DailySource, MemoryFileStore } = await loadSources();

let pass = 0;
const fails = [];
const ok = (name, cond, extra) => {
  if (cond) pass++;
  else fails.push(name + (extra ? `  [${extra}]` : ""));
};

// ---------- 1) snapSeconds（core 的真实实现 + 真实常量值） ----------
// 平台无关的纯函数直接用 core 的实现（DEC-023）
const {
  snapSeconds,
  blockEdgeHit,
  DRAG_SNAP_MINUTES
} = await loadCore();
const snapMin = Number(DRAG_SNAP_MINUTES) || 15;

// ---------- 2) updateEntryTime（真实源码 + 假 vault） ----------
// updateEntryTime 已随 DEC-026 迁进 sources/daily.ts，成为可 import 的真实现。
// 不再按源码位置切片 —— 那套做法在方法搬家后必然错位（本轮就是这么炸的）。
const FILE = "SpiralNotes/2026/Daily/11/2026-11-08.md";

function buildRunner(text) {
  const store = new MemoryFileStore({ [FILE]: text });
  const daily = new DailySource({
    store,
    settings: { periodicNotesFolder: "SpiralNotes" }
  });
  const file = {
    path: FILE,
    // 保留 _text 这个读法，断言不必改写：每次 getter 都读存储里的最新内容
    get _text() { return store.peek(FILE); }
  };
  return {
    file,
    run: (entry, startSec, endSec) => daily.updateEntryTime(entry, startSec, endSec)
  };
}

// ---------- 3) 无把手边缘命中区（DEC-014，用 core 的真实实现） ----------
// blockEdgeHit 已从上面 await loadCore() 一并取到

// ---------- 4) 断言 ----------
console.log(`--- snapSeconds（吸附粒度 ${snapMin} 分钟）---`);
const H = (h) => h * 3600;
ok("14:07 → 14:00", snapSeconds(14 * 3600 + 7 * 60) === 14 * 3600);
ok("14:08 → 14:15", snapSeconds(14 * 3600 + 8 * 60) === 14 * 3600 + 900);
ok("负向 -8min → -15min", snapSeconds(-8 * 60) === -900);
ok("0 → 0", snapSeconds(0) === 0);

console.log("--- updateEntryTime ---");

// 1. 已有范围行
{
  const { file, run } = buildRunner("- 14:00-15:30 写周报 #工作\n");
  const changed = await run({ filePath: file.path, lineNum: 1 }, 14 * 3600 + 900, 16 * 3600);
  ok("范围行改写", changed === true && file._text === "- 14:15-16:00 写周报 #工作\n", JSON.stringify(file._text));
}

// 2. 单时间 + 时长标签 → 范围，并去掉冲突标签
{
  const { file, run } = buildRunner("- 09:00 站会 30m\n");
  await run({ filePath: file.path, lineNum: 1 }, 9 * 3600 + 1800, 10 * 3600 + 1800);
  ok("单时间+时长标签 → 范围并去掉标签", file._text === "- 09:30-10:30 站会\n", JSON.stringify(file._text));
}

// 3. 任务行保留复选框
{
  const { file, run } = buildRunner("- [ ] 10:00-11:00 任务 #a\n");
  await run({ filePath: file.path, lineNum: 1 }, 10 * 3600, 11 * 3600 + 1800);
  ok("任务行保留 [ ]", file._text === "- [ ] 10:00-11:30 任务 #a\n", JSON.stringify(file._text));
}

// 4. 带秒的时间前缀
{
  const { file, run } = buildRunner("- 14:00:00-15:00:00 带秒\n");
  await run({ filePath: file.path, lineNum: 1 }, 14 * 3600, 15 * 3600);
  ok("带秒前缀可改写", file._text === "- 14:00-15:00 带秒\n", JSON.stringify(file._text));
}

// 5. 无时间行 → false 且不写文件
{
  const { file, run } = buildRunner("- 纯文本记录\n");
  const changed = await run({ filePath: file.path, lineNum: 1 }, 3600, 7200);
  ok("无时间行返回 false 且不改写", changed === false && file._text === "- 纯文本记录\n");
}

// 6. 行号越界
{
  const { file, run } = buildRunner("- 14:00 x\n");
  const changed = await run({ filePath: file.path, lineNum: 99 }, 3600, 7200);
  ok("行号越界返回 false", changed === false);
}

// 7. 多行文件只改目标行
{
  const multi = "# 2026-11-08\n\n- 09:00 早会 30m\n- 14:00-15:00 写代码\n- 16:00 复盘\n";
  const { file, run } = buildRunner(multi);
  await run({ filePath: file.path, lineNum: 4 }, 14 * 3600 + 1800, 16 * 3600);
  const expect = "# 2026-11-08\n\n- 09:00 早会 30m\n- 14:30-16:00 写代码\n- 16:00 复盘\n";
  ok("多行只改目标行", file._text === expect, JSON.stringify(file._text.split("\n")[3]));
}

// 8. 全天边界 24:00
{
  const { file, run } = buildRunner("- 23:00-23:30 收尾\n");
  await run({ filePath: file.path, lineNum: 1 }, 23 * 3600, 86400);
  ok("结束时间可为 24:00", file._text === "- 23:00-24:00 收尾\n", JSON.stringify(file._text));
}

// 9. 缩进与非 `-` 列表符号原样保留
{
  const { file, run } = buildRunner("\t* 08:00-09:00 缩进星号\n");
  await run({ filePath: file.path, lineNum: 1 }, H(8), H(9) + 1800);
  ok("缩进与 * 符号保留", file._text === "\t* 08:00-09:30 缩进星号\n", JSON.stringify(file._text));
}

console.log("--- 无把手边缘命中区（DEC-014）---");
[16, 20, 24, 30, 44, 60, 200].forEach((h) => {
  const edge = blockEdgeHit(h);
  ok(
    `${h}px 块同时有上沿 / 中部 / 下沿`,
    edge >= 2 && edge <= 9 && h - 2 * edge > 0,
    `edge=${edge.toFixed(2)}`
  );
});
ok("大块命中区封顶 9px", blockEdgeHit(200) === 9);
ok("极矮块命中区下限 2px", blockEdgeHit(1) === 2);
ok(
  "源码里没有把手 DOM 与 < 30px 退化分支",
  !src.includes("timenote-block-edge") && !src.includes("rect.height < 30")
);

console.log(`\n===== ${pass} passed, ${fails.length} failed =====`);
if (fails.length) {
  console.log("FAILED:");
  fails.forEach((f) => console.log("  ✗", f));
  process.exit(1);
}
