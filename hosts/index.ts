// hosts/index.ts — 宿主层统一出口（给测试与 apps 用）
//
// ⚠️ 刻意不导出 hosts/obsidian/adapter.ts：它 `import "obsidian"`，
// 而 obsidian 包只有类型定义、没有运行时实现，打进测试用的 ESM 产物会失败。
// Obsidian 适配器由 apps/obsidian 直接引用。
export type { HostAdapter, TimenoteSettings, HostId } from "./types";
export { createMemoryHostAdapter, REFERENCE_SETTINGS } from "./memory/adapter";
export type { MemoryHostState, MemoryHostOptions } from "./memory/adapter";

// 日记模板读取（DEC-028）。该文件不 import obsidian、不读任何全局，
// 宿主对象全靠注入，所以能安全地打进平台无关的 ESM 产物给测试 import。
export {
  DEFAULT_DAILY_NOTE_FORMAT,
  resolveTemplatePath,
  renderTemplateVariables,
  readObsidianDailyNotesConfig,
  readTemplateFile,
  createObsidianTemplateResolver
} from "./daily-note-template";
export type {
  DailyNotesConfig,
  TemplateRenderOptions,
  TemplateResolverDeps
} from "./daily-note-template";
