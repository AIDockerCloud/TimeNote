// core/index.ts — 平台无关核心的统一出口
//
// 三端（Obsidian / Blinko / 思源）共用的全部纯逻辑都在这里。
// 各宿主从这里 import，不再各自复制一份实现。
//
// 这里的每个函数都不许依赖 DOM、宿主 API 或任何全局对象 ——
// 这样同一份代码才能在 Obsidian 的 Electron 渲染进程、Blinko 的浏览器插件、
// 思源的插件前端里跑出完全一致的结果。

export {
  // 弹性时间轴与块布局
  buildTimeScale,
  estimateBlockNeed,
  layoutTimeBlockClusters,
  ELASTIC_EMPTY_RATIO,
  ELASTIC_CONTENT_RATIO,
  ELASTIC_MIN_EMPTY_ROW,
  ELASTIC_MIN_CONTENT_ROW,
  ELASTIC_ROW_PAD,
  ELASTIC_MAX_BLOCK,
  ELASTIC_MAX_VIEWPORT_SCALE,
  MIN_RENDER_BLOCK_PX,
  // 时间点线
  isPointEntry,
  layoutPointLines,
  POINT_ROW_H,
  POINT_LABEL_GAP,
  POINT_CLUSTER_WINDOW_SEC,
  POINT_SNAP_MINUTES
} from "./scale";

export {
  formatSecondsToTime,
  parseTimeToSeconds,
  addMinutesToTime,
  snapSeconds,
  blockEdgeHit,
  formatDuration,
  getTagColor,
  BLOCK_TOP_GUTTER,
  BLOCK_BOTTOM_GUTTER,
  BLOCK_RULER_W,
  DRAG_SNAP_MINUTES,
  MIN_BLOCK_SECONDS,
  POINT_CREATE_SNAP_MINUTES
} from "./time";

export {
  assignDayTints,
  resolveTint,
  tintCssOf,
  tintEntryKey,
  hashTintKey,
  BLOCK_TINTS
} from "./tints";

export { parseLine } from "./parse";

export {
  normalizeAddType,
  rewriteEntryLineTime,
  collectSubItemLines
} from "./crossday";

export {
  parseQuickAddSection,
  sectionHeaderRegex
} from "./section";
