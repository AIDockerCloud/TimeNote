// 多来源聚合的数据源层测试（DEC-023）
//
// 覆盖：NoteSource 契约 / memos 与 Blinko 的条目映射 / 聚合器的容错与排序 /
//        只读来源确实拒绝写操作。
//
// 用法：node scripts/dev/test-sources.mjs
// 前置：npm run build:core
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, loadCore, loadSources, loadPluginSources } from "./lib/elastic.mjs";

let pass = 0;
const fails = [];
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name + (extra ? `  [${extra}]` : "")); console.log(`  ✗ ${name}${extra ? `  [${extra}]` : ""}`); }
};

// ---------- 契约静态检查 ----------
console.log("--- NoteSource 契约 ---");
const typesSrc = fs.readFileSync(path.join(PROJECT_ROOT, "sources", "types.ts"), "utf8");
ok("定义了 NoteSource 接口", /export interface NoteSource\b/.test(typesSrc));
ok("NoteSource 有 id / label / readonly", /readonly id: string/.test(typesSrc) &&
  /readonly label: string/.test(typesSrc) && /readonly readonly: boolean/.test(typesSrc));
ok("NoteSource 有 listEntries", /listEntries\(/.test(typesSrc));
ok("只读源有统一的写操作拒绝实现",
  /READONLY_REJECT/.test(typesSrc) &&
  /updateEntryTime: async \(\) => false/.test(typesSrc) &&
  /moveEntryToDate: async \(\) => false/.test(typesSrc) &&
  /createEntry: async \(\) => false/.test(typesSrc));

console.log("--- memos / Blinko 数据源 ---");
const memosSrc = fs.readFileSync(path.join(PROJECT_ROOT, "sources", "memos.ts"), "utf8");
const blinkoSrc = fs.readFileSync(path.join(PROJECT_ROOT, "sources", "blinko.ts"), "utf8");
ok("memos 走 REST /api/v1/memos", /\/api\/v1\/memos/.test(memosSrc));
ok("memos 用 Bearer 认证", /Bearer/.test(memosSrc));
ok("memos 声明为只读", /readonly readonly = true/.test(memosSrc));
ok("memos 写操作一律拒绝", /READONLY_REJECT/.test(memosSrc));
ok("Blinko 走 POST /api/v1/note/list", /\/api\/v1\/note\/list/.test(blinkoSrc));
ok("Blinko 用 Bearer 认证", /Bearer/.test(blinkoSrc));
ok("Blinko 声明为只读", /readonly readonly = true/.test(blinkoSrc));
ok("Blinko 写操作一律拒绝", /READONLY_REJECT/.test(blinkoSrc));
ok("两个数据源都不产出 memos 插件（无 apps/memos）",
  !fs.existsSync(path.join(PROJECT_ROOT, "apps", "memos")));

console.log("--- 时间点语义：聚合来源的 createdAt 即时刻 ---");
const { parseLine } = await loadCore();
// memos/Blinko 正文里的 HH:mm-HH:mm 应被 core 识别为区间（画块）
const ranged = parseLine("09:30-10:30 写方案", 1, "2026-11-09", "memos:1", true);
ok("正文里的区间被识别为 isRange（画成时间块）",
  !!ranged && ranged.hasTime && ranged.isRange);
ok("区间起止被正确解析",
  !!ranged && ranged.startSeconds === 9 * 3600 + 30 * 60 && ranged.endSeconds === 10 * 3600 + 30 * 60);
// 只有时刻 → 时间点（画线，DEC-018）
const point = parseLine("09:30 记一下", 1, "2026-11-09", "memos:1", true);
ok("正文里的单时刻被识别为非 isRange（画成时间点线）",
  !!point && point.hasTime && !point.isRange);

console.log("--- 聚合器：容错与排序 ---");
const aggSrc = fs.readFileSync(path.join(PROJECT_ROOT, "sources", "aggregate.ts"), "utf8");
ok("聚合器逐来源 try/catch（单源失败不中断）",
  /try\s*\{/.test(aggSrc) && /catch\s*\(/.test(aggSrc));
ok("聚合器记录各来源错误", /errors\[/.test(aggSrc));
ok("聚合器按开始时间排序", /startSeconds/.test(aggSrc) && /sort\(/.test(aggSrc));

// 动态验证聚合器的排序与容错行为
const { AggregateSource, MemosSource, BlinkoSource } = await loadSources();
ok("sources 层可加载（供宿主使用）", !!AggregateSource);

// ---------- 聚合器行为验证（真跑，不是静态断言） ----------
console.log("--- 聚合器行为 ---");

/** 造一个假来源 */
const fakeSource = (id, entries, shouldThrow) => ({
  id,
  label: id,
  readonly: true,
  listEntries: async () => {
    if (shouldThrow) throw new Error(`${id} 挂了`);
    return entries;
  }
});

const mkEntry = (source, startSeconds, text, lineNum = 1) => ({
  id: `${source}#${lineNum}`,
  filePath: `${source}`,
  dateStr: "2026-11-09",
  lineNum,
  rawLine: text,
  isTask: false,
  isCompleted: false,
  hasTime: true,
  isRange: false,
  startSeconds,
  endSeconds: startSeconds + 1800,
  startMinutes: Math.floor(startSeconds / 60),
  endMinutes: Math.floor((startSeconds + 1800) / 60),
  timeStr: "00:00",
  text,
  tags: [],
  tint: null,
  subItems: [],
  source
});

{
  const agg = new AggregateSource([
    fakeSource("daily", [mkEntry("daily", 3600 * 10, "晚一点的", 1)]),
    fakeSource("blinko", [mkEntry("blinko", 3600 * 8, "早一点的", 1)]),
    fakeSource("memos", [mkEntry("memos", 3600 * 9, "中间的", 1)])
  ]);
  const res = await agg.listEntries("2026-11-09", "2026-11-09");
  ok("三个来源的条目都被合并", res.entries.length === 3, String(res.entries.length));
  ok("合并后按开始时间排序",
    res.entries.map(e => e.startSeconds).join(",") === "28800,32400,36000",
    res.entries.map(e => e.text).join(","));
  ok("按来源分别计数", res.bySource.daily === 1 && res.bySource.blinko === 1 && res.bySource.memos === 1,
    JSON.stringify(res.bySource));
  ok("无错误时 errors 为空", Object.keys(res.errors).length === 0);
}

{
  // 单源失败不能影响其他来源
  const agg = new AggregateSource([
    fakeSource("daily", [mkEntry("daily", 3600, "本地的", 1)]),
    fakeSource("memos", [], true)
  ]);
  const res = await agg.listEntries("2026-11-09", "2026-11-09");
  ok("一个来源抛错不影响其他来源的条目", res.entries.length === 1, String(res.entries.length));
  ok("失败来源的错误被记录下来", !!res.errors.memos, JSON.stringify(res.errors));
  ok("失败来源计数为 0", res.bySource.memos === 0);
}

console.log("--- 只读来源确实拒绝写操作 ---");
{
  const memos = new MemosSource({ baseUrl: "https://x.example.com", token: "t" });
  const blinko = new BlinkoSource({ baseUrl: "https://y.example.com", apiKey: "k" });
  ok("memos 标记为只读", memos.readonly === true);
  ok("Blinko 标记为只读", blinko.readonly === true);
  ok("memos 的 updateEntryTime 返回 false",
    (await memos.updateEntryTime(mkEntry("memos", 0, "x"), 0, 60)) === false);
  ok("memos 的 moveEntryToDate 返回 false",
    (await memos.moveEntryToDate(mkEntry("memos", 0, "x"), "2026-11-10", 0, 60)) === false);
  ok("memos 的 createEntry 返回 false",
    (await memos.createEntry("2026-11-09", "10:00", "x", false)) === false);
  ok("Blinko 的 toggleTask 返回 false",
    (await blinko.toggleTask(mkEntry("blinko", 0, "x"))) === false);
  ok("memos 未配置时 listEntries 返回空数组（不抛错）",
    (await new MemosSource({}).listEntries("2026-11-09", "2026-11-09")).length === 0);
  ok("Blinko 未配置时 listEntries 返回空数组（不抛错）",
    (await new BlinkoSource({}).listEntries("2026-11-09", "2026-11-09")).length === 0);
}

// ---------- 来源元数据（DEC-023）----------
// 渲染层不再认识具体来源，只问这几个函数；一旦它们的行为漂移，
// 就会出现「memos 记录显示成灵感闪念」「远程记录能拖拽」这类静默错。
console.log("--- 来源元数据 ---");
{
  const { isExternalSource, sourceBadge, sourceCssClass, sourceLabel } = await loadSources();

  ok("daily 不算外部来源", isExternalSource("daily") === false);
  ok("缺省 source 按 daily 处理（兼容没有 source 字段的历史数据）",
    isExternalSource(undefined) === false && sourceLabel(undefined) === "灵感闪念");
  ok("memos 是外部来源", isExternalSource("memos") === true);
  ok("blinko 是外部来源", isExternalSource("blinko") === true);
  ok("徽标带来源名，且 memos 与 blinko 不撞",
    sourceBadge("memos").includes("Memos") && sourceBadge("memos") !== sourceBadge("blinko"));
  ok("memos 的类名含 is-external 与 is-memos", sourceCssClass("memos") === "is-external is-memos");
  ok("blinko 仍输出 is-blinko（老样式继续命中）", sourceCssClass("blinko").includes("is-blinko"));
  ok("daily 不输出来源类（DOM 与旧版逐字一致）",
    sourceCssClass("daily") === "" && sourceCssClass(undefined) === "");
  ok("未登记来源有兜底，不会渲染成 undefined", sourceLabel("unknown-src") === "unknown-src");
  ok("来源 id 里的引号 / 尖括号被清掉，不会注入到 class",
    (() => {
      const cls = sourceCssClass('a" onload="x<b>');
      // 只校验来源段（去掉合法的 "is-external " 前缀与分隔空格）
      const idPart = cls.replace(/^is-external\s*/, "");
      return !/[<>"']/.test(idPart);
    })());
}

// ---------- 聚合条目必须带 readonly（DEC-023）----------
// 漏了这个标记，用户就能拖远程记录：拖动时有反馈、松手后弹回，
// 而且 updateEntryTime 会去 vault 里找一个不存在的文件。
console.log("--- 聚合条目只读标记 ---");
{
  const { MemosSource, BlinkoSource } = await loadSources();
  const realFetch = globalThis.fetch;
  const iso = new Date(2026, 10, 11, 9, 30, 0).toISOString();

  try {
    // 假 fetch：每个端点只在第一页返回数据，后续页返回空 —— 否则 Blinko 的
    // 「翻到早于区间起点才停」逻辑会把同一页重复拉满 MAX_PAGES 次。
    // 两个端点各用独立计数器，互不消耗。
    const pages = { memos: 0, blinko: 0 };
    globalThis.fetch = async (url) => {
      const isMemos = String(url).includes("/api/v1/memos");
      pages[isMemos ? "memos" : "blinko"]++;
      const firstPage = (isMemos ? pages.memos : pages.blinko) === 1;
      return {
        ok: true,
        json: async () => {
          if (isMemos) {
            return firstPage
              ? { memos: [{ name: "memos/1", createTime: iso, content: "写周报 #工作", tags: [] }] }
              : { memos: [] };
          }
          return firstPage ? [{ id: 7, content: "Blinko 想法", createdAt: iso, tags: [] }] : [];
        }
      };
    };

    const m = await new MemosSource({ baseUrl: "https://a.example.com", token: "t" })
      .listEntries("2026-11-11", "2026-11-11");
    ok("memos 拉到 1 条", m.length === 1, String(m.length));
    ok("memos 条目 source=memos", m[0] && m[0].source === "memos");
    ok("memos 条目带 readonly=true（禁止拖拽回写）", m[0] && m[0].readonly === true);

    const b = await new BlinkoSource({ baseUrl: "https://b.example.com", apiKey: "k" })
      .listEntries("2026-11-11", "2026-11-11");
    ok("Blinko 拉到 1 条", b.length === 1, String(b.length));
    // 关键：本地 Blinko 导出文件与 API 聚合条目 source 相同、可写性相反，
    // 只有 readonly 能区分二者。
    ok("Blinko 聚合条目 source=blinko 且 readonly=true", b[0] && b[0].source === "blinko" && b[0].readonly === true);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ---------- Obsidian 宿主接线（DEC-023）----------
// 上一阶段的真实教训：sources/ 全部建好了，但 main.ts 一行都没引用 ——
// 架构看着完成、功能其实没生效。这里守住「接线不能断」。
console.log("--- Obsidian 宿主接线 ---");
{
  const mainSrc = loadPluginSources();
  ok("main.ts 从 sources 导入聚合能力", /from "\.\/sources\/index"/.test(mainSrc));
  ok("getEntriesForRange 真的调用了远程聚合", /await this\.collectRemoteEntries\(/.test(mainSrc));
  ok("只在「启用 + 地址 + 令牌」齐全时挂载来源（避免刷 401）",
    /memosEnabled && s\.memosBaseUrl && s\.memosToken/.test(mainSrc) &&
    /blinkoApiEnabled && s\.blinkoBaseUrl && s\.blinkoApiKey/.test(mainSrc));
  ok("远程条目只装进可见日期桶（区间外丢弃）",
    /const bucket = results\.get\(entry\.dateStr\);\s*\n\s*if \(bucket\) bucket\.push\(entry\);/.test(mainSrc));
  ok("设置页有 memos / Blinko API 的地址与令牌项",
    /memosBaseUrl/.test(mainSrc) && /memosToken/.test(mainSrc) &&
    /blinkoBaseUrl/.test(mainSrc) && /blinkoApiKey/.test(mainSrc));
  ok("渲染层不再硬编码 Blinko（改用来源元数据）",
    !/const isBlinko =/.test(mainSrc) && /sourceCssClass\(/.test(mainSrc));
  ok("只读条目被挡在跨天之外", /canMoveDay = !entry\.readonly/.test(mainSrc));
  ok("只读条目被挡在块拖拽之外", /if \(entry\.readonly\) \{[\s\S]{0,120}?block\.addClass\("is-readonly"\)/.test(mainSrc));
  ok("远程拉取有 TTL 缓存（重渲染不重复打接口）",
    /REMOTE_CACHE_TTL/.test(mainSrc) && /remoteCache\.get\(cacheKey\)/.test(mainSrc));
  ok("改设置会作废远程缓存（不留 60 秒的旧数据）",
    /clearRemoteCache\(\)/.test(mainSrc) && /dailyNoteService\.clearRemoteCache\(\)/.test(mainSrc));
}

console.log("--- core 与 sources 的边界 ---");const coreFiles = fs.readdirSync(path.join(PROJECT_ROOT, "core")).filter(f => f.endsWith(".ts"));
const sourceFiles = fs.readdirSync(path.join(PROJECT_ROOT, "sources")).filter(f => f.endsWith(".ts"));
ok("core/ 里没有 obsidian 依赖", (() => {
  for (const f of coreFiles) {
    const s = fs.readFileSync(path.join(PROJECT_ROOT, "core", f), "utf8");
    if (/from\s+["']obsidian["']/.test(s)) return false;
  }
  return true;
})());
ok("core/ 里没有 DOM / 全局依赖", (() => {
  for (const f of coreFiles) {
    const s = fs.readFileSync(path.join(PROJECT_ROOT, "core", f), "utf8");
    if (/\bdocument\.|\bwindow\./.test(s)) return false;
  }
  return true;
})());
ok("sources/ 里没有 obsidian 依赖（宿主无关）", (() => {
  for (const f of sourceFiles) {
    const s = fs.readFileSync(path.join(PROJECT_ROOT, "sources", f), "utf8");
    if (/from\s+["']obsidian["']/.test(s)) return false;
  }
  return true;
})());
ok("sources/ 的目录就是约定的 types/daily/blinko/memos 布局",
  sourceFiles.includes("types.ts") && sourceFiles.includes("blinko.ts") && sourceFiles.includes("memos.ts"));

console.log(`\n===== ${pass} passed, ${fails.length} failed =====`);
if (fails.length) {
  console.log(fails.map(f => "  - " + f).join("\n"));
  process.exit(1);
}
