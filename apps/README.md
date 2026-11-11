# apps/ — 三宿主入口与装配（DEC-025）

一个宿主接入 TimeNote 只需要**两行**，都在 `apps/bootstrap.ts` 里：

```ts
import { prepareHostEnvironment, mountTimeNote } from "./apps/bootstrap";
import { createObsidianHostAdapter } from "./hosts/obsidian/adapter"; // 换成对应宿主

// ① onload / 启动时调一次（进程级）
prepareHostEnvironment({ momentFactory: window.moment }); // 新宿主可省略参数

// ② 每个视图调一次
const renderer = mountTimeNote(rootEl, host);
// 宿主负责转发 onOpen / onClose / renderView
```

装配链路：`prepareHostEnvironment()` 装好 DOM 垫片（DEC-024）与日期实现，
`mountTimeNote()` 把 `ui/view.ts` 的共享渲染引擎挂到宿主容器上，
`HostAdapter` 提供数据与宿主能力。**渲染层零改动**。

## 目录

| 文件 | 作用 |
|---|---|
| `bootstrap.ts` | 三宿主共用的装配函数（被 Obsidian 入口**实际调用**，不是空壳） |
| `index.ts` | 统一出口 |
| `esbuild.config.mjs` | 编出 `apps/index.mjs`（ESM，只给测试 import，已 gitignore） |

## 三宿主状态（如实标注）

| 宿主 | 入口位置 | 状态 | 说明 |
|---|---|---|---|
| **Obsidian** | 仓库根 `main.ts` + `manifest.json` + `esbuild.config.mjs` | ✅ **可交付** | `TimenoteView extends ItemView` 薄壳 → `TimenoteRenderer`；`hosts/obsidian/adapter.ts` 实现全部宿主能力。三件套交付链路不变 |
| **Blinko** | `apps/blinko/`（待建） | ⏳ 契约已就绪 | 需先核实 Blinko 插件的**视图挂载 API** 与打包格式（`plugin.json` / `release/index.js`），再写 `hosts/blinko/adapter.ts`（本地 Blinko 笔记读写） |
| **思源** | `apps/siyuan/`（待建） | ⏳ 契约已就绪 | 需先核实思源 SystemJS 插件的视图容器与 `plugin.json`，再写 `hosts/siyuan/adapter.ts`（块树 ↔ 条目映射，走内核 HTTP API） |
| **memos** | ❌ 不做 | 已排除（DEC-023） | memos 没有前端插件体系，只作为 `sources/memos.ts` 数据源被聚合 |
| **Web（可选）** | `apps/web/`（未建） | 🧪 可立即起步 | `hosts/memory/adapter.ts` + `bootstrap.ts` + `styles.css` 就能跑一个独立演示页，不需要任何后端 |

> **本轮刻意没有创建 `apps/blinko/` 与 `apps/siyuan/` 的空目录。**
> 两个平台的插件挂载方式尚未按官方文档 + 真机核实，先放一个跑不起来的
> 「伪入口」只会重复 DEC-023 第二阶段「层建好了但功能没生效」的错误。
> 契约、装配链路、共享渲染引擎现已全部就绪，核实完 API 后各写一层薄适配即可。

## 新增宿主要做的事

1. 实现 `HostAdapter`（见 `hosts/README.md`），共 14 个方法；
   - 本地笔记读写映射成 `NoteEntry`；聚合来源直接复用 `sources/{memos,blinko}.ts`。
2. 在入口 `onload` 里调 `prepareHostEnvironment()`：
   - 不传 `momentFactory` → 自动用零依赖 `nativeMoment`；
   - 若宿主自带 moment（如 Obsidian）→ 显式传进去，沿用其 locale。
3. 拿到宿主提供的视图容器，调 `mountTimeNote(root, host)`；
4. 转发生命周期：`onOpen()` → `renderer.onOpen()`、`onClose()` → `renderer.onClose()`；
   设置变更 / 保存回调 → `renderer.renderView()`。
5. 打包时把 `styles.css` 原样带上（`.timenote-*` 命名空间三端复用）。

## 验收

```bash
npm run build       # 含 build:core / sources / ui / hosts / apps
npm run test:hosts  # 43 项：契约完整性、零宿主耦合、内存宿主、bootstrap 真跑
npm test            # 509 项
```

`test:hosts` 里用一份**完全没有 Obsidian 依赖**的内存宿主实例化了
`TimenoteRenderer`，跑通导航、过滤、生命周期与跳转委托 ——
这是「共享渲染层」的可执行证据，不只是静态断言。
