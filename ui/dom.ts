// ui/dom.ts — 平台无关的 DOM 辅助层（DEC-024）
//
// 背景：main.ts 有 222 处 `.createEl()`、11 处 `.addClass()` 等，这些**不是**
// 标准 DOM API，而是 Obsidian 注入到 `HTMLElement.prototype` 上的扩展。
// Blinko / 思源宿主里没有这些扩展，视图一渲染就全崩 —— 这是三端共用渲染层
// 的第一道拦路虎。
//
// 策略（刻意选择「兼容垫片」而不是改写 222 处调用点）：
//   1. 这里用标准 DOM API 实现一份等价的扩展方法；
//   2. `installDomHelpers()` **只在方法缺失时**挂到原型上（幂等、默认不覆盖）。
//      → Obsidian 里检测到原生实现存在，一个都不装，行为逐字不变；
//      → Blinko / 思源里自动补齐，222 处调用一行都不用改就能跑。
//   3. 新代码优先用模块级 `createEl()` / `addClass()` 等显式函数，
//      逐步把存量调用迁过来，最终可以不再依赖原型垫片。
//
// 为什么不全量改写：222 处分布在渲染热路径，含 6 处链式调用；一次性改写
// 会改变产物、且任何一处 opts 语义偏差都会静默改掉 UI。分两步走，
// 每一步都有「Obsidian 侧行为零变化」这个可验证的验收线。

/** 与 Obsidian `DomElementInfo` 对齐的元素描述（额外支持项目在用的 `style`） */
export interface TnElementInfo {
  /** 空格分隔的字符串或字符串数组 */
  cls?: string | string[];
  text?: string | DocumentFragment;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  value?: string;
  type?: string;
  prepend?: boolean;
  placeholder?: string;
  href?: string;
  /** 项目扩展：直接写内联样式（Obsidian 的全局扩展已支持） */
  style?: string;
}

/** 把 info 应用到元素上。Obsidian 的 createEl 语义，逐项对齐。 */
export function applyElementInfo(el: HTMLElement, info?: TnElementInfo): void {
  if (!info) return;

  if (info.cls !== undefined) {
    const list = Array.isArray(info.cls) ? info.cls : String(info.cls).split(/\s+/);
    for (const c of list) if (c) el.classList.add(c);
  }

  if (info.text !== undefined) {
    if (typeof info.text === "string") el.textContent = info.text;
    else el.appendChild(info.text);
  }

  if (info.attr) {
    for (const [k, v] of Object.entries(info.attr)) {
      if (v === null || v === undefined || v === false) el.removeAttribute(k);
      else el.setAttribute(k, String(v));
    }
  }

  if (info.title !== undefined) el.setAttribute("title", info.title);
  if (info.type !== undefined) el.setAttribute("type", info.type);
  if (info.placeholder !== undefined) el.setAttribute("placeholder", info.placeholder);
  if (info.value !== undefined) el.setAttribute("value", info.value);
  if (info.href !== undefined) el.setAttribute("href", info.href);
  if (info.style !== undefined) el.style.cssText = info.style;
}

/**
 * 创建一个元素（模块级显式函数，对齐 Obsidian 全局 `createEl` 的签名）。
 * 传 `parent` 时自动挂到父节点上；`info.prepend` 则插到最前面。
 */
export function createEl<K extends keyof HTMLElementTagNameMap>(
  tag: K, info?: TnElementInfo, parent?: Node
): HTMLElementTagNameMap[K];
export function createEl(tag: string, info?: TnElementInfo, parent?: Node): HTMLElement;
export function createEl(tag: string, info?: TnElementInfo, parent?: Node): HTMLElement {
  const el = document.createElement(tag);
  applyElementInfo(el, info);

  const target = (info && (info as TnElementInfo & { parent?: Node }).parent) || parent;
  if (target) {
    if (info && info.prepend) target.insertBefore(el, target.firstChild);
    else target.appendChild(el);
  }
  return el;
}

/** 标准 DOM 版 addClass；返回 el 方便链式 */
export function addClass(el: Element, ...classes: string[]): Element {
  for (const c of classes) {
    // Obsidian 允许一次传 "a b" 这种空格串，classList.add 会抛错，先拆开
    for (const part of String(c).split(/\s+/)) if (part) el.classList.add(part);
  }
  return el;
}

export function removeClass(el: Element, ...classes: string[]): Element {
  for (const c of classes) {
    for (const part of String(c).split(/\s+/)) if (part) el.classList.remove(part);
  }
  return el;
}

export function toggleClass(el: Element, classes: string | string[], value?: boolean): Element {
  const list = Array.isArray(classes) ? classes : String(classes).split(/\s+/);
  for (const c of list) if (c) el.classList.toggle(c, value);
  return el;
}

export function setText(el: HTMLElement, val: string | DocumentFragment): void {
  if (typeof val === "string") el.textContent = val;
  else el.replaceChildren(val);
}

/** Obsidian 的 `.empty()`：清空所有子节点 */
export function empty(el: Node): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Obsidian 的 `.detach()`：把自己从父节点摘掉 */
export function detach(el: Node): void {
  if (el.parentNode) el.parentNode.removeChild(el);
}

/** Obsidian 的 `.onClick(cb)`：等价于 addEventListener("click", cb) */
export function onClick(el: Element, cb: (ev: MouseEvent) => void): void {
  el.addEventListener("click", cb as EventListener);
}

/**
 * 安装到原型上的方法集。
 *
 * 注意 `createEl` 的 `this` 是父元素 —— 这是 Obsidian 扩展方法的语义：
 * `parent.createEl("div", {...})` 会**自动 append 到 parent 上**并返回新元素。
 * 漏掉 append 是整个垫片最容易写错的一处。
 */
const PROTO_HELPERS: Record<string, Function> = {
  createEl(this: Node, tag: string, info?: TnElementInfo) {
    const el = document.createElement(tag);
    applyElementInfo(el, info);
    if (info && info.prepend) this.insertBefore(el, this.firstChild);
    else this.appendChild(el);
    return el;
  },
  createDiv(this: Node, info?: TnElementInfo) {
    return PROTO_HELPERS.createEl.call(this, "div", info);
  },
  createSpan(this: Node, info?: TnElementInfo) {
    return PROTO_HELPERS.createEl.call(this, "span", info);
  },
  addClass(this: Element, ...classes: string[]) { addClass(this, ...classes); },
  addClasses(this: Element, classes: string[]) { addClass(this, ...classes); },
  removeClass(this: Element, ...classes: string[]) { removeClass(this, ...classes); },
  removeClasses(this: Element, classes: string[]) { removeClass(this, ...classes); },
  toggleClass(this: Element, classes: string | string[], value: boolean) {
    toggleClass(this, classes, value);
  },
  hasClass(this: Element, c: string) { return this.classList.contains(c); },
  setText(this: HTMLElement, val: string | DocumentFragment) { setText(this, val); },
  empty(this: Node) { empty(this); },
  detach(this: Node) { detach(this); },
  onClick(this: Element, cb: (ev: MouseEvent) => void) { onClick(this, cb); }
};

let installedTargets = 0;

/**
 * 幂等安装兼容层。
 *
 * @param force 传 true 时**覆盖**已有实现。默认 false —— 这是刻意的：
 *   Obsidian 自己就提供了这些扩展，覆盖它们等于改写整个插件的行为，
 *   违反「Obsidian 侧零变化」。`force` 只给测试用（验证我们自己的实现）。
 * @returns 本次实际安装的方法数
 */
export function installDomHelpers(force = false): number {
  if (typeof HTMLElement === "undefined") return 0;

  const targets: object[] = [HTMLElement.prototype];
  // Obsidian 也在 DocumentFragment 上挂了 createEl，预览 / 弹窗可能用到
  if (typeof DocumentFragment !== "undefined") targets.push(DocumentFragment.prototype);

  let n = 0;
  for (const target of targets) {
    const proto = target as Record<string, unknown>;
    for (const [name, fn] of Object.entries(PROTO_HELPERS)) {
      if (force || typeof proto[name] !== "function") {
        proto[name] = fn;
        n++;
      }
    }
  }
  installedTargets = n;
  return n;
}

/** 上一次 installDomHelpers 实际装了几个方法（排障用） */
export function lastInstalledCount(): number {
  return installedTargets;
}
