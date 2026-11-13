// apps/shared/index.ts — 新宿主共用层统一出口（DEC-032）
// 编译成 apps/shared/index.mjs 后供测试 import；也供两个宿主入口直接引用。
export { validateQuickAddInput, addTypeLabel, createOverlay, openQuickAddDialog, openSubItemsDialog, openNoteDialog } from "./dialogs";
export type { QuickAddDeps, QuickAddInput, QuickAddValidation, OverlayHandle } from "./dialogs";
export { SETTINGS_GROUPS, SETTINGS_FIELDS, buildSettingsPanel } from "./settings";
export type { SettingsFieldSpec, SettingsFieldType, BuildSettingsOptions } from "./settings";
export { createSharedHostAdapter } from "./host-adapter";
export type { HostGlue } from "./host-adapter";
export { diffLines } from "./line-diff";
export type { LineOp } from "./line-diff";
