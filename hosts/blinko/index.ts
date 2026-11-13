// hosts/blinko/index.ts — Blinko 宿主层统一出口（DEC-032）
// 不 import blinko 运行时包（window.Blinko 由入口注入），可编成 platform:neutral ESM 供测试。
export { BlinkoNoteApi } from "./api";
export type { BlinkoNote, BlinkoApiLike, ListNotesInput } from "./api";
export {
  BlinkoNoteStore, dateOfPath, localStamp, timenoteMeta, timePrefixOf,
  parseVirtualLine, buildNoteContent, timestampFor, noteToLines, noteDate
} from "./note-store";
export type { BlinkoNoteStoreConfig, LocalStamp, VirtualLine } from "./note-store";
export { createBlinkoHostAdapter } from "./adapter";
export type { BlinkoHostDeps } from "./adapter";
