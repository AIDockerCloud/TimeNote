#!/usr/bin/env node
/**
 * 思源 / Blinko 新宿主的模拟测试（DEC-032）。
 *
 * 本机没跑思源 / Blinko，所以用「假内核 transport / 假 tRPC api」把**真实实现**
 * 跑一遍：虚拟文件层 → DailySource 解析与回写 → HostNoteService 聚合 →
 * HostAdapter 契约 → 两个插件的打包产物。全部不发网络请求。
 *
 *   npm run test:platforms
 */
import esbuild from "esbuild";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = resolve(root, "scripts/dev/out");
mkdirSync(outDir, { recursive: true });
const outFile = resolve(outDir, "host-platforms.mjs");

// 一次编译出「全部新层」的 ESM，测试 import 真实实现而不是源码切片
await esbuild.build({
  stdin: {
    contents: [
      `export * as core from "./core/index.ts";`,
      `export * as sources from "./sources/index.ts";`,
      // host-service 刻意不走 sources/index.ts（避免污染 Obsidian 产物），测试直接引文件
      `export * as hostService from "./sources/host-service.ts";`,
      `export * as shared from "./apps/shared/index.ts";`,
      `export * as siyuan from "./hosts/siyuan/index.ts";`,
      `export * as blinko from "./hosts/blinko/index.ts";`
    ].join("\n"),
    resolveDir: root,
    sourcefile: "host-platforms.test-entry.ts",
    loader: "ts"
  },
  outfile: outFile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2018",
  logLevel: "silent"
});

const M = await import(`file://${outFile}?t=${Date.now()}`);
const { core, sources, hostService, shared, siyuan, blinko } = M;

/* ---------------- 断言框架 ---------------- */
let pass = 0;
const failures = [];
function ok(cond, name) {
  if (cond) pass++;
  else failures.push(name);
}
function eq(actual, expected, name) {
  ok(JSON.stringify(actual) === JSON.stringify(expected),
    `${name}（期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}）`);
}
function has(text, needle, name) { ok(String(text).includes(needle), name); }
async function group(name, fn) { await fn(); }

/* =================================================================
 * 1. 共用装配层 HostNoteService
 * ================================================================= */
const fakeDays = { start: { format: () => "2026-11-10" }, end: { format: () => "2026-11-12" } };

function makeService(initial = {}) {
  const store = new sources.MemoryFileStore(initial);
  const settings = {
    periodicNotesFolder: "SpiralNotes",
    quickAddSection: "## 灵感闪念",
    defaultAddType: "point",
    defaultDuration: 60,
    memosEnabled: false, memosBaseUrl: "", memosToken: "",
    blinkoApiEnabled: false, blinkoBaseUrl: "", blinkoApiKey: ""
  };
  return { store, settings, service: new hostService.HostNoteService({ store, settings }) };
}

await group("HostNoteService", async () => {
  const { service, store } = makeService({
    "SpiralNotes/2026/Daily/11/2026-11-11.md": "# 2026-11-11\n\n## 灵感闪念\n- 09:00 到公司\n"
  });
  ok(typeof service.getEntriesForRange === "function", "服务暴露 getEntriesForRange");
  ok(typeof service.addEntry === "function", "服务暴露 addEntry");
  eq(service.buildRemoteSources().length, 0, "三项不齐时远程来源不挂载");

  const entries = await service.getEntriesForRange(fakeDays.start, fakeDays.end);
  ok(entries instanceof Map, "返回 Map");
  eq([...entries.keys()], ["2026-11-10", "2026-11-11", "2026-11-12"], "每天建桶（含空桶）");
  eq(entries.get("2026-11-11").length, 1, "本地日记条目入桶");
  eq(entries.get("2026-11-10").length, 0, "没有日记的日子是空桶");
  eq(entries.get("2026-11-11")[0].text, "到公司", "解析出记录正文");
  eq(entries.get("2026-11-11")[0].source, "daily", "条目来源为 daily");

  await service.addEntry("2026-11-12", "14:00", "写周报", false, [], "");
  has(store.peek("SpiralNotes/2026/Daily/11/2026-11-12.md"), "- 14:00 写周报", "addEntry 写进文件");
  service.daily.fileCache.clear();
  const after = await service.getEntriesForRange(fakeDays.start, fakeDays.end);
  eq(after.get("2026-11-12").length, 1, "新建后能立刻读到");

  service.clearRemoteCache();
  ok(true, "clearRemoteCache 可调");
  service.invalidateCache();
  eq(service.daily.fileCache.size, 0, "invalidateCache 清解析缓存");
  eq(service.daily.index.size, 0, "invalidateCache 清日记索引");
});

/* 远程聚合 + 60 秒缓存（mock fetch） */
await group("远程聚合缓存", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount++;
    return {
      ok: true,
      json: async () => ({
        memos: [{ name: "memos/1", createTime: "2026-11-11T10:00:00Z", content: "来自 memos" }]
      })
    };
  };
  try {
    const { service, settings } = makeService();
    settings.memosEnabled = true;
    settings.memosBaseUrl = "https://memos.example.com";
    settings.memosToken = "token";
    eq(service.buildRemoteSources().length, 1, "三项齐全才挂载 memos");

    const first = await service.getEntriesForRange(fakeDays.start, fakeDays.end);
    eq(fetchCount, 1, "首次渲染打一次接口");
    const memo = [...first.values()].flat().find(e => e.source === "memos");
    ok(!!memo, "memos 条目进入日历");
    eq(memo.readonly, true, "远程条目只读");
    eq(memo.dateStr, "2026-11-11", "远程条目按本地日期归桶");

    await service.getEntriesForRange(fakeDays.start, fakeDays.end);
    eq(fetchCount, 1, "60 秒区间缓存挡住重复请求");

    service.clearRemoteCache();
    await service.getEntriesForRange(fakeDays.start, fakeDays.end);
    eq(fetchCount, 2, "作废缓存后重新拉取");

    settings.memosEnabled = false;
    await service.getEntriesForRange(fakeDays.start, fakeDays.end);
    eq(fetchCount, 2, "关闭来源后不再请求");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/* 单源失败不打断日历 */
await group("单源失败", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("连接超时"); };
  try {
    const { service, settings } = makeService({
      "SpiralNotes/2026/Daily/11/2026-11-11.md": "## 灵感闪念\n- 09:00 本地记录\n"
    });
    settings.memosEnabled = true;
    settings.memosBaseUrl = "https://memos.example.com";
    settings.memosToken = "token";
    const map = await service.getEntriesForRange(fakeDays.start, fakeDays.end);
    eq(map.get("2026-11-11").length, 1, "远程挂了本地记录仍显示");
    eq(map.get("2026-11-11")[0].text, "本地记录", "留下的正是本地条目");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

/* =================================================================
 * 2. 共用弹窗校验 + 行级 diff
 * ================================================================= */
await group("快速记录校验", async () => {
  const base = {
    dateStr: "2026-11-12", timeStr: "09:00", endTimeStr: "", content: "写周报",
    isTask: false, tagsStr: "工作, AI", addType: "point", defaultDuration: 60
  };
  const v = shared.validateQuickAddInput(base);
  ok(v.ok, "时间点输入合法");
  eq(v.value.tags, ["工作", "AI"], "标签按逗号切分");
  eq(v.value.endTimeStr, "", "时间点不带结束时间");
  eq(shared.addTypeLabel("point"), "时间点（只记时刻）", "类型文案与 Obsidian 一致");
  eq(shared.addTypeLabel("block"), "时间块（起止时间）", "块类型文案");

  // DEC-033：标题必填且单行，正文独立透传（两个新宿主与 Obsidian 同规则）
  eq(v.value.body, "", "空正文透传空串");
  const withBody = shared.validateQuickAddInput({ ...base, body: "第一行\n第二行" });
  eq(withBody.value.content, "写周报", "content 语义收窄成标题");
  eq(withBody.value.body, "第一行\n第二行", "多行正文原样透传给 addEntry");
  const multi = shared.validateQuickAddInput({ ...base, content: "标题\n误入的正文" });
  eq(multi.value.content, "标题", "多行 content 取第一行当标题");
  const emptyTitle = shared.validateQuickAddInput({ ...base, content: "   " });
  ok(!emptyTitle.ok && emptyTitle.message === "请输入标题！",
    "空标题被拒且提示改为标题");
  ok(!shared.validateQuickAddInput({ ...base, content: "", body: "只有正文" }).ok,
    "只有正文、没有标题时仍然拒绝");
  ok(!shared.validateQuickAddInput({ ...base, content: "" }).ok, "空内容被拒");
  ok(!shared.validateQuickAddInput({ ...base, timeStr: "09:00-10:00" }).ok, "时间点不接受范围");
  const block = shared.validateQuickAddInput({ ...base, addType: "block" });
  ok(block.ok, "时间块输入合法");
  eq(block.value.endTimeStr, "10:00", "块模式补默认时长");
  ok(!shared.validateQuickAddInput({ ...base, addType: "block", endTimeStr: "08:00" }).ok,
    "结束早于开始被拒");
  ok(!shared.validateQuickAddInput({ ...base, timeStr: "abc" }).ok, "非法时间被拒");
});

await group("行级 diff", async () => {
  const ops = shared.diffLines(
    ["## 标题", "- 09:00 A", "- 14:00 B"],
    ["## 标题", "- 10:00 A", "- 14:00 B", "- 16:00 C"],
    ["h1", "b2", "b3"]
  );
  eq(ops[0].op, "keep", "未变的行 keep");
  eq(ops[1].op, "replace", "改一行合并成 replace");
  eq(ops[1].blockId, "b2", "replace 保留原实体 id");
  eq(ops.length, 4, "新增一行产生一个 insert");
  eq(ops[3].op, "insert", "尾部新增是 insert");
  const del = shared.diffLines(["- 09:00 A", "- 14:00 B"], ["- 14:00 B"], ["n1", "n2"]);
  eq(del[0].op, "delete", "删行产生 delete");
  eq(del[0].blockId, "n1", "delete 带上实体 id");
});

/* =================================================================
 * 3. 思源：纯函数 + 假内核 + 虚拟文件层 + DailySource 串联
 * ================================================================= */
function makeFakeSiyuan() {
  const calls = [];
  const state = {
    docs: [{
      id: "doc1", content: "2026-11-12",
      hpath: "/SpiralNotes/2026/Daily/11/2026-11-12",
      updated: "20261112090000"
    }],
    blocks: [
      { id: "h1", markdown: "## 灵感闪念", type: "h", parent_id: "doc1", created: "20261112090001" },
      { id: "b2", markdown: "- 09:00 到公司 {: id=\"b2\" }", type: "i", parent_id: "doc1", created: "20261112090002" },
      { id: "b3", markdown: "- 买咖啡", type: "i", parent_id: "b2", created: "20261112090003" },
      { id: "b4", markdown: "- 14:00-15:30 评审", type: "i", parent_id: "doc1", created: "20261112090004" }
    ]
  };
  const transport = {
    async post(url, body) {
      calls.push({ url, body });
      if (url === "/api/query/sql") {
        const stmt = String(body.stmt || "");
        if (stmt.includes("attributes")) return { code: 0, data: [] };
        if (stmt.includes("type = 'd'")) return { code: 0, data: state.docs };
        return { code: 0, data: state.blocks };
      }
      if (url === "/api/notebook/lsNotebooks") {
        return { code: 0, data: { notebooks: [{ id: "box1", closed: false }] } };
      }
      if (url === "/api/filetree/createDocWithMd") return { code: 0, data: { id: "doc-new" } };
      if (url === "/api/block/updateBlock") {
        const b = state.blocks.find(x => x.id === body.id);
        if (b) b.markdown = body.data;
        return { code: 0, data: null };
      }
      if (url === "/api/block/deleteBlock") {
        state.blocks = state.blocks.filter(x => x.id !== body.id);
        return { code: 0, data: null };
      }
      return { code: 0, data: null };
    }
  };
  return { calls, state, kernel: new siyuan.SiyuanKernel(transport) };
}

await group("思源纯函数", async () => {
  eq(siyuan.dateOfPath("SpiralNotes/2026/Daily/11/2026-11-12.md"), "2026-11-12", "虚拟路径取日期");
  eq(siyuan.dateOfPath("SpiralNotes/2026/Daily/11"), null, "目录路径不是日期");
  eq(siyuan.siyuanDocPath("SpiralNotes", "2026-11-12"), "/SpiralNotes/2026/Daily/11/2026-11-12", "文档 hpath 规则");
  eq(siyuan.stripIal('- 09:00 A {: id="b2" }'), "- 09:00 A", "去掉块 IAL 尾缀");
  eq(siyuan.dateFromDailyNoteAttr("custom-dailynote-20261112"), "2026-11-12", "原生日记属性解析");
  eq(siyuan.dateFromDailyNoteAttr("other"), null, "无关属性返回 null");
  ok(siyuan.parseKernelTime("20261112090000") > 0, "内核时间可解析");
  eq(siyuan.parseKernelTime(""), 0, "空内核时间退 0");

  const conv = siyuan.blocksToLines("doc1", [
    { id: "h1", markdown: "## 灵感闪念", type: "h", parentId: "doc1" },
    { id: "b2", markdown: "- 09:00 A", type: "i", parentId: "doc1" },
    { id: "b3", markdown: "- 子项", type: "i", parentId: "b2" },
    { id: "b4", markdown: "- 14:00 B", type: "i", parentId: "doc1" }
  ]);
  eq(conv.lines, ["## 灵感闪念", "- 09:00 A", "  - 子项", "- 14:00 B"], "父子重排 + 子项缩进");
  eq(conv.ids, ["h1", "b2", "b3", "b4"], "每行都带块 id");
});

await group("思源虚拟文件层", async () => {
  const fake = makeFakeSiyuan();
  const store = new siyuan.SiyuanFileStore({ kernel: fake.kernel, folder: "SpiralNotes" });
  const path = "SpiralNotes/2026/Daily/11/2026-11-12.md";

  const files = await store.listMarkdownFiles();
  eq(files.length, 1, "列出 1 篇日记文档");
  eq(files[0].basename, "2026-11-12", "虚拟文件 basename 是日期");
  eq(files[0].path, path, "虚拟路径与 DailySource 规则一致");
  ok(await store.exists(path), "exists 找到已存在日记");
  ok(await store.exists("SpiralNotes/2026/Daily/11"), "目录路径一律放行");

  const text = await store.read(path);
  has(text, "- 09:00 到公司", "read 输出记录行");
  has(text, "## 灵感闪念", "read 输出标题行");
  has(text, "  - 买咖啡", "read 输出缩进子项");
  ok(!text.includes("{: id="), "IAL 不进虚拟文本");

  // 改一行 → 只有 updateBlock，不能删块再建块
  const before = fake.calls.length;
  const lines = text.split("\n");
  lines[1] = "- 10:00 到公司";
  await store.write(path, lines.join("\n"));
  const writes = fake.calls.slice(before);
  eq(writes.filter(c => c.url === "/api/block/updateBlock").length, 1, "改一行只调一次 updateBlock");
  eq(writes.filter(c => c.url === "/api/block/deleteBlock").length, 0, "改一行不删块");
  eq(writes.filter(c => c.url === "/api/block/insertBlock").length, 0, "改一行不建块");
  eq(writes.find(c => c.url === "/api/block/updateBlock").body.id, "b2", "更新的是原块 id");

  // 新建一天 → createDocWithMd，且去掉重复的 # 日期 H1
  await store.create("SpiralNotes/2026/Daily/11/2026-11-13.md", "# 2026-11-13\n\n## 灵感闪念\n- 08:30 晨会\n");
  const created = fake.calls.find(c => c.url === "/api/filetree/createDocWithMd");
  ok(!!created, "新建走 createDocWithMd");
  eq(created.body.path, "/SpiralNotes/2026/Daily/11/2026-11-13", "新建文档路径规则");
  ok(!String(created.body.markdown).includes("# 2026-11-13"), "模板里的重复 H1 被去掉");
  has(created.body.markdown, "- 08:30 晨会", "记录内容写进 markdown");
});

await group("思源 DailySource 串联", async () => {
  const fake = makeFakeSiyuan();
  const store = new siyuan.SiyuanFileStore({ kernel: fake.kernel, folder: "SpiralNotes" });
  const daily = new sources.DailySource({ store, settings: { quickAddSection: "## 灵感闪念" } });
  const list = await daily.listEntries("2026-11-12", "2026-11-12");
  eq(list.length, 2, "解析出两条记录");
  eq(list[0].text, "到公司", "第一条正文正确");
  eq(list[0].subItems, ["买咖啡"], "缩进块挂成子项");
  eq(list[0].lineNum, 2, "行号与虚拟文本一致");
  ok(await daily.updateEntryTime(list[0], 10 * 3600, 11 * 3600), "拖拽改时间返回成功");
  const upd = fake.calls.find(c => c.url === "/api/block/updateBlock");
  ok(!!upd, "回写走 updateBlock");
  has(upd.body.data, "10:00-11:00", "回写内容是新范围");
});

/* =================================================================
 * 4. Blinko：纯函数 + 假 tRPC + 虚拟文件层 + DailySource 串联
 * ================================================================= */
function makeFakeBlinko() {
  const calls = [];
  let nextId = 100;
  const notes = [{
    id: 1, content: "- 09:00 到公司\n买咖啡",
    createdAt: "2026-11-12T09:00:00", updatedAt: "2026-11-12T09:00:00",
    metadata: {}
  }];
  const api = {
    notes: {
      list: {
        async query(input) {
          calls.push({ op: "list", input });
          return notes.filter(n => !n.isRecycle);
        }
      },
      upsert: {
        async mutate(input) {
          calls.push({ op: "upsert", input });
          if (!input.id) {
            const n = { id: ++nextId, ...input };
            notes.push(n);
            return n;
          }
          const n = notes.find(x => Number(x.id) === Number(input.id));
          if (n) Object.assign(n, input);
          return n;
        }
      },
      trashMany: {
        async mutate(input) {
          calls.push({ op: "trash", input });
          for (const n of notes) if (input.ids.includes(Number(n.id))) n.isRecycle = true;
          return {};
        }
      }
    }
  };
  return { calls, notes, api: new blinko.BlinkoNoteApi(api), raw: api };
}

await group("Blinko 纯函数", async () => {
  eq(blinko.dateOfPath("SpiralNotes/2026/Daily/11/2026-11-12.md"), "2026-11-12", "虚拟路径取日期");
  const st = blinko.localStamp("2026-11-12T09:05:00");
  eq(st.dateStr, "2026-11-12", "本地日期换算");
  eq(st.timeStr, "09:05", "本地时刻换算");
  eq(blinko.timePrefixOf("- 09:00 A"), "09:00", "识别点时间前缀");
  eq(blinko.timePrefixOf("- 09:00-10:30 B"), "09:00-10:30", "识别范围前缀");
  eq(blinko.timePrefixOf("- 没有时间"), null, "无时间返回 null");
  const v = blinko.parseVirtualLine("- [x] 14:00 复盘 #工作");
  eq(v.timeStr, "14:00", "解析时刻");
  eq(v.isTask, true, "解析任务标记");
  eq(v.isCompleted, true, "解析完成状态");
  eq(v.body, "复盘 #工作", "解析正文与标签");
  eq(blinko.buildNoteContent("- 10:00 写周报"), "- 10:00 写周报", "虚拟行转 note 正文");
  eq(blinko.timestampFor("2026-11-13", "14:30-15:30").getHours(), 14, "范围时间取开始时刻");
  eq(blinko.noteDate({ id: 9, createdAt: "2026-11-12T09:00:00", metadata: { timenote: { date: "2026-11-13" } } }),
    "2026-11-13", "metadata 日期优先于 createdAt");
  const lines = blinko.noteToLines({ id: 2, content: "随手记\n第二行", createdAt: "2026-11-12T10:00:00" }, "2026-11-12");
  eq(lines, ["- 10:00 随手记", "  第二行"], "无前缀 note 补时间 + 后续行缩进");
  eq(blinko.noteToLines({ id: 3, content: "- 09:00 已有前缀", createdAt: "2026-11-12T10:00:00" }, "2026-11-12"),
    ["- 09:00 已有前缀"], "已有前缀的 note 原样输出");
});

await group("Blinko 虚拟文件层", async () => {
  const fake = makeFakeBlinko();
  const store = new blinko.BlinkoNoteStore({ api: fake.api, folder: "SpiralNotes" });
  const path = "SpiralNotes/2026/Daily/11/2026-11-12.md";

  const files = await store.listMarkdownFiles();
  eq(files.length, 1, "列出 1 个日期桶");
  eq(files[0].basename, "2026-11-12", "按 createdAt 归到正确日期");
  ok(fake.calls[0].op === "list", "列表走 notes.list.query");
  ok(!!fake.calls[0].input.startDate && !!fake.calls[0].input.endDate, "列表带服务端日期过滤");
  ok(await store.exists(path), "exists 找到日期桶");

  const text = await store.read(path);
  eq(text, "- 09:00 到公司\n  买咖啡", "read 生成虚拟 md");
  eq(store.getNoteIdAt(path, 2), "1", "子项行向上归属到 note id");

  // 改时间 → upsert 且 metadata 同步
  fake.calls.length = 0;
  await store.write(path, "- 10:00 到公司\n  买咖啡");
  const upserts = fake.calls.filter(c => c.op === "upsert");
  eq(upserts.length, 1, "改一行只写一条 note");
  eq(upserts[0].input.id, 1, "更新的是原 note id");
  eq(upserts[0].input.content, "- 10:00 到公司", "正文时间前缀同步");
  eq(upserts[0].input.metadata.timenote, { date: "2026-11-12", time: "10:00" }, "metadata 记录日期与时刻");
  eq(fake.calls.filter(c => c.op === "trash").length, 0, "改时间不删 note");

  // 新建一天 → 标题行不建 note
  fake.calls.length = 0;
  await store.create("SpiralNotes/2026/Daily/11/2026-11-13.md", "# 2026-11-13\n\n## 灵感闪念\n- 14:00 新记录\n");
  const creates = fake.calls.filter(c => c.op === "upsert");
  eq(creates.length, 1, "标题行不建 note，只建 1 条记录");
  ok(!("id" in creates[0].input), "新建 note 不带 id");
  eq(creates[0].input.metadata.timenote.date, "2026-11-13", "新建 note 记目标日期");
  ok(creates[0].input.createdAt instanceof Date, "createdAt 传 Date 对象（superjson）");

  // 删空 → 进回收站
  fake.calls.length = 0;
  await store.write(path, "");
  const trash = fake.calls.find(c => c.op === "trash");
  ok(!!trash, "删除走 trashMany");
  eq(trash.input.ids, [1], "只回收被删的那条 note");
});

await group("Blinko DailySource 串联", async () => {
  const fake = makeFakeBlinko();
  const store = new blinko.BlinkoNoteStore({ api: fake.api, folder: "SpiralNotes" });
  const daily = new sources.DailySource({ store, settings: { quickAddSection: "## 灵感闪念" } });
  const list = await daily.listEntries("2026-11-12", "2026-11-12");
  eq(list.length, 1, "解析出一条记录");
  eq(list[0].text, "到公司", "正文正确");
  eq(list[0].subItems, ["买咖啡"], "后续行挂成子项");
  ok(await daily.updateEntryPointTime(list[0], 11 * 3600), "点线拖动回写成功");
  const up = fake.calls.filter(c => c.op === "upsert").pop();
  eq(up.input.content, "- 11:00 到公司", "回写后仍是单时间点，没有变成范围");
  eq(up.input.metadata.timenote.time, "11:00", "metadata 时刻同步");
});

/* =================================================================
 * 5. HostAdapter 契约
 * ================================================================= */
await group("HostAdapter 契约", async () => {
  const { service, settings } = makeService();
  const notices = [];
  let saves = 0;
  let opened = 0;
  let quickAdds = 0;
  let lastHooks = null;
  let unsubbed = false;
  const glue = {
    settings, service,
    notice: m => notices.push(m),
    saveSettings: async () => { saves++; },
    openEntry: async () => { opened++; },
    openDailyNote: async () => {},
    onExternalChange: () => () => { unsubbed = true; },
    openQuickAdd: (_d, _s, _t, _e, _ty, hooks) => { quickAdds++; lastHooks = hooks; },
    openSubItems: () => {}
  };
  const adapter = shared.createSharedHostAdapter(glue);
  const methods = ["saveSettings", "notice", "setIcon", "openQuickAdd", "openSubItems",
    "openEntry", "openDailyNote", "onExternalChange", "getEntriesForRange", "invalidateCache",
    "toggleTask", "updateEntryTime", "updateEntryPointTime", "moveEntryToDate"];
  for (const m of methods) ok(typeof adapter[m] === "function", `契约方法 ${m} 存在`);
  eq(adapter.settings, settings, "settings 是共享引用");

  const hooks = { onPreview: () => {}, onDismiss: () => {} };
  adapter.openQuickAdd("2026-11-12", () => {}, "", undefined, "", hooks);
  eq(quickAdds, 1, "宿主可覆盖默认弹窗");
  ok(lastHooks === hooks, "DEC-033 预览 hooks 原样透传给宿主");
  const off = adapter.onExternalChange(() => {});
  off();
  ok(unsubbed, "解绑函数被透传");

  await adapter.openEntry({ readonly: true, source: "memos" });
  eq(opened, 0, "只读条目跳转被拦下");
  has(notices.join(""), "远程接口", "只读条目给出明确提示");
  await adapter.openEntry({ readonly: false, source: "daily", dateStr: "2026-11-12" });
  eq(opened, 1, "本地条目正常跳转");

  adapter.invalidateCache();
  eq(service.daily.fileCache.size, 0, "刷新清本地缓存");
  await adapter.saveSettings();
  eq(saves, 1, "saveSettings 委托宿主落盘");
  eq(service.remoteCache.size, 0, "saveSettings 同时作废远程缓存");
});

/* =================================================================
 * 6. 打包产物（存在才检查；由 npm run build:plugins 生成）
 * ================================================================= */
await group("打包产物", async () => {
  const syDir = resolve(root, "dist/siyuan");
  const bkDir = resolve(root, "dist/blinko");
  const syJs = resolve(syDir, "index.js");
  const bkJs = resolve(bkDir, "index.js");
  if (!existsSync(syJs) || !existsSync(bkJs)) {
    ok(true, "产物尚未构建，跳过产物断言（先跑 npm run build:plugins）");
  } else {
    const sy = readFileSync(syJs, "utf8");
    const bk = readFileSync(bkJs, "utf8");
    has(sy, 'require("siyuan")', "思源产物保留 external siyuan");
    has(sy, "module.exports", "思源产物是 CommonJS");
    has(sy, "default", "思源产物导出 default 插件类");
    ok(!sy.includes("System.register"), "思源产物不是 SystemJS");
    ok(bk.trimStart().startsWith("/* TimeNote for Blinko"), "Blinko 产物带生成标记");
    has(bk, "System.register(", "Blinko 产物是 SystemJS 模块");
    has(bk, "exports('default'", "Blinko 产物导出 default 插件类");
    ok(!bk.includes('require("siyuan")'), "Blinko 产物不带思源依赖");

    const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
    const syMeta = JSON.parse(readFileSync(resolve(syDir, "plugin.json"), "utf8"));
    const bkMeta = JSON.parse(readFileSync(resolve(bkDir, "plugin.json"), "utf8"));
    eq(syMeta.version, manifest.version, "思源清单版本跟随仓库");
    eq(bkMeta.version, manifest.version, "Blinko 清单版本跟随仓库");
    eq(syMeta.name, "timenote-siyuan", "思源插件标识");
    eq(bkMeta.name, "timenote-blinko", "Blinko 插件标识");

    for (const [label, zip] of [["思源 package.zip", resolve(syDir, "package.zip")],
      ["Blinko release.zip", resolve(bkDir, "release.zip")]]) {
      if (!existsSync(zip)) { ok(true, `${label} 尚未生成，跳过`); continue; }
      const probe = spawnSync("python3", ["-c",
        `import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); bad=z.testzip(); ` +
        `print("OK" if bad is None else "BAD:"+bad); print(",".join(z.namelist()))`, zip],
      { encoding: "utf8" });
      has(probe.stdout, "OK", `${label} CRC 校验通过`);
      has(probe.stdout, "index.js", `${label} 含 index.js`);
      has(probe.stdout, "plugin.json", `${label} 含 plugin.json`);
    }

    // ---- 加载期冒烟：产物加载失败 = 所有用户都装不起来 ----
    // 思源加载器（loader.ts）用 window.eval("(function(require,module,exports){...})")
    // 执行 CJS 代码，要求 default 导出的类 instanceof require("siyuan").Plugin。
    const FakePlugin = class FakeSiyuanPlugin {
      constructor() { this.name = "timenote-siyuan"; }
    };
    const fakeSdk = { Plugin: FakePlugin, Setting: class {}, showMessage() {}, openTab() {} };
    const moduleObj = { exports: {} };
    const exportsObj = {};
    const fakeRequire = (key) => {
      if (key === "siyuan") return fakeSdk;
      throw new Error(`意外依赖: ${key}`);
    };
    new Function("require", "module", "exports", sy)(fakeRequire, moduleObj, exportsObj);
    const SyClass = (moduleObj.exports || exportsObj).default || moduleObj.exports;
    ok(typeof SyClass === "function", "思源产物能作为 CJS 模块加载并导出类");
    let syInstance = null;
    try { syInstance = new SyClass(); } catch (err) { failures.push(`思源类构造抛错: ${err.message}`); }
    ok(syInstance instanceof FakePlugin, "思源插件类通过宿主 instanceof Plugin 校验");
    ok(syInstance && syInstance.settings && syInstance.settings.defaultAddType === "point",
      "思源插件构造后默认设置已就绪");

    // Blinko 用 System.import 加载 System.register 模块，取 module.default
    const exported = {};
    let registration = null;
    const fakeSystem = {
      register: (_deps, declare) => { registration = declare((name, value) => { exported[name] = value; }); }
    };
    new Function("System", bk)(fakeSystem);
    ok(registration && typeof registration.execute === "function", "Blinko 产物注册了 SystemJS 模块");
    registration.execute();
    ok(typeof exported.default === "function", "Blinko 模块 execute() 导出插件类");
    let bkInstance = null;
    try { bkInstance = new exported.default(); } catch (err) { failures.push(`Blinko 类构造抛错: ${err.message}`); }
    eq(bkInstance && bkInstance.name, "timenote-blinko", "Blinko 插件类可实例化");
    eq(bkInstance && bkInstance.withSettingPanel, true, "Blinko 声明了设置面板");
    ok(bkInstance && bkInstance.settings && bkInstance.settings.blinkoLookbackDays === 90,
      "Blinko 默认回看天数 90");
  }
});

/* ---------------- 汇总 ---------------- */
if (failures.length) {
  console.error(`\n❌ ${pass} 项通过，${failures.length} 项失败：`);
  for (const f of failures) console.error(`   - ${f}`);
  process.exit(1);
}
console.log(`✅ test:platforms ${pass} 项全部通过`);
