---
pcmp_version: "2.2"
revision: 3
updated: 2026-11-08
---

# 架构与技术决策记录 (DECISIONS.md — Lite)

> 规则：未经人类确认的决策一律标 `Proposed`；推翻已 Accepted 决策须新开 DEC 并写明 `Supersedes`。

## DEC-001 — 引入 PCMP v2.2 作为项目上下文管理协议
日期: 2026-11-08 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-08 会话中明确指令「利用 https://github.com/Inverstar/PCMP/tree/main 进行初始化」
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 上游协议发布新主版本，或项目治理需求发生实质变化时复审
- 背景 (Context): TimeNote 处于早期开发，上下文散落在 README 与代码注释中，跨会话接管容易丢失硬约束与决策链。
- 决策 (Decision): 将 PCMP v2.2 协议原版（中 / 英）落到项目根目录，并建立 `ai/` 上下文体系；Markdown 为唯一权威，派生索引可选可弃。
- 理由 (Reason): PCMP 与 IDE / 模型无关、零外部依赖，适合单人插件项目；能把硬约束、状态与决策沉淀为可恢复上下文。
- 备选方案 (Alternatives): 仅靠 README（缺状态与决策链）；引入数据库或在线协作文档（增加依赖与治理成本）。
- 影响 (Consequences): 新增若干治理文档；AI 接管须遵循必读顺序；协议文件不得进入产品运行时代码。

## DEC-002 — 采用 PCMP Lite 档位（极简 4 件套）
日期: 2026-11-08 | 状态: Proposed
- 确认来源: 无（待 inverstar 确认）
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 项目转为多人协作、多阶段长期交付，或需要独立 TASK.md / 会话归档时升级为 Full 档位
- 背景 (Context): [事实] 当前为单人、单仓库的原型期插件，直接上 Full 会造成治理通胀。
- 决策 (Decision): 采用 Lite：`AGENTS.md` + `ai/PROJECT.md` + `ai/STATE.md`（含活动任务）+ `ai/DECISIONS.md`，免建 TASK / PLAN / ISSUES / sessions。
- 理由 (Reason): 协议 §3.2 明确单人项目、原型验证适用 Lite；需要时可平滑升级为 Full。
- 备选方案 (Alternatives): 直接采用 Full（文档维护成本与当前规模不匹配）。
- 影响 (Consequences): 状态与任务合并维护，历史轨迹主要依赖 Git 提交信息；跨会话恢复依赖 STATE.md 的及时更新。

## DEC-003 — 现阶段维持零构建、CommonJS 单文件形态
日期: 2026-11-08 | 状态: Superseded
- 确认来源: 无（提出时未经确认）
- Supersedes: 无
- Superseded-by: DEC-005
- 复审触发条件 (Review Trigger): 已由用户 2026-11-08 21:49 指令触发复审并被 DEC-005 取代，不再复审
- 背景 (Context): [事实] 当时仓库无 `package.json`、无构建与测试配置，`main.js` 是可被 Obsidian 直接加载的 CommonJS 产物。
- 决策 (Decision): 曾提议维持三件套直提形态，不引入构建链。
- 理由 (Reason): 当时零构建让安装与调试成本最低。
- 备选方案 (Alternatives): 立即引入 TypeScript + esbuild + 测试框架。
- 影响 (Consequences): 该提议未被采纳；用户随后明确要求引入构建链，见 DEC-005。

## DEC-004 — 统一插件标识为 timenote / TimeNote
日期: 2026-11-08 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-08 21:29 会话中指令「统一为 timenote 吧，展示 TimeNote，但是 obsidian 插件目录是 timenote」
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 插件已在 Obsidian 社区市场发布并产生外部用户后，若需再次变更 id 必须复审（会破坏既有 data.json）
- 背景 (Context): [事实] 原 `manifest.json` 为 `id=time-notes` / `name=Time Notes (时间笔记)`，与仓库名 `TimeNote` 及用户称呼不一致；JS / CSS 内部命名空间亦为 `time-notes-*`，三套标识长期分裂。
- 决策 (Decision): `id` 与 Obsidian 插件目录统一为 `timenote`（`<vault>/.obsidian/plugins/timenote/`），显示名统一为 `TimeNote`；同时把 view type、CSS 类名与 JS 类名前缀统一为 `timenote` / `Timenote` 命名空间；中文功能描述「时间笔记」保留。
- 理由 (Reason): 插件尚未发布、无外部用户，改 id 无兼容成本；一次性统一避免目录名、内部命名空间与显示名长期不一致。
- 备选方案 (Alternatives): 仅改 manifest、保留内部 `time-notes` 命名空间（改动最小但标识仍分裂）；保留 `id=time-notes` 只改显示名（插件目录与仓库名仍不一致）。
- 影响 (Consequences): 本地若已有旧插件目录 `time-notes/` 需手动改名为 `timenote/` 并迁移 `data.json`；设置数据键与业务逻辑不变；`author` 字段另行由 DEC-006 授权改为 `AIDockerCloud`。

## DEC-005 — 引入 TypeScript + esbuild 构建链
日期: 2026-11-08 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-08 21:49 会话中指令「引入 TypeScript + esbuild 构建链、改成 AIDockerCloud」
- Supersedes: DEC-003
- Superseded-by: 无
- 复审触发条件 (Review Trigger): TypeScript / esbuild 主版本升级、决定不再把 `main.js` 入库（改为 CI 生成），或引入自动化测试 / 发布流水线时复审
- 背景 (Context): [事实] 原仓库只有可直接加载的 `main.js`（1922 行 JS），无依赖声明、无类型检查、无构建；首次 `tsc` 检查暴露 244 个错误（234 个动态实例属性 TS2339、6 个 `DomElementInfo.style` TS2353、4 个 `content` TS2551）。
- 决策 (Decision): 把源码迁到 `main.ts`（ESM + `import ... from "obsidian"` + `export default`），用 esbuild 产出 CJS `main.js` 并**继续入库**以保留零构建安装；新增 `package.json` / `tsconfig.json` / `esbuild.config.mjs` / `package-lock.json`，提供 `dev` / `build` / `typecheck` / `check` 脚本；TS7 使用 `moduleResolution: bundler`（`node10` 已移除）；采用渐进类型化（类索引签名 + DOM 事件断言 + 全局扩展 `DomElementInfo.style`），产物不压缩便于审阅与 diff。
- 理由 (Reason): 一次把 1922 行 JS 全量强类型化成本过高且易引入回归；渐进方案既不改变运行时行为，又立即获得类型检查、可复现构建与依赖锁定，同时不破坏现有三件套安装方式。
- 备选方案 (Alternatives): 一次性重写为严格类型 TS（工作量大、回归风险高）；`main.js` 不入库仅由 CI 构建（破坏零构建安装）；仅加 `@ts-nocheck`（类型检查形同虚设）。
- 影响 (Consequences): 新增 4 个 devDependencies，`node_modules/` 约 53 MB（不入库）；`main.js` 变为生成文件，提交前必须先 `npm run build`；类型检查已通过但 `strict: false` + 索引签名意味着类型安全仍有限；未引入运行时依赖与自动化测试。

## DEC-006 — manifest author 统一为 AIDockerCloud
日期: 2026-11-08 | 状态: Accepted
- 确认来源: inverstar 于 2026-11-08 21:49 会话中指令「引入 TypeScript + esbuild 构建链、改成 AIDockerCloud」
- Supersedes: 无
- Superseded-by: 无
- 复审触发条件 (Review Trigger): 项目归属、发布主体或署名策略变更时复审
- 背景 (Context): [事实] `manifest.json` 的 `author` 原为 `Antigravity`（生成代码的工具名），与仓库 owner `AIDockerCloud` 不一致。
- 决策 (Decision): `manifest.json` 与 `package.json` 的 `author` 统一为 `AIDockerCloud`。
- 理由 (Reason): 署名应与仓库归属一致；该字段仅用于展示，不影响 `id` 与用户 `data.json`。
- 备选方案 (Alternatives): 保留 `Antigravity`（署名与归属割裂）；改用个人名（用户未指定）。
- 影响 (Consequences): 仅元数据变化，无运行时影响；DEC-004 中「author 未获授权修改」的记录已由此决策补齐。
