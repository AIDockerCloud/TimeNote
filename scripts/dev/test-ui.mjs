// ui/ 层测试（DEC-024）
//
// 覆盖：DOM 兼容垫片的幂等性与「不覆盖 Obsidian 原生」、createEl 语义、
//        日期工厂注入、零依赖 NativeMoment 的 moment 兼容行为、
//        core/ 与 ui/ 的宿主边界、main.ts 的接线。
//
// 用法：node scripts/dev/test-ui.mjs
// 前置：npm run build:ui（或 npm run build）
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, loadUi, loadPluginSource } from "./lib/elastic.mjs";

let pass = 0;
const fails = [];
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fails.push(name + (extra ? `  [${extra}]` : "")); console.log(`  ✗ ${name}${extra ? `  [${extra}]` : ""}`); }
};

// ---------- 假 DOM（足够跑通我们用到的 API，不引 jsdom） ----------
class FakeClassList {
  constructor() { this.set = new Set(); }
  add(...cs) { for (const c of cs) if (c) this.set.add(c); }
  remove(...cs) { for (const c of cs) if (c) this.set.delete(c); }
  toggle(c, force) {
    const v = force === undefined ? !this.set.has(c) : !!force;
    if (v) this.set.add(c); else this.set.delete(c);
    return v;
  }
  contains(c) { return this.set.has(c); }
}

class FakeEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attrs = {};
    this.style = { cssText: "" };
    this.classList = new FakeClassList();
    this.parentNode = null;
    this.listeners = {};
    this._text = "";
  }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get firstChild() { return this.children[0] || null; }
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
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, cb) { (this.listeners[t] = this.listeners[t] || []).push(cb); }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
}

const realGlobals = {};
function installFakeDom() {
  realGlobals.HTMLElement = globalThis.HTMLElement;
  realGlobals.DocumentFragment = globalThis.DocumentFragment;
  realGlobals.document = globalThis.document;
  globalThis.document = {
    createElement: (tag) => new FakeEl(tag),
    createDocumentFragment: () => new FakeEl("#fragment")
  };
}
function restoreGlobals() {
  for (const [k, v] of Object.entries(realGlobals)) {
    if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
  }
}
/** 去掉注释与字符串字面量，只留真正会执行的代码（边界断言用）。
 *  按行处理并禁止跨行匹配 —— 整文件级正则遇到未配对的引号会把大段代码吞掉。 */
function stripNonCode(s) {
  return s.split("\n")
    .map(line => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("/*") || t.startsWith("*")) return "";
      return line.replace(/\s+\/\/.*$/, "");
    })
    .join("\n")
    // [^"\\\n] 里的 \n 是关键：不允许字符串跨行
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""')
    .replace(/`(?:[^`\\\n]|\\.)*`/g, "``");
}

const ui = await loadUi();
const {
  createEl, applyElementInfo, addClass, removeClass, toggleClass,
  setText, empty, detach, onClick, installDomHelpers, lastInstalledCount,
  moment, setMomentFactory, resetMomentFactory, hasMomentFactory, nativeMoment
} = ui;

// ---------- 1) Obsidian 侧零变化：已有扩展一个都不覆盖 ----------
console.log("--- DOM 垫片：幂等与不覆盖 ---");
{
  installFakeDom();
  const HELPER_NAMES = [
    "createEl", "createDiv", "createSpan", "addClass", "addClasses",
    "removeClass", "removeClasses", "toggleClass", "hasClass", "setText",
    "empty", "detach", "onClick"
  ];
  class ObsidianLikeEl extends FakeEl {}
  class ObsidianLikeFragment extends FakeEl {}
  // 两个原型都要预置：installDomHelpers 会同时处理 HTMLElement 与 DocumentFragment
  for (const C of [ObsidianLikeEl, ObsidianLikeFragment]) {
    for (const n of HELPER_NAMES) C.prototype[n] = function () { return "native"; };
  }
  globalThis.HTMLElement = ObsidianLikeEl;
  globalThis.DocumentFragment = ObsidianLikeFragment;

  const installed = installDomHelpers();
  ok("宿主自带扩展时一个都不安装（Obsidian 侧 no-op）", installed === 0, String(installed));
  ok("原生 createEl 保持不变", ObsidianLikeEl.prototype.createEl.call(new FakeEl("div")) === "native");
  ok("lastInstalledCount 记录为 0", lastInstalledCount() === 0);
  restoreGlobals();
}

// ---------- 2) 新宿主：补齐标准 DOM 实现 ----------
console.log("--- DOM 垫片：新宿主补齐 ---");
{
  installFakeDom();
  class FreshEl extends FakeEl {}
  class FreshFragment extends FakeEl {}
  globalThis.HTMLElement = FreshEl;
  globalThis.DocumentFragment = FreshFragment;
  // 真实浏览器里所有元素共享 HTMLElement.prototype；假 DOM 也要让
  // document.createElement 产出装了扩展的同一类，否则链式调用测不出来。
  globalThis.document.createElement = (tag) => new FreshEl(tag);
  globalThis.document.createDocumentFragment = () => new FreshFragment("#fragment");

  const installed = installDomHelpers();
  ok("新宿主会补齐扩展方法", installed > 0, String(installed));
  ok("重复安装是幂等的（第二次为 0）", installDomHelpers() === 0);
  ok("force 模式可强制覆盖", installDomHelpers(true) > 0);

  const parent = new FreshEl("div");
  const child = parent.createEl("span", {
    cls: "a b",
    text: "你好",
    style: "color: red;",
    attr: { "data-x": 1, "data-off": null },
    title: "提示",
    type: "text",
    placeholder: "写点什么",
    value: "v",
    href: "/x"
  });
  ok("原型 createEl 自动 append 到父元素", parent.children.length === 1 && parent.children[0] === child);
  ok("cls 支持空格分隔字符串", child.classList.contains("a") && child.classList.contains("b"));
  ok("text 写进 textContent", child.textContent === "你好");
  ok("style 写进 cssText", child.style.cssText === "color: red;");
  ok("attr 写入属性，null 移除", child.attrs["data-x"] === "1" && !("data-off" in child.attrs));
  ok("title / type / placeholder / value / href 都落到属性上",
    child.attrs.title === "提示" && child.attrs.type === "text" &&
    child.attrs.placeholder === "写点什么" && child.attrs.value === "v" && child.attrs.href === "/x");

  const p2 = new FreshEl("div");
  const first = p2.createEl("b", { text: "1" });
  const prep = p2.createEl("i", { text: "0", prepend: true });
  ok("prepend 插到最前面", p2.children[0] === prep && p2.children[1] === first);

  // 链式：main.ts 里有 6 处 bannerRight.createEl(...).createEl(...)
  const chainRoot = new FreshEl("div");
  const outer = chainRoot.createEl("span", { text: "x" });
  const inner = outer.createEl("strong", { text: "y" });
  ok("链式 createEl 正常（存量 6 处不会断）", outer.children[0] === inner);
  ok("createDiv / createSpan 可用", chainRoot.createDiv({ cls: "d" }).tagName === "DIV" &&
    chainRoot.createSpan({ cls: "s" }).tagName === "SPAN");

  const t = new FreshEl("div");
  t.addClass("x", "y z");
  ok("addClass 支持多个 / 空格串", t.classList.contains("x") && t.classList.contains("y") && t.classList.contains("z"));
  t.removeClass("x", "y");
  ok("removeClass 生效", !t.classList.contains("x") && !t.classList.contains("y"));
  t.toggleClass("q", true); t.toggleClass("q", false);
  ok("toggleClass 带 value 生效", !t.classList.contains("q"));
  ok("hasClass 可用", typeof t.hasClass === "function" && t.hasClass("z"));
  setText(t, "abc"); ok("setText 生效", t.textContent === "abc");
  t.appendChild(new FreshEl("span"));
  empty(t);
  ok("empty 清空所有子节点", t.children.length === 0);
  const holder = new FreshEl("div");
  const removable = holder.appendChild(new FreshEl("span"));
  detach(removable);
  ok("detach 从父节点摘掉", holder.children.length === 0);
  let clicked = 0;
  onClick(t, () => clicked++);
  (t.listeners.click || []).forEach(fn => fn());
  ok("onClick 注册 click 监听", clicked === 1);
  restoreGlobals();
}

// ---------- 3) 显式函数 ----------
console.log("--- DOM 显式函数 ---");
{
  installFakeDom();
  const el = createEl("div", { cls: ["p", "q"], text: "T" });
  ok("模块级 createEl 支持 cls 数组", el.classList.contains("p") && el.classList.contains("q"));
  ok("模块级 createEl 不自动挂父节点", el.parentNode === null);
  const parent = new FakeEl("section");
  const c = createEl("a", { text: "链接" }, parent);
  ok("传 parent 时自动 append", parent.children[0] === c);
  const x = new FakeEl("div");
  applyElementInfo(x, { text: "z", style: "top: 1px;" });
  ok("applyElementInfo 可单独调用", x.textContent === "z" && x.style.cssText === "top: 1px;");
  addClass(x, "m"); removeClass(x, "m");
  ok("显式 addClass / removeClass", !x.classList.contains("m"));
  toggleClass(x, "k", true);
  ok("显式 toggleClass", x.classList.contains("k"));
  restoreGlobals();
}

// ---------- 4) 日期工厂注入 ----------
console.log("--- 日期工厂 ---");
{
  resetMomentFactory();
  ok("未注入时 hasMomentFactory=false", hasMomentFactory() === false);
  let err = null;
  try { moment(); } catch (e) { err = e; }
  ok("未注入时抛明确错误（不是 undefined is not a function）",
    !!err && /未注入日期实现/.test(err.message), err && err.message);
  let bad = null;
  try { setMomentFactory(null); } catch (e) { bad = e; }
  ok("setMomentFactory 拒绝非函数", !!bad);

  setMomentFactory(nativeMoment);
  ok("注入后 hasMomentFactory=true", hasMomentFactory() === true);
  ok("moment() 走注入的实现", moment("2026-11-11").format("YYYY-MM-DD") === "2026-11-11");
  resetMomentFactory();
}

// ---------- 5) NativeMoment 行为对照（moment 语义） ----------
console.log("--- NativeMoment 行为 ---");
{
  const M = nativeMoment;
  ok("moment(dateStr) 按本地时区解析，不差一天",
    M("2026-11-11").format("YYYY-MM-DD") === "2026-11-11");
  ok("中文模板", M("2026-11-11").format("YYYY年MM月DD日") === "2026年11月11日");
  ok("MM月DD日", M("2026-11-11").format("MM月DD日") === "11月11日");
  ok("YYYY年 / YYYY / MM / D",
    M("2026-01-05").format("YYYY年") === "2026年" &&
    M("2026-01-05").format("YYYY") === "2026" &&
    M("2026-01-05").format("MM") === "01" &&
    M("2026-01-05").format("D") === "5");
  ok("HH:mm:ss", M("2026-11-11").format("HH:mm:ss") === "00:00:00");
  ok("中文星期 / 月名", /周|星期/.test(M("2026-11-11").format("ddd")) &&
    /周|星期/.test(M("2026-11-11").format("dddd")) &&
    /月/.test(M("2026-11-11").format("MMMM")));

  const a = M("2026-11-11");
  const b = a.clone();
  const ret = a.add(1, "days");
  ok("add 是可变的（改自己）", a.format("YYYY-MM-DD") === "2026-11-12" && ret === a);
  ok("clone 是独立副本", b.format("YYYY-MM-DD") === "2026-11-11");
  ok("add(7,'days') / subtract", M("2026-11-11").add(7, "days").subtract(2, "day").format("YYYY-MM-DD") === "2026-11-16");
  ok("月末夹取：1/31 + 1 月 = 2/28", M("2026-01-31").add(1, "months").format("YYYY-MM-DD") === "2026-02-28");
  ok("闰年月末夹取：2024/1/31 + 1 月 = 2/29", M("2024-01-31").add(1, "month").format("YYYY-MM-DD") === "2024-02-29");
  ok("跨年夹取：2024/2/29 + 1 年 = 2025/2/28", M("2024-02-29").add(1, "years").format("YYYY-MM-DD") === "2025-02-28");
  ok("quarters 换算成 3 个月", M("2026-01-15").add(1, "quarters").format("YYYY-MM-DD") === "2026-04-15");

  ok("startOf('month')", M("2026-11-11").startOf("month").format("YYYY-MM-DD") === "2026-11-01");
  ok("endOf('month') 落在月末", M("2026-11-11").endOf("month").format("YYYY-MM-DD") === "2026-11-30");
  ok("startOf('quarter')", M("2026-11-11").startOf("quarter").format("YYYY-MM-DD") === "2026-10-01");
  ok("endOf('quarter')", M("2026-11-11").endOf("quarter").format("YYYY-MM-DD") === "2026-12-31");
  ok("startOf('year') / endOf('year')",
    M("2026-05-06").startOf("year").format("YYYY-MM-DD") === "2026-01-01" &&
    M("2026-05-06").endOf("year").format("YYYY-MM-DD") === "2026-12-31");
  // 2026-11-11 是周三，中文周一开始 → 本周一 = 11-09
  ok("startOf('isoWeek') 落在周一", M("2026-11-11").startOf("isoWeek").format("YYYY-MM-DD") === "2026-11-09");
  ok("endOf('isoWeek') 落在周日", M("2026-11-11").endOf("isoWeek").format("YYYY-MM-DD") === "2026-11-15");

  ok("year(n) / month(n) / startOf 链式（main.ts 月视图就这么用）",
    M().year(2026).month(10).startOf("month").format("YYYY-MM-DD") === "2026-11-01");
  ok("daysInMonth", M("2026-02-10").daysInMonth() === 28 && M("2024-02-10").daysInMonth() === 29);
  ok("quarter()", M("2026-11-11").quarter() === 4);
  ok("isoWeek() 在 1..53 之间", M("2026-11-11").isoWeek() >= 1 && M("2026-11-11").isoWeek() <= 53);
  ok("date() / day() / hour() / hours()",
    M("2026-11-11").date() === 11 && typeof M().day() === "number" && M().hour() === M().hours());

  ok("isSame(other,'day') 忽略时刻",
    M("2026-11-11").isSame(M("2026-11-11"), "day") === true &&
    M("2026-11-11").isSame(M("2026-11-12"), "day") === false);
  ok("isSameOrBefore 含等于（时间轴循环就靠它）",
    M("2026-11-11").isSameOrBefore(M("2026-11-11"), "day") === true &&
    M("2026-11-12").isSameOrBefore(M("2026-11-11"), "day") === false);
  ok("isSameOrAfter / isBefore / isAfter",
    M("2026-11-12").isSameOrAfter(M("2026-11-11"), "day") &&
    M("2026-11-10").isBefore(M("2026-11-11"), "day") &&
    M("2026-11-12").isAfter(M("2026-11-11"), "day"));
}

// ---------- 6) 边界与接线 ----------
console.log("--- 分层边界与宿主接线 ---");
{
  const uiFiles = fs.readdirSync(path.join(PROJECT_ROOT, "ui")).filter(f => f.endsWith(".ts"));
  const uiCode = Object.fromEntries(uiFiles.map(f => [
    f, stripNonCode(fs.readFileSync(path.join(PROJECT_ROOT, "ui", f), "utf8"))
  ]));
  ok("ui/ 里没有 import obsidian",
    uiFiles.every(f => !/from\s+["']obsidian["']/.test(uiCode[f])));
  ok("ui/ 不调用 window.moment（由宿主注入，不读全局）",
    uiFiles.every(f => !/window\.moment\s*\(/.test(uiCode[f])));
  // ui/view.ts 会用 window.addEventListener / setTimeout / innerWidth 等
  // **标准浏览器 API**，三个宿主都是浏览器环境、都原生具备，允许使用；
  // 这里只拦「宿主注入的全局」（moment / app / obsidian 之类）。
  const WINDOW_ALLOWLIST = new Set([
    "addEventListener", "removeEventListener", "setTimeout", "clearTimeout",
    "setInterval", "clearInterval", "innerWidth", "innerHeight",
    "requestAnimationFrame", "cancelAnimationFrame", "getComputedStyle",
    "devicePixelRatio", "matchMedia"
  ]);
  const badGlobals = uiFiles.flatMap(f =>
    [...uiCode[f].matchAll(/\bwindow\.(\w+)/g)]
      .filter(m => !WINDOW_ALLOWLIST.has(m[1]))
      .map(m => `${f}: window.${m[1]}`)
  );
  ok("ui/ 只读标准浏览器 API，不碰宿主注入的全局",
    badGlobals.length === 0, badGlobals.join("; "));

  const mainSrc = fs.readFileSync(path.join(PROJECT_ROOT, "main.ts"), "utf8");
  const codeLines = stripNonCode(mainSrc);
  ok("main.ts 里 window.moment 只剩 onload 的注入点（1 处）",
    (codeLines.match(/window\.moment/g) || []).length === 1,
    String((codeLines.match(/window\.moment/g) || []).length));
  const bootstrapSrc = loadPluginSource("apps/bootstrap.ts");
  ok("onload 走共用装配入口 prepareHostEnvironment", /prepareHostEnvironment\(\{ momentFactory: window\.moment \}\)/.test(mainSrc));
  ok("装配入口里安装了 DOM 垫片（默认不覆盖）", /installDomHelpers\(opts\.forceDomHelpers === true\)/.test(bootstrapSrc));
  ok("装配入口里注入了日期实现", /setMomentFactory\(/.test(bootstrapSrc));
  ok("main.ts 不再直接调用 window.moment()", !/window\.moment\s*\(/.test(codeLines.replace("setMomentFactory(window.moment)", "")));
}

console.log(`\n===== ${pass} passed, ${fails.length} failed =====`);
if (fails.length) {
  console.log(fails.map(f => "  - " + f).join("\n"));
  process.exit(1);
}
