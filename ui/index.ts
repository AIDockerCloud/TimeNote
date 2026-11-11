// ui/index.ts — 共享渲染层统一出口（DEC-024）
//
// `core/`  = 纯逻辑（不许碰 DOM / 全局 / 宿主 API）
// `ui/`    = 三端共享的**浏览器基础设施**（DOM 辅助 + 日期抽象）
// `sources/` = 数据从哪来
// `hosts/` / `apps/` = 宿主适配与入口
//
// ui/ 允许碰 DOM，但**不允许** import obsidian、不允许读 window.moment 之类的
// 宿主全局 —— 日期实现必须由宿主通过 setMomentFactory() 显式注入。

export {
  createEl,
  applyElementInfo,
  addClass,
  removeClass,
  toggleClass,
  setText,
  empty,
  detach,
  onClick,
  installDomHelpers,
  lastInstalledCount
} from "./dom";
export type { TnElementInfo } from "./dom";

export {
  moment,
  setMomentFactory,
  resetMomentFactory,
  hasMomentFactory
} from "./date";
export type { MomentLike, MomentFactory } from "./date";

export { nativeMoment } from "./native-moment";

// 共享渲染引擎（DEC-025）。apps/ 三个宿主都从这里取，不要各自复制。
export { TimenoteRenderer } from "./view";
