// apps/bootstrap.ts — 三宿主共用的装配入口（DEC-025）
//
// 任何宿主接入 TimeNote 只需要两行：
//
//   prepareHostEnvironment({ momentFactory: hostMoment });  // onload 时调一次
//   const renderer = mountTimeNote(rootEl, host);           // 每个视图调一次
//
// 这两行把 DEC-024 的两处平台耦合（DOM 垫片 / 日期注入）与 DEC-025 的
// HostAdapter 装配串成一条完整链路，三个 apps 不再各写一遍。
import { installDomHelpers, setMomentFactory, nativeMoment, TimenoteRenderer } from "../ui/index";
import type { HostAdapter } from "../hosts/types";
import type { MomentFactory } from "../ui/date";

export interface BootstrapOptions {
  /**
   * 宿主提供的日期实现。
   *   · Obsidian → window.moment（沿用宿主自带的 moment 与其 locale）
   *   · Blinko / 思源 / Web → 不传，用零依赖 nativeMoment
   */
  momentFactory?: MomentFactory | ((...args: any[]) => any);
  /**
   * 是否强制覆盖已有的 DOM 扩展。**默认 false，且生产环境一律不要开 true**：
   * Obsidian 自带全套 `.createEl()`，覆盖它等于改写整个插件的行为（DEC-024）。
   */
  forceDomHelpers?: boolean;
}

/**
 * 进程级初始化：宿主 onload / 启动时调用一次，早于任何视图创建。
 * 幂等，重复调用安全。
 */
export function prepareHostEnvironment(opts: BootstrapOptions = {}): void {
  installDomHelpers(opts.forceDomHelpers === true);
  setMomentFactory(opts.momentFactory ?? nativeMoment);
}

/**
 * 把共享渲染引擎挂到宿主提供的容器上。
 * @returns renderer，宿主负责转发生命周期（onOpen / onClose / renderView）
 */
export function mountTimeNote(root: HTMLElement, host: HostAdapter): TimenoteRenderer {
  return new TimenoteRenderer(root, host);
}
