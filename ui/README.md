# ui/ — 三端共享的浏览器基础设施（DEC-024）

`core/` 是「怎么算」，`sources/` 是「从哪拿」，`ui/` 是**「怎么在浏览器里画、怎么算日期」**。
这一层让同一份渲染代码能跑在 Obsidian、Blinko、思源三个宿主里。

## 边界

| 层 | 允许 | 禁止 |
|---|---|---|
| `core/` | 纯函数、纯计算 | DOM、`window.*`、`import obsidian` |
| `ui/` | 标准 DOM API、浏览器对象 | `import obsidian`、读 `window.*` 宿主全局 |
| `sources/` | HTTP、数据映射 | `import obsidian` |
| `hosts/` + `apps/` | 宿主 API、装配 | — |

`ui/` 不认识任何具体宿主。宿主在 `onload` 里负责两件事：

```ts
import { installDomHelpers, setMomentFactory } from "./ui";

installDomHelpers();                  // ① 补齐 DOM 扩展（Obsidian 里是 no-op）
setMomentFactory(window.moment);      // ② 注入日期实现
```

Blinko / 思源宿主把第二行换成 `setMomentFactory(nativeMoment)`。

> `main.ts` 里仍有 `window.innerWidth` / `addEventListener` / `removeEventListener` /
> `setTimeout`，这些是**标准浏览器 API**，三个宿主都是浏览器环境、都原生具备，
> 不属于宿主注入的全局，无需收口。真正收口的是 `window.moment`（只有 Obsidian 有）。

## 目录

| 文件 | 作用 |
|---|---|
| `dom.ts` | 标准 DOM 版 `createEl` / `addClass` / `empty` / `detach` / `onClick` 等，以及 `installDomHelpers()` |
| `date.ts` | `MomentLike` 契约、`moment()` 工厂、`setMomentFactory()` / `hasMomentFactory()` |
| `native-moment.ts` | 零依赖的 moment 兼容实现 `nativeMoment`，给没有 moment 的宿主用 |
| `view.ts` | **三宿主共用的渲染引擎 `TimenoteRenderer`**（DEC-025）：时间轴 / 日历全部渲染逻辑，只认 `HostAdapter` |
| `index.ts` | 统一出口（含 `TimenoteRenderer`） |
| `esbuild.config.mjs` | 编出 `ui/index.mjs`（ESM，只给测试 import，已 gitignore） |

## 为什么 DOM 用「兼容垫片」而不是改写 222 处调用

`main.ts` 里有 222 处 `parent.createEl("div", {...})`，这是 **Obsidian 注入到
`HTMLElement.prototype` 上的扩展**，不是标准 DOM。Blinko / 思源里不存在，视图一渲染就崩。

`installDomHelpers(force = false)` 的处理方式：

- **按方法逐个判断，只在缺失时安装**（`typeof proto[name] !== "function"`）；
- Obsidian 自带全套扩展 → 一个都不装，**行为逐字不变**；
- Blinko / 思源没有 → 自动补上标准 DOM 实现，222 处存量代码一行都不用改；
- 幂等，重复调用返回 0；
- `force = true` 只在测试里用（验证我们自己的实现）。

⚠️ **最容易写错的一处**：原型版 `createEl` 的 `this` 是父元素，必须**自动 append
到 this 上并返回新元素**。漏掉 append，整个 UI 会变成空的，而且不报错。

新代码请优先用模块级显式函数（不碰原型）：

```ts
import { createEl, addClass } from "./ui";
const box = createEl("div", { cls: ["a", "b"], text: "hi" }, parent);
addClass(box, "is-active");
```

长期目标是把存量调用逐步迁到显式函数，最终不再需要原型垫片。这是已登记的技术债，
不急于一次性完成。

## 日期：宿主注入，不读全局

`window.moment` 是 Obsidian 注入的全局。`ui/date.ts` 只定义契约和工厂：

```ts
setMomentFactory(nativeMoment);   // 注入
moment("2026-11-11").format("YYYY年MM月DD日");
```

没注入时 `moment()` 抛**明确错误**（"未注入日期实现…"），不会退化成
`undefined is not a function`。模块顶层不许调用 `moment()` —— 注入发生在 `onload`，
顶层调用会早于装配。

### ⚠️ NativeMoment 必须复刻 moment 的可变语义

`add()` / `startOf()` / `endOf()` / `year(n)` / `month(n)` / `date(n)` 在 moment 里
都是**改自己并返回自己**，只有 `clone()` 产生新对象。`main.ts` 的 `navigatePeriod()`
直接 `this.currentDate.add(...)` 再渲染，写成不可变会让导航整个失灵。

另外两个容易错的地方：

- **月末夹取**：`1/31 + 1 月 = 2/28`，闰年 `2024/1/31 + 1 月 = 2/29`，
  `2024/2/29 + 1 年 = 2025/2/28`。直接用 `Date.setMonth()` 会溢出到 3 月。
- **一周之始**：中文环境下 `isoWeek` 与 `week` 都按**周一**开始
  （Obsidian 在 zh-cn locale 下 `startOf("week")` 也是周一）。

星期名 / 月名固定中文（两个新宿主没有 Obsidian 的 locale 体系）。需要多语言时
给 `nativeMoment` 加一个 locale 参数，另开 DEC。

## 构建与测试

```bash
npm run build:ui   # ui/index.ts → ui/index.mjs
npm run test:ui    # 69 项：DOM 垫片幂等性 / createEl 语义 / 工厂注入 / NativeMoment 行为 / 分层边界
```

`npm run build` 会按 `tsc → build:core → build:sources → build:ui → 主产物` 顺序执行，
顺序不可颠倒（测试依赖前三个 ESM 产物）。
