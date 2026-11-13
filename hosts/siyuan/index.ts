// hosts/siyuan/index.ts — 思源宿主层统一出口（DEC-032）
// 全部代码都不 import "siyuan"（SDK 由入口注入），所以能编成 platform:neutral
// 的 ESM 供测试直接 import。
export { SiyuanKernel, createFetchTransport, parseKernelTime, dateFromDailyNoteAttr } from "./kernel";
export type { KernelTransport, SiyuanDocRef, SiyuanBlock } from "./kernel";
export {
  SiyuanFileStore, dateOfPath, siyuanDocPath, stripIal, diffLines, blocksToLines
} from "./file-store";
export type { SiyuanFileStoreConfig, LineOp } from "./file-store";
export { createSiyuanHostAdapter } from "./adapter";
export type { SiyuanHostDeps } from "./adapter";
