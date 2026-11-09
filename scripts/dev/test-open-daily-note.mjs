// 日期标题点击跳转日记的防回归静态断言（DEC-017）。
//
// 用法：node scripts/dev/test-open-daily-note.mjs
// 只查源码 / 产物 / 样式，不依赖 Obsidian 运行时。
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "./lib/elastic.mjs";

const ts = fs.readFileSync(path.join(PROJECT_ROOT, "main.ts"), "utf8");
const js = fs.readFileSync(path.join(PROJECT_ROOT, "main.js"), "utf8");
const css = fs.readFileSync(path.join(PROJECT_ROOT, "styles.css"), "utf8");
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");

let pass = 0;
const fails = [];
const ok = (name, cond) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name); console.log(`  ✗ ${name}`); }
};

// 只取 openDailyNoteForDate 方法体（到下一个同级方法前）
const start = ts.indexOf("async openDailyNoteForDate(");
const body = start < 0 ? "" : ts.slice(start, ts.indexOf("\n  }\n", start) + 5);

console.log("--- 统一入口：打开 / 创建当天日记 ---");
ok("openDailyNoteForDate 方法存在", start >= 0 && body.length > 200);
ok("点击前强制重建日记索引（避开 5 秒缓存）", /dailyNoteIndex\.clear\(\)/.test(body));
ok("先查已有日记", /findDailyNoteFile\(dateStr\)/.test(body));
ok("不存在时逐级创建 YYYY/Daily/MM 目录",
  /\/Daily\//.test(body) && /format\("YYYY"\)/.test(body) &&
  /format\("MM"\)/.test(body) && /createFolder\(curr\)/.test(body));
ok("不存在时创建与 QuickAdd 同结构的日记",
  /vault\.create\(notePath/.test(body) && /quickAddSection/.test(body) &&
  /normalizePath/.test(body));
ok("创建后写回索引并给出 Notice",
  /dailyNoteIndex\.set\(dateStr, file\)/.test(body) && /new Notice\(/.test(body));
ok("无论是否已存在，最终都打开日记文件",
  /getLeaf\(false\)/.test(body) && /openFile\(file/.test(body));

console.log("--- 所有带 ALL DAY 行的周期视图都接到统一入口 ---");
ok("日 / 3 天 / 周共用 renderTimeGrid",
  /renderDayView\(container\) \{[\s\S]{0,120}renderTimeGrid\(container, \[/.test(ts) &&
  /render3DayView\(container\) \{[\s\S]{0,260}renderTimeGrid\(container, days\)/.test(ts) &&
  /renderWeekView\(container\) \{[\s\S]{0,260}renderTimeGrid\(container, days\)/.test(ts));
ok("renderTimeGrid 同时覆盖块布局与紧凑流",
  /renderCompactGrid\(container, days\)/.test(ts) && /renderBlockGrid\(container, days\)/.test(ts));
ok("两张表的日期标题都调用 openDailyNoteForDate（恰好 2 处）",
  (ts.match(/titleRow\.onclick = \(\) => this\.openDailyNoteForDate\(dateStr\)/g) || []).length === 2);
ok("两张表的日期标题都有打开日记的 tooltip（恰好 2 处）",
  (ts.match(/titleRow\.setAttribute\("title", `打开 \$\{dateStr\} 日记`\)/g) || []).length === 2);
ok("日期标题不再退化成「切到日视图」",
  (ts.match(/currentViewMode = "day"/g) || []).length === 3 &&
  [...ts.matchAll(/currentViewMode = "day"/g)].every(m =>
    !/titleRow/.test(ts.slice(Math.max(0, m.index - 160), m.index))));
ok("时间线视图的「打开日记 ↗」也走统一入口",
  /openDailyLink\.onclick = \(\) => this\.openDailyNoteForDate\(dateStr\)/.test(ts));
ok("时间线不再出现「文件不存在时点击无反应」",
  !/openDailyLink\.onclick[\s\S]{0,160}if \(file\)/.test(ts));

console.log("--- 产物与样式 ---");
ok("构建产物含统一入口", (js.match(/openDailyNoteForDate/g) || []).length >= 3);
ok("日期标题保持可点击光标",
  /\.timenote-day-title-row \{[\s\S]*?cursor: pointer/.test(cssCode));

console.log(`\n===== ${pass} passed, ${fails.length} failed =====`);
if (fails.length) process.exit(1);
