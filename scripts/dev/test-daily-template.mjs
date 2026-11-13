// 日记模板测试（DEC-028）
//
// 覆盖三件事：① 设置项三态（跟随 Obsidian / 自定义 / off）；
// ② Obsidian 模板变量替换与配置读取优先级；
// ③ DailySource 两个建日记入口都真的把模板内容写进去，且 off 时逐字回退旧行为。
//
// 用法：node scripts/dev/test-daily-template.mjs
// 前置：npm run build（测的是各层编译后的真实实现，不是源码切片）
import { loadSources, loadHosts, loadUi } from "./lib/elastic.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let pass = 0;
const fails = [];
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name + (extra ? `  [${extra}]` : "")); console.log(`  ✗ ${name}${extra ? `  [${extra}]` : ""}`); }
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const sources = await loadSources();
const hosts = await loadHosts();
const ui = await loadUi();
const { DailySource, MemoryFileStore } = sources;
const {
  resolveTemplatePath,
  renderTemplateVariables,
  readObsidianDailyNotesConfig,
  readTemplateFile,
  createObsidianTemplateResolver,
  DEFAULT_DAILY_NOTE_FORMAT
} = hosts;

const DAY = "2026-11-12";
const FOLDER = "SpiralNotes";
const DAY_PATH = `${FOLDER}/2026/Daily/11/${DAY}.md`;
const SETTINGS = { periodicNotesFolder: FOLDER, quickAddSection: "## 灵感闪念" };
const makeMoment = ui.nativeMoment;

/** 固定「当前时间」，让 {{time}} 可断言 */
const render = (content, opts = {}) => renderTemplateVariables(content, {
  dateStr: DAY,
  format: "YYYY-MM-DD",
  makeMoment,
  nowTime: "09:05",
  ...opts
});

console.log("\n[1] 设置项三态：resolveTemplatePath");
ok("留空跟随 Obsidian 模板", resolveTemplatePath("", "SpiralNotes/Templates/Daily.md") === "SpiralNotes/Templates/Daily.md");
ok("off 关闭模板", resolveTemplatePath("off", "SpiralNotes/Templates/Daily.md") === null);
ok("OFF 大小写不敏感", resolveTemplatePath("OFF", "x.md") === null);
ok("none 关闭模板", resolveTemplatePath("none", "x.md") === null);
ok("disable 关闭模板", resolveTemplatePath("disable", "x.md") === null);
ok("中文「禁用」关闭模板", resolveTemplatePath("禁用", "x.md") === null);
ok("自定义路径覆盖 Obsidian 配置", resolveTemplatePath("My/Daily.md", "Other.md") === "My/Daily.md");
ok("自定义路径去首尾空格", resolveTemplatePath("  My/Daily.md  ", "Other.md") === "My/Daily.md");
ok("两边都空返回 null", resolveTemplatePath("", "") === null);
ok("undefined 输入不抛错", resolveTemplatePath(undefined, undefined) === null);

console.log("\n[2] 模板变量替换");
ok("默认 format 是 YYYY-MM-DD", DEFAULT_DAILY_NOTE_FORMAT === "YYYY-MM-DD");
ok("{{date}} 按 format 展开", render("今天 {{date}}") === `今天 ${DAY}`);
ok("{{title}} 同 date", render("# {{title}}") === `# ${DAY}`);
ok("{{time}} 用当前时间", render("{{time}} 记录") === "09:05 记录");
ok("{{date:YYYY/MM/DD}} 自定义格式", render("{{date:YYYY/MM/DD}}") === "2026/11/12");
ok("{{date+1d:YYYY-MM-DD}} 次日", render("{{date+1d:YYYY-MM-DD}}") === "2026-11-13");
ok("{{date-1d:YYYY-MM-DD}} 前一日", render("{{date-1d:YYYY-MM-DD}}") === "2026-11-11");
ok("{{date+1w:YYYY-MM-DD}} 下周", render("{{date+1w:YYYY-MM-DD}}") === "2026-11-19");
// {{time:*}} 取的是真实当前时刻，不能拿硬编码的 DAY 比 —— 跨天就会假红。
// 用同一个日期实现算期望值，既跟日期无关，又仍然验证「按当前时刻格式化」。
ok("{{time:FORMAT}} 用当前时刻",
  render("{{time:YYYY-MM-DD}}") === ui.nativeMoment().format("YYYY-MM-DD"));
ok("{{yesterday}} 按 format 展开", render("{{yesterday}}") === "2026-11-11");
ok("{{tomorrow}} 按 format 展开", render("{{tomorrow}}") === "2026-11-13");
ok("未知变量原样保留", render("{{foo}} 保留") === "{{foo}} 保留");
ok("大小写不敏感", render("{{DATE}}") === DAY);
ok("花括号内空白容忍", render("{{  date  }}") === DAY);
ok("多个变量共存", render("# {{date:YYYY-MM-DD}}\n{{time}} 起") === `# ${DAY}\n09:05 起`);
ok("模板无变量时逐字不变", render("## 灵感闪念\n- [ ] 早起\n") === "## 灵感闪念\n- [ ] 早起\n");

// format 含目录时，{{date}} 必须把完整 format 串交给 moment（Obsidian 核心插件就是这个行为）
let seenPattern = "";
const spyMoment = (input, _fmt) => {
  const real = makeMoment(input);
  const wrapped = Object.create(real);
  wrapped.format = (pattern) => { seenPattern = pattern; return real.format("YYYY-MM-DD"); };
  return wrapped;
};
renderTemplateVariables("{{date}}", {
  dateStr: DAY, format: "YYYY/[Daily]/MM/YYYY-MM-DD", makeMoment: spyMoment, nowTime: "09:05"
});
ok("含目录的 format 原样交给 moment", seenPattern === "YYYY/[Daily]/MM/YYYY-MM-DD", seenPattern);

console.log("\n[3] Obsidian 日记配置读取优先级");
const cfgApp = (opts = {}) => ({
  plugins: opts.plugins || { getPlugin: () => null },
  internalPlugins: opts.internalPlugins || { getPluginById: () => null },
  vault: {
    adapter: {
      read: async (p) => {
        if (opts.configJson && p === ".obsidian/daily-notes.json") return opts.configJson;
        throw new Error("missing");
      }
    }
  }
});
const coreOptions = { folder: "SpiralNotes", format: "YYYY/[Daily]/MM/YYYY-MM-DD", template: "SpiralNotes/Templates/Daily.md" };
ok("读核心 daily-notes instance.options",
  (await readObsidianDailyNotesConfig(cfgApp({ internalPlugins: { getPluginById: () => ({ instance: { options: coreOptions } }) } }))).template === coreOptions.template);
ok("periodic-notes 启用时优先",
  (await readObsidianDailyNotesConfig(cfgApp({
    plugins: { getPlugin: () => ({ settings: { daily: { enabled: true, template: "PN.md" } } }) },
    internalPlugins: { getPluginById: () => ({ instance: { options: coreOptions } }) }
  }))).template === "PN.md");
ok("periodic-notes 未启用时回落核心插件",
  (await readObsidianDailyNotesConfig(cfgApp({
    plugins: { getPlugin: () => ({ settings: { daily: { enabled: false, template: "PN.md" } } }) },
    internalPlugins: { getPluginById: () => ({ instance: { options: coreOptions } }) }
  }))).template === coreOptions.template);
ok("内部 API 缺失时读 .obsidian/daily-notes.json",
  (await readObsidianDailyNotesConfig(cfgApp({ configJson: JSON.stringify(coreOptions) }))).template === coreOptions.template);
const fallback = await readObsidianDailyNotesConfig(cfgApp({ configJson: "{bad json" }));
ok("配置损坏时回默认值", fallback.format === "YYYY-MM-DD" && fallback.template === "");
const dirty = await readObsidianDailyNotesConfig(cfgApp({
  internalPlugins: { getPluginById: () => ({ instance: { options: { folder: 5, format: null, template: 8 } } }) }
}));
ok("非字符串字段被清洗", dirty.folder === "" && dirty.format === "YYYY-MM-DD" && dirty.template === "");

console.log("\n[4] 模板文件读取");
const fileApp = (files, opts = {}) => ({
  metadataCache: opts.noCache ? null : {
    getFirstLinkpathDest: (p) => (Object.prototype.hasOwnProperty.call(files, p) ? { path: p } : null)
  },
  vault: {
    cachedRead: async (f) => files[f.path],
    getAbstractFileByPath: (p) => (Object.prototype.hasOwnProperty.call(files, p) ? { path: p } : null),
    adapter: {
      exists: async (p) => Object.prototype.hasOwnProperty.call(files, p),
      read: async (p) => { if (!Object.prototype.hasOwnProperty.call(files, p)) throw new Error("missing"); return files[p]; }
    }
  }
});
ok("metadataCache + cachedRead 读模板",
  await readTemplateFile(fileApp({ "T/Daily.md": "hello" }), "T/Daily.md") === "hello");
ok("路径省略 .md 会自动补",
  await readTemplateFile(fileApp({ "T/Daily.md": "hello" }), "T/Daily") === "hello");
ok("metadataCache 缺失时退到 getAbstractFileByPath",
  await readTemplateFile(fileApp({ "T/Daily.md": "hello" }, { noCache: true }), "T/Daily.md") === "hello");
ok("空路径返回 null", await readTemplateFile(fileApp({}), "") === null);
ok("文件不存在返回 null", await readTemplateFile(fileApp({}), "T/Missing.md") === null);

console.log("\n[5] resolver 端到端（宿主注入）");
const TEMPLATE = [
  "# {{date:YYYY-MM-DD}}",
  "",
  "## PARA列表",
  "```tasks",
  "not done",
  "```",
  "",
  "## 灵感闪念",
  "%%你的记录%%",
  ""
].join("\n");
const resolverApp = (opts = {}) => {
  const files = { "SpiralNotes/Templates/Daily.md": TEMPLATE, "My/Custom.md": "自定义 {{date}}", ...(opts.files || {}) };
  const app = fileApp(files);
  app.internalPlugins = { getPluginById: () => ({ instance: { options: { ...coreOptions, format: "YYYY-MM-DD" } } }) };
  app.plugins = { getPlugin: () => null };
  return app;
};
const warns = [];
const mkResolver = (settings, app = resolverApp()) => createObsidianTemplateResolver(app, settings, {
  makeMoment,
  warn: (m) => warns.push(m)
});
ok("留空时跟随 Obsidian 模板", (await mkResolver({ dailyNoteTemplate: "" })(DAY)).includes("## PARA列表"));
ok("模板变量被替换", (await mkResolver({ dailyNoteTemplate: "" })(DAY)).includes(`# ${DAY}`));
ok("自定义路径覆盖 Obsidian 模板", (await mkResolver({ dailyNoteTemplate: "My/Custom.md" })(DAY)) === `自定义 ${DAY}`);
ok("off 时返回 null（不读模板）", await mkResolver({ dailyNoteTemplate: "off" })(DAY) === null);
ok("模板不存在时返回 null", await mkResolver({ dailyNoteTemplate: "Nope.md" })(DAY) === null);
ok("模板读取失败有可诊断提示", warns.some(w => w.includes("Nope.md")));
const changed = { dailyNoteTemplate: "" };
const sharedResolver = mkResolver(changed);
await sharedResolver(DAY);
changed.dailyNoteTemplate = "off";
ok("共享 settings 引用改完立即生效", await sharedResolver(DAY) === null);

console.log("\n[6] DailySource 两条建日记路径");
const newSource = (resolveTemplate, settings = SETTINGS) => {
  const store = new MemoryFileStore();
  const daily = new DailySource({ store, settings, resolveTemplate });
  return { store, daily };
};
const OLD_EMPTY = `# ${DAY}\n\n## 灵感闪念\n`;
const OLD_WITH_LINE = `# ${DAY}\n\n## 灵感闪念\n- 09:00 测试\n`;

{
  const { store, daily } = newSource(undefined);
  await daily.ensureDailyNote(DAY);
  ok("无 resolver：ensureDailyNote 逐字保持旧内容", store.peek(DAY_PATH) === OLD_EMPTY, JSON.stringify(store.peek(DAY_PATH)));
}
{
  const { store, daily } = newSource(undefined);
  await daily.addEntry(DAY, "09:00", "测试", false);
  ok("无 resolver：addEntry 逐字保持旧内容", store.peek(DAY_PATH) === OLD_WITH_LINE, JSON.stringify(store.peek(DAY_PATH)));
}
{
  const { store, daily } = newSource(async () => null);
  await daily.addEntry(DAY, "09:00", "测试", false);
  ok("resolver 返回 null 时回退旧内容", store.peek(DAY_PATH) === OLD_WITH_LINE);
}
{
  const { store, daily } = newSource(async () => TEMPLATE.replace("{{date:YYYY-MM-DD}}", DAY));
  await daily.ensureDailyNote(DAY);
  const content = store.peek(DAY_PATH);
  ok("ensureDailyNote 写入模板内容", content.includes("## PARA列表") && content.includes("```tasks"));
  ok("模板已有 ## 灵感闪念 时不重复建节", (content.match(/## 灵感闪念/g) || []).length === 1);
  ok("不再额外补 # 日期 一级标题", (content.match(/^# 2026-11-12$/gm) || []).length === 1);
  ok("模板尾部注释原样保留", content.includes("%%你的记录%%"));
}
{
  const { store, daily } = newSource(async () => TEMPLATE.replace("{{date:YYYY-MM-DD}}", DAY));
  await daily.addEntry(DAY, "09:00", "测试", false);
  const lines = store.peek(DAY_PATH).split("\n");
  const idx = lines.findIndex(l => l === "## 灵感闪念");
  ok("addEntry 把记录插在模板标题下第一行", lines[idx + 1] === "- 09:00 测试", lines[idx + 1]);
  ok("插入后模板其余内容不变", lines.includes("## PARA列表") && lines.includes("%%你的记录%%"));
}
{
  const noSection = "---\ndate: {{date:YYYY-MM-DD}}\n---\n\n## 任务计划\n内容\n";
  const { store, daily } = newSource(async () => noSection.replace("{{date:YYYY-MM-DD}}", DAY));
  await daily.ensureDailyNote(DAY);
  const content = store.peek(DAY_PATH);
  ok("模板无快速记录节时补一节", content.includes("\n\n## 灵感闪念\n"));
  ok("frontmatter 原样保留", content.startsWith("---\ndate: 2026-11-12\n---"));
}
{
  const noSection = "## 任务计划\n内容\n";
  const { store, daily } = newSource(async () => noSection);
  await daily.addEntry(DAY, "09:00", "测试", false);
  const content = store.peek(DAY_PATH);
  ok("模板无该节时 addEntry 补节并插入记录", content.includes("## 灵感闪念\n- 09:00 测试\n"));
}
{
  let calls = 0;
  const store = new MemoryFileStore({ [DAY_PATH]: OLD_EMPTY });
  const daily = new DailySource({
    store, settings: SETTINGS,
    resolveTemplate: async () => { calls++; return TEMPLATE; }
  });
  await daily.addEntry(DAY, "10:00", "第二条", false);
  ok("已有日记不调用 resolver", calls === 0, String(calls));
  ok("已有日记仍按原逻辑插到标题下", store.peek(DAY_PATH).includes("## 灵感闪念\n- 10:00 第二条"));
}
{
  const { store, daily } = newSource(mkResolver({ dailyNoteTemplate: "" }, resolverApp()));
  await daily.ensureDailyNote(DAY);
  ok("真 resolver 接进 DailySource 后模板生效", store.peek(DAY_PATH).includes("## PARA列表"));
}

console.log("\n[7] 分层与接线静态断言");
const mainTs = read("main.ts");
const dailyTs = read("sources/daily.ts");
const hostsIndex = read("hosts/index.ts");
const templateTs = read("hosts/daily-note-template.ts");
const pkg = JSON.parse(read("package.json"));
ok("DEFAULT_SETTINGS 含 dailyNoteTemplate", /dailyNoteTemplate:\s*""/.test(mainTs));
ok("设置页有日记模板文件控件", mainTs.includes('setName("日记模板文件")'));
ok("main.ts 装配 resolver", mainTs.includes("createObsidianTemplateResolver") && mainTs.includes("resolveTemplate:"));
ok("DailySource 两处 create 都走 buildNewNoteContent",
  (dailyTs.match(/store\.create\(path, await this\.buildNewNoteContent\(/g) || []).length === 2);
ok("硬编码结构只留在 buildNewNoteContent 的回退分支",
  (dailyTs.match(/# \$\{dateStr\}/g) || []).length === 2);
ok("hosts/index.ts 导出模板模块", hostsIndex.includes('"./daily-note-template"'));
ok("模板模块不 import obsidian", !/from\s+["']obsidian["']/.test(templateTs));
ok("模板模块不读 window 全局", !/window\./.test(templateTs));
ok("sources/daily.ts 不读宿主全局", !/window\.|from\s+["']obsidian["']/.test(dailyTs));
ok("package.json 有 test:template", typeof pkg.scripts["test:template"] === "string");
ok("npm test 串里包含 test:template", pkg.scripts.test.includes("test:template"));

console.log(`\n${fails.length ? "✗" : "✓"} 日记模板：${pass} 项通过，${fails.length} 项失败`);
if (fails.length) {
  fails.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
