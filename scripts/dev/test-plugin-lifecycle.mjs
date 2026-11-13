// 新宿主插件「完整生命周期」回归测试（2026-11-14 思源 3.8 真机反馈）
//
// 背景：旧测试只做「加载期冒烟」（require 产物、导出类、构造实例），
// 渲染引擎的 renderView() 全被打桩屏蔽。结果 ui/view.ts 调用了 nativeMoment
// 没实现的 isoWeekday()，思源 / Blinko 上 renderHeader 直接抛 TypeError，
// 页面只剩半个工具栏 —— 951 项测试全绿也没抓到。
//
// 本测试用最小 DOM 桩把思源入口**真跑一遍**：onload → addTab.init →
// onOpen → renderView，并遍历 7 种视图 × 2 种布局。任何运行期异常都会让
// 测试变红，不再依赖真机。
//
// 用法：node scripts/dev/test-plugin-lifecycle.mjs（前置：npm run build:ui）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import { loadUi } from "./lib/elastic.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
let pass = 0;
const fails = [];
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name + (extra ? `  [${extra}]` : "")); console.log(`  ✗ ${name}${extra ? `  [${extra}]` : ""}`); }
};
const eq = (a, b, name) => ok(name, a === b, `got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

/* ---------------- 最小 DOM 桩 ---------------- */
class FakeEl {
  constructor(tag = "div") {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attrs = {};
    this.dataset = {};
    this.style = {
      cssText: "",
      setProperty(k, v) { this[k] = v; },
      removeProperty(k) { delete this[k]; }
    };
    this.listeners = {};
    this._text = "";
    this._classes = new Set();
    this.classList = {
      add: (...cs) => cs.forEach(c => this._classes.add(c)),
      remove: (...cs) => cs.forEach(c => this._classes.delete(c)),
      toggle: (c, v) => {
        if (v === undefined) v = !this._classes.has(c);
        v ? this._classes.add(c) : this._classes.delete(c);
        return v;
      },
      contains: c => this._classes.has(c)
    };
    this.offsetWidth = 880;
    this.offsetHeight = 40;
    this.clientWidth = 880;
    this.clientHeight = 600;
    this.scrollTop = 0;
    this.scrollHeight = 1200;
    this.isConnected = true;
  }
  get firstChild() { return this.children[0] || null; }
  get parentElement() { return this.parentNode; }
  get textContent() { return this._text || this.children.map(c => c.textContent).join(""); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get innerHTML() { return ""; }
  set innerHTML(v) { this._text = String(v); this.children = []; }
  get className() { return [...this._classes].join(" "); }
  set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  insertBefore(c, ref) {
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    c.parentNode = this; return c;
  }
  removeChild(c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    c.parentNode = null; return c;
  }
  replaceChildren(...cs) { this.children = cs.slice(); this._text = ""; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, cb) { (this.listeners[t] = this.listeners[t] || []).push(cb); }
  removeEventListener(t, cb) { this.listeners[t] = (this.listeners[t] || []).filter(f => f !== cb); }
  getBoundingClientRect() {
    return { left: 0, top: 0, right: 880, bottom: 600, width: 880, height: 600 };
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const want = String(sel).replace(/^\./, "");
    const out = [];
    const walk = n => n.children.forEach(c => { if (c._classes.has(want)) out.push(c); walk(c); });
    walk(this);
    return out;
  }
  closest(sel) {
    const want = String(sel).replace(/^\./, "");
    let n = this;
    while (n) { if (n._classes && n._classes.has(want)) return n; n = n.parentNode; }
    return null;
  }
  focus() {}
  contains() { return true; }
}

function installFakeDom() {
  const body = new FakeEl("body");
  globalThis.HTMLElement = FakeEl;
  globalThis.DocumentFragment = class extends FakeEl {};
  globalThis.document = {
    body,
    head: new FakeEl("head"),
    createElement: tag => new FakeEl(tag),
    createDocumentFragment: () => new FakeEl("#fragment"),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  };
  globalThis.window = {
    innerWidth: 1440, innerHeight: 900,
    addEventListener() {}, removeEventListener() {},
    setInterval: () => 1, clearInterval() {},
    setTimeout: () => 1, clearTimeout() {},
    requestAnimationFrame: () => 1
  };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ code: 0, data: [] }) });
  return { body };
}

/* ---------------- 1) nativeMoment 的 isoWeekday ---------------- */
console.log("--- nativeMoment.isoWeekday（周视图标题依赖） ---");
{
  const ui = await loadUi(root);
  const { nativeMoment } = ui;
  const monday = nativeMoment("2026-11-09"); // 周一
  const sunday = nativeMoment("2026-11-15"); // 周日
  eq(monday.isoWeekday(), 1, "周一 = 1");
  eq(sunday.isoWeekday(), 7, "周日 = 7");
  eq(nativeMoment("2026-11-12").isoWeekday(), 4, "周四 = 4");
  const moved = nativeMoment("2026-11-12");
  eq(moved.isoWeekday(1).format("YYYY-MM-DD"), "2026-11-09", "setter 可变且回到本周一");
  eq(moved.isoWeekday(), 1, "setter 返回自身后读数一致");
  eq(nativeMoment("2026-01-01").isoWeekday(), 4, "跨年仍正确");
}

/* ---------------- 2) 静态防线：异常不许再被吞 ---------------- */
console.log("--- 宿主入口的错误可见性 ---");
{
  for (const [label, file] of [["思源", "apps/siyuan/index.ts"], ["Blinko", "apps/blinko/index.ts"]]) {
    const src = fs.readFileSync(path.join(root, file), "utf8");
    // 注释里会引用旧写法当说明，只检查真正会执行的代码行
    const codeOnly = src.split("\n")
      .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join("\n");
    ok(`${label} 入口不再用 void onOpen() 吞异常`, !/void\s+renderer\.onOpen\(\)/.test(codeOnly));
    ok(`${label} 入口有 onOpen().catch 与错误卡片`,
      /onOpen\(\)\.catch\(/.test(codeOnly) && /reportRenderError/.test(codeOnly));
  }
  const cssCfg = fs.readFileSync(path.join(root, "apps/siyuan/esbuild.config.mjs"), "utf8");
  ok("思源 CSS 追加了 --b3-* 变量映射", /--b3-theme-background/.test(cssCfg));
  ok("思源容器有最小高度兜底", /\.timenote-container \{ min-height: 360px; \}/.test(cssCfg));
}

/* ---------------- 3) 完整生命周期（现场编译源码，不依赖 dist 新旧） ---------------- */
console.log("--- 思源插件完整生命周期 + 全视图渲染 ---");
{
  installFakeDom();

  // 与 apps/siyuan/esbuild.config.mjs 同参数，但 write:false 直接拿字符串
  const built = await esbuild.build({
    entryPoints: [path.join(root, "apps/siyuan/index.ts")],
    bundle: true, format: "cjs", platform: "browser", target: "es2018",
    external: ["siyuan"], write: false, logLevel: "silent"
  });
  const code = built.outputFiles[0].text;

  const errors = [];
  const onUnhandled = err => errors.push(String(err && err.stack || err));
  process.on("unhandledRejection", onUnhandled);

  let tab = null, topbar = null, openedTab = null;
  class FakePlugin {
    constructor(opts = {}) {
      this.name = opts.name || "timenote-siyuan";
      this.app = opts.app || {};
      this.eventBus = { on() {}, off() {} };
    }
    addTab(o) { tab = o; return o; }
    addTopBar(o) { topbar = o; return o; }
    loadData() { return Promise.resolve(null); }
    saveData() { return Promise.resolve(); }
  }
  const sdk = {
    Plugin: FakePlugin,
    Setting: class { addItem() {} },
    showMessage() {},
    openTab(o) { openedTab = o; return {}; }
  };

  const moduleObj = { exports: {} };
  const exportsObj = {};
  const fakeRequire = key => {
    if (key === "siyuan") return sdk;
    throw new Error("意外依赖: " + key);
  };
  new Function("require", "module", "exports", code)(fakeRequire, moduleObj, exportsObj);
  const SyClass = (moduleObj.exports || exportsObj).default;
  ok("产物导出 CJS default 插件类", typeof SyClass === "function");

  const plugin = new SyClass({ name: "timenote-siyuan", app: {}, displayName: "TimeNote", i18n: {} });
  let syncError = null;
  try { plugin.onload(); } catch (err) { syncError = err; }
  ok("onload 不抛异常", !syncError, syncError && syncError.message);
  ok("addTab / addTopBar 均已注册", !!tab && !!topbar);

  topbar?.callback?.();
  eq(openedTab && openedTab.custom && openedTab.custom.id,
    "timenote-siyuantimenote_calendar", "openCalendar 的 custom.id = name + type");

  const rootEl = new FakeEl("div");
  tab?.init?.call({ element: rootEl, data: {} });
  await new Promise(r => setTimeout(r, 30));

  const renderer = plugin.rendererRef;
  ok("init 挂载了渲染引擎", !!renderer);
  ok("根容器带上 .timenote-container", rootEl._classes.has("timenote-container"));
  ok("首次渲染画出了 header / sub-header / 视图", rootEl.children.length >= 3,
    "children=" + rootEl.children.length);
  ok("首次渲染无未捕获异常", errors.length === 0, errors[0]);

  // 7 种视图 × 2 种布局：把「某个视图才用到的方法」一次性全跑出来
  const modes = ["day", "3day", "week", "month", "quarter", "year", "timeline"];
  for (const layout of ["block", "compact"]) {
    for (const mode of modes) {
      const before = errors.length;
      let err = null;
      try {
        renderer.currentViewMode = mode;
        renderer.host.settings.layoutMode = layout;
        await renderer.renderView();
      } catch (e) { err = e; }
      const okRender = !err && errors.length === before && rootEl.children.length >= 3;
      ok(`${layout}/${mode} 渲染完整且零异常`, okRender,
        err ? err.message : (errors[before] || `children=${rootEl.children.length}`));
    }
  }

  ok("页签里没有渲染错误卡片", rootEl.querySelectorAll(".timenote-host-error").length === 0);
  ok("全程零 unhandledRejection", errors.length === 0, errors[0]);
  process.off("unhandledRejection", onUnhandled);
}

if (fails.length) {
  console.error(`\n❌ ${pass} 项通过，${fails.length} 项失败：`);
  for (const f of fails) console.error(`   - ${f}`);
  process.exit(1);
}
console.log(`\n✅ ${pass} 项全部通过`);
