// sources/index.ts — 数据源统一出口
//
// 三端共用的「数据从哪来」层。core/ 是「怎么算」，sources/ 是「从哪拿」，
// 两者彻底分开：宿主只认 NoteSource 接口，不关心底下是 vault、HTTP 还是块树。

// 类型用 export type —— tsconfig 开了 isolatedModules，
// 直接 re-export 类型会在编译期报错（TS1205）。
export type { NoteSource, NoteEntry } from "./types";
export { READONLY_REJECT } from "./types";
export { MemosSource } from "./memos";
export type { MemosConfig } from "./memos";
export { BlinkoSource } from "./blinko";
export type { BlinkoConfig } from "./blinko";
export { AggregateSource } from "./aggregate";
export type { AggregateResult } from "./aggregate";
// 本地文件存储抽象 + 第一个可写来源（DEC-026）
export { MemoryFileStore } from "./fs";
export type { NoteFile, NoteFileStore } from "./fs";
export { DailySource, addDays } from "./daily";
export type { DailySourceConfig, DailySourceSettings } from "./daily";
// 本地 Blinko 导出 md（DEC-027）：与走 API 的 BlinkoSource 是两回事，
// 但 source 都是 "blinko" —— 区别在可写性，见 blinko-local.ts 文件头
export { BlinkoLocalSource, defaultBlinkoPathMatch } from "./blinko-local";
export type { BlinkoLocalSourceConfig } from "./blinko-local";
// 来源元数据：渲染层靠它区分配色 / 徽标 / 只读，不再硬编码 source 字符串
export {
  sourceMeta,
  isExternalSource,
  sourceBadge,
  sourceLabel,
  sourceCssClass,
  externalSourceIds
} from "./meta";
export type { SourceMeta } from "./meta";
