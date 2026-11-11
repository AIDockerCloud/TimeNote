# core/ — 平台无关核心

三端（Obsidian / Blinko / 思源）共用的**全部纯逻辑**。这里的每个函数都不许依赖
DOM、宿主 API 或任何全局对象 —— 这是「一份核心跑三端」的前提。

## 目录

| 文件 | 内容 | 来源决策 |
|---|---|---|
| `scale.ts` | 弹性时间轴 `buildTimeScale`、块布局 `layoutTimeBlockClusters`、时间点线 `layoutPointLines` | DEC-012 / DEC-013 / DEC-018 |
| `time.ts` | 秒↔HH:mm 换算、吸附、边缘命中、时长格式化 | DEC-011 / DEC-014 |
| `tints.ts` | 按天自动配色 `assignDayTints`、显式配色通道 | DEC-016 |
| `parse.ts` | 日记行解析 `parseLine` | — |
| `crossday.ts` | 跨天改写 `rewriteEntryLineTime`、子项收集、新增类型判定 | DEC-022 |
| `section.ts` | 快速记录插入标题解析 `parseQuickAddSection` | DEC-020 |

## 构建与测试

```bash
npm run build:core   # core/index.ts → core/index.mjs（ESM，给测试 import 用）
npm test             # 全部测试
```

测试脚本一律 `import` `core/index.mjs` 取真实实现（见 `scripts/dev/lib/elastic.mjs`
的 `loadCore()`），**不再**从源码里按位置切片 —— esbuild 会丢弃源码注释，
位置切片在多文件下必然错位（DEC-023 背景 ④）。

## ⚠️ 搬迁纪律（2026-11-11 实测教训）

把实现从 `main.ts` 搬进本目录时，**逐字搬运，不要顺手"优化"**。

实例：`assignDayTints` 的超容量分支里，原实现比较的是
`tintCssOf(c) !== prev`（CSS 色值字符串）。搬迁时曾被改成 `c !== prev`
（调色板索引）—— `prev` 是 CSS 字符串、索引是数字，**恒不相等**，
于是「相邻块不撞色」这道防线静默失效，当天第 9 个块与第 8 个块同色。
该缺陷由 `test-block-tints.mjs` 的「超过 8 个块时相邻不撞色」断言当场抓住。

教训：搬迁属于「行为必须零变化」的操作，任何"看起来更合理"的改写都要单独提出、
单独评审，不能混在搬迁里悄悄做。
