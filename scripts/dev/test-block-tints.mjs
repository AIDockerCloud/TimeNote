// 按天自动配色测试（DEC-016）：直接用 core 的真实实现，验证
// 「同一天的块颜色互不相同 / 新块拿到未用色 / 显式指定优先 / 重渲染稳定」。
//
// 用法：node scripts/dev/test-block-tints.mjs
// 前置：npm run build:core
import { loadCore } from "./lib/elastic.mjs";

const { assignDayTints, BLOCK_TINTS, resolveTint, tintEntryKey, parseLine } = await loadCore();

let pass = 0;
const fails = [];
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name + (extra ? `  [${extra}]` : "")); console.log(`  ✗ ${name}${extra ? `  [${extra}]` : ""}`); }
};

const mk = (n, prefix = "day", tint = null) =>
  Array.from({ length: n }, (_, i) => ({ key: `${prefix}/note.md#L${i + 1}`, tint }));
const allDistinct = (arr) => new Set(arr).size === arr.length;

console.log("--- 调色板 ---");
ok("8 个官方扩展色，明暗主题自动适配",
  BLOCK_TINTS.length === 8 &&
  ["purple", "blue", "cyan", "green", "yellow", "orange", "red", "pink"]
    .every(n => BLOCK_TINTS.includes(n)));
ok("每个色值都是带兜底的 var(--color-*) 形式",
  assignDayTints(mk(8)).every(c => /^var\(--color-[a-z]+, #[0-9a-f]{6}\)$/.test(c)));
ok("中文别名解析正确", resolveTint("绿").css.startsWith("var(--color-green") &&
  resolveTint("紫").css.startsWith("var(--color-purple"));
ok("自定义颜色值原样保留", resolveTint("#7c5cff").css === "#7c5cff" &&
  resolveTint("hsl(200 70% 50%)").css === "hsl(200 70% 50%)");
ok("未知名字也有确定色、不报错", /^var\(--color-/.test(resolveTint("foobar").css));

console.log("--- 同天互不相同 ---");
const three = assignDayTints(mk(3));
ok("3 个块颜色两两不同", allDistinct(three), three.join(","));
const eight = assignDayTints(mk(8));
ok("8 个块恰好用满 8 色", allDistinct(eight) && new Set(eight).size === 8);
ok("重渲染稳定：同输入两次结果一致",
  JSON.stringify(assignDayTints(mk(5))) === JSON.stringify(assignDayTints(mk(5))));
ok("顺序稳定：打乱输入前先排序则由调用方保证，纯函数本身可复现",
  JSON.stringify(assignDayTints(mk(4, "x"))) === JSON.stringify(assignDayTints(mk(4, "x"))));

console.log("--- 新块拿到当天未用色 ---");
const before = mk(4, "2026-11-09").map((it, i) => ({ ...it, start: i }));
// 模拟新块按开始时间插到中间（键不同 = 新记录）
const after = [
  before[0],
  { key: "2026-11-09/note.md#L99", tint: null },
  ...before.slice(1)
];
const afterTints = assignDayTints(after);
ok("插入新块后，当天 5 个块仍两两不同", allDistinct(afterTints), afterTints.join(","));
// 追加到末尾时，稳定排序保证旧块分配完全不变，新块只能拿剩下的颜色
const appended = [...before, { key: "2026-11-09/note.md#L99", tint: null }];
const appendedTints = assignDayTints(appended);
const beforeTints = assignDayTints(before);
ok("只追加新块时，原有块颜色全部不变",
  appendedTints.slice(0, 4).join() === beforeTints.join());
ok("新块拿到当天 4 个旧块都没用过的颜色",
  !beforeTints.includes(appendedTints[4]), appendedTints.join(","));

console.log("--- 显式指定优先 ---");
const specified = [
  { key: "a#L1", tint: "blue" },
  { key: "a#L2", tint: null },
  { key: "a#L3", tint: null }
];
const specTints = assignDayTints(specified);
ok("#color/blue 指定的块保留蓝色", specTints[0].startsWith("var(--color-blue"));
ok("其它自动分配的块避开已指定的颜色",
  !specTints.slice(1).some(c => c.startsWith("var(--color-blue")) && allDistinct(specTints));
ok("中文 #色/绿 生效", assignDayTints([{ key: "a", tint: "绿" }])[0].startsWith("var(--color-green"));
ok("自定义 hex 生效且不占调色板位次",
  assignDayTints([{ key: "a", tint: "#123456" }, { key: "b" }])[0] === "#123456");

console.log("--- 跨天独立与超过调色板容量 ---");
const dayA = assignDayTints(mk(5, "2026-11-09"));
const dayB = assignDayTints(mk(5, "2026-11-10"));
ok("两天各自内部颜色互不相同", allDistinct(dayA) && allDistinct(dayB));
ok("不同天的分配各自独立（都从完整调色板里挑）", new Set(dayB).size === 5);
const many = assignDayTints(mk(14));
ok("超过 8 个块时至少有 8 种颜色", new Set(many).size >= 8);
ok("超过 8 个块时相邻不撞色",
  many.every((c, i) => i === 0 || c !== many[i - 1]));

console.log("--- parseLine 的指定通道 ---");
const colored = parseLine("- 09:00-10:00 开会 #color/blue #工作", 3, "2026-11-09", "note.md");
ok("#color/blue 解析为 tint 且不进 tags",
  colored && colored.tint === "blue" && colored.tags.length === 1 && colored.tags[0] === "工作");
const alias = parseLine("- 14:00 写周报 #色/绿", 4, "2026-11-09", "note.md");
ok("#色/绿 中文别名解析正确", alias && alias.tint === "绿");
const hex = parseLine("- 16:00 复盘 #color/#7c5cff #工作", 6, "2026-11-09", "note.md");
ok("#color/#7c5cff 自定义色值解析正确且不残留标签",
  hex && hex.tint === "#7c5cff" && hex.tags.length === 1 && hex.tags[0] === "工作");
const plain = parseLine("- 20:00 读书 #阅读 #生活", 5, "2026-11-09", "note.md");
ok("普通标签不受影响、tint 为空",
  plain && plain.tint === null && plain.tags.length === 2);
ok("tintEntryKey 有 id 用 id、无 id 有稳定回退",
  tintEntryKey({ id: "x#L1" }, "d") === "x#L1" &&
  tintEntryKey({ lineNum: 2, text: "abc" }, "d") === "d#2#abc");

console.log(`\n===== ${pass} passed, ${fails.length} failed =====`);
if (fails.length) process.exit(1);
