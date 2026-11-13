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
| `shared/` | 思源 / Blinko 共用层（DEC-032）：纯 DOM 弹窗、设置面板、`createSharedHostAdapter()` 骨架、行级 diff |
| `siyuan/` | 思源插件入口 + `plugin.json` + `i18n/` + 打包脚本 → `dist/siyuan/package.zip` |
| `blinko/` | Blinko 插件入口 + `plugin.json` + 打包脚本 → `dist/blinko/release.zip` |

## 三宿主状态（如实标注）

| 宿主 | 入口位置 | 状态 | 说明 |
|---|---|---|---|
| **Obsidian** | 仓库根 `main.ts` + `manifest.json` + `esbuild.config.mjs` | ✅ **可交付** | `TimenoteView extends ItemView` 薄壳 → `TimenoteRenderer`；`hosts/obsidian/adapter.ts` 实现全部宿主能力。三件套交付链路不变 |
| **Blinko** | `apps/blinko/` + `hosts/blinko/` | ✅ **已实现（DEC-032）** | SystemJS `System.register` 单文件 + `plugin.json`；`addToolBarIcon` → `showDialog` 全屏日历；`renderSettingPanel` 设置页。本地记录直接读写原生 note（tRPC），远程来源只读。⚠️ **尚未真机验证** |
| **思源** | `apps/siyuan/` + `hosts/siyuan/` | ✅ **已实现（DEC-032）** | CJS `index.js` + `plugin.json` + `i18n/`；`extends require("siyuan").Plugin`，顶栏图标 → 页签。本地记录写进原生每日笔记文档的块（内核 `/api/*`），远程来源只读。⚠️ **尚未真机验证** |
| **memos** | ❌ 不做 | 已排除（DEC-023） | memos 没有前端插件体系，只作为 `sources/memos.ts` 数据源被聚合 |
| **Web（可选）** | `apps/web/`（未建） | 🧪 可立即起步 | `hosts/memory/adapter.ts` + `bootstrap.ts` + `styles.css` 就能跑一个独立演示页，不需要任何后端 |

### DEC-032 补齐了两个入口（2026-11-12）

用户裁定「**宿主原生数据**」+「**暂时没有可用真机**」，本轮按官方源码核实后落地：

- **数据不落插件私有文件**：思源把每日笔记文档 ↔ 虚拟 `YYYY-MM-DD.md`（块 ↔ 行）映射，读写全走内核 API；Blinko 把一天 notes ↔ 虚拟 md（note ↔ 行）映射，走 `window.Blinko.api` 的 tRPC。两者都复用 `sources/daily.ts` 的全部写方法，只动变化的那一个实体（行级 diff 保住块 id / note id）。
- **`HostNoteService`（`sources/host-service.ts`）** 装配 `DailySource` + `AggregateSource` + memos / 远程 Blinko 只读聚合 + 60 秒缓存；**刻意不从 `sources/index.ts` 导出**，否则会把顶层常量打进 Obsidian 的 `main.js`。
- **两个入口都不改渲染层**：`prepareHostEnvironment()` 注入 `nativeMoment` + DOM 垫片，`mountTimeNote(root, host)` 挂 `TimenoteRenderer`；弹窗 / 设置页用 `apps/shared/` 的纯 DOM 实现，不继承 Obsidian `Modal` / `PluginSettingTab`。
- **产物**：`npm run build:plugins` → `dist/siyuan/package.zip` 与 `dist/blinko/release.zip`（`dist/` 已 gitignore）。Blinko 安装器要求 Release 资产名固定 `release.zip`；思源首版不走集市（集市要求插件名 == 仓库名），需手动解压安装。详见 [思源 README](siyuan/README.zh-CN.md) / [Blinko README](blinko/README_zh.md)。
- **如实标注**：两个插件均**未在真机验证**（本机无实例）。从 `v1.1.3-beta.1` 起 `.github/workflows/release.yml` 会自动把两个 zip 挂到 Release（DEC-034）；但安装器通常只读 Latest，预发布阶段需手动下载资产，装完请按各自 README 的「验收清单」逐项试。
- **Obsidian 零回归**：`npm run build` 后 `git diff --stat -- main.js` 必须为空。

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
npm run build          # 含 build:core / sources / ui / hosts / apps
npm run build:plugins  # 两个新宿主插件包 → dist/siyuan/package.zip + dist/blinko/release.zip
npm run test:hosts     # 51 项：契约完整性、零宿主耦合、内存宿主、bootstrap 真跑
npm run test:platforms # 164 项：新宿主服务 / 虚拟文件层 / diff / 加载期冒烟 / zip CRC
npm test               # 951 项（18 套）
```

`test:hosts` 里用一份**完全没有 Obsidian 依赖**的内存宿主实例化了
`TimenoteRenderer`，跑通导航、过滤、生命周期与跳转委托 ——
这是「共享渲染层」的可执行证据，不只是静态断言。
