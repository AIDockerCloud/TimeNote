# 项目核心定义 (PROJECT.md)

## 项目定位与宗旨
- **项目名称**：**TimeNote**（仓库 `AIDockerCloud/TimeNote`；`manifest.json` 显示名 `TimeNote`、`id` 与 Obsidian 插件目录 `timenote`、`author=AIDockerCloud`，见 DEC-004 / DEC-006）
- **核心定位**：面向 Obsidian **周期日记（Daily Notes）** 的时间轴与全周期日历视图插件。以日记中带时间戳的行与待办为唯一数据源，在精确时间点上呈现笔记灵感与任务，**不改变用户既有的记录习惯**。

## 核心目标 (Scope)
- 解析日记行内的 `14:00` / `14:00:31` / `14:00-15:30` 等时间表达，排布到时间网格，支持并发重叠事件分列避让；
- 提供 7 种视图：日 / 3 天 / 周 / 月 / 季度 / 年 / 时间线，含周期与单日双轨翻页导航；
- 无时间的行与任务归入当天「全天栏」，按日期独立分列；主列表项收纳缩进子项，可展开并跳回原笔记行；
- 双向联动：日历内勾选实时回写 `[ ]` ↔ `[x]`、点击卡片定位高亮原日记行、点击空白时间槽或「+ 记一条」插入新记录；
- 可配置日记根目录、Blinko 聚合、默认视图、时间轴范围、周起始日、快速记录章节等。

## 明确非目标 (Non-Goals)
- 不引入独立任务文件、外部数据库或自定义数据格式，不替代官方 Periodic Notes / Tasks 插件的数据模型；
- 不做云端同步、多端协作、账号体系与权限管理；
- 不改动用户日记的正文语义，仅做解析展示与**最小化**回写；
- 不引入**运行时** npm 依赖（devDependencies 仅用于类型检查与打包构建）；
- 暂不建自动化测试套件与 CI 发布流水线（[未决]，见 DEC-005 影响）。

## 不得违反的硬约束 (Hard Boundaries)
1. **源码单一真源**：`main.ts` 是唯一源码；`main.js` 由 esbuild 生成且必须入库，以保留零构建安装能力；提交前必须 `npm run build` 保证两者同步。
2. **零构建可加载**：`manifest.json` + `main.js` + `styles.css` 三件套始终齐全，`main.js` 为 CJS 且 `obsidian` 保持 external，不引入运行时依赖。
3. **稳定标识**：`manifest.json` 的 `id` 固定为 `timenote`（DEC-004 已确认），对应 `<vault>/.obsidian/plugins/timenote/`；变更会使既有用户的 `data.json` 失效，须经人类批准并登记 ADR。
4. **用户数据最小侵入**：写回日记仅限目标行，禁止重写、重排整篇笔记或删除用户内容；`isDesktopOnly=false` 要求实现保持移动端兼容。
5. **协议与产品解耦**：PCMP 治理文件属于工程管理层，严禁作为业务逻辑或运行时依赖进入产品源码。
6. **变更需批准**：项目定位、插件标识、日记数据源格式、构建链与依赖主版本的变更，须经人类批准并登记 ADR。

## 交付与运行形态
- 安装：三件套放入 `<vault>/.obsidian/plugins/timenote/` 后在 Obsidian 中启用，显示名 `TimeNote`。
- 开发：`npm install` → `npm run dev`（watch）或 `npm run build`（类型检查 + 构建）；TypeScript 7 + esbuild 0.28，类型检查为渐进式（`strict: false`）。
- 宿主要求：`minAppVersion 1.0.0`；设置持久化走 `loadData()` / `saveData()`，`data.json` 不入库。
- 现状：[事实] 已具备 `package.json` / `tsconfig.json` / `esbuild.config.mjs` / `package-lock.json`；仍无 `versions.json`、LICENSE、自动化测试，发布到社区插件市场前需补齐。
