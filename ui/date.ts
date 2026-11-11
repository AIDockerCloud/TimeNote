// ui/date.ts — 平台无关的日期层（DEC-024）
//
// 背景：main.ts 有 20 行直接调 `window.moment(...)`，另有几十处在这类对象上
// 调 `.format()` / `.clone()` / `.add()` / `.startOf()` 等。moment 是 Obsidian
// 注入到 window 上的全局，Blinko / 思源宿主里根本不存在 —— 这是三端共用的
// 第二道拦路虎。
//
// 策略：**宿主注入，而不是全局查找**。
//   · 这里只定义契约（MomentLike）和工厂（moment()）；
//   · Obsidian 宿主在 onload 里 `setMomentFactory(window.moment)`；
//   · Blinko / 思源宿主注入 `nativeMoment`（见 ui/native-moment.ts，零依赖）；
//   · 没注入就抛明确错误，绝不静默退化成「undefined is not a function」。
//
// 为什么不加 dayjs：项目红线 6 要求增删依赖先 ADR + 人类确认，而且 dayjs
// 默认没有 `isSameOrBefore` / `isoWeek` / `quarter`，还得挂插件才能对齐语义。
// 先用契约收口，把「用哪个实现」变成宿主的自由。

/** main.ts 实际用到的 moment 方法面（照抄，不多不少） */
export interface MomentLike {
  /** 支持 YYYY / MM / DD / HH / mm / ss 及中文模板（如 "YYYY年"） */
  format(pattern: string): string;
  clone(): MomentLike;
  /** ⚠️ moment 的 add 是**可变**的：改自己并返回自己，不是返回新对象 */
  add(amount: number, unit: string): MomentLike;
  subtract(amount: number, unit: string): MomentLike;
  startOf(unit: string): MomentLike;
  endOf(unit: string): MomentLike;
  isSame(other: MomentLike, unit?: string): boolean;
  isSameOrBefore(other: MomentLike, unit?: string): boolean;
  isSameOrAfter(other: MomentLike, unit?: string): boolean;
  isBefore(other: MomentLike, unit?: string): boolean;
  isAfter(other: MomentLike, unit?: string): boolean;
  year(): number;
  year(value: number): MomentLike;
  month(): number;
  month(value: number): MomentLike;
  date(): number;
  date(value: number): MomentLike;
  day(): number;
  daysInMonth(): number;
  quarter(): number;
  isoWeek(): number;
  hours(): number;
  minutes(): number;
  seconds(): number;
  /** moment 同时提供单复数别名，main.ts 里 `.hour()` 就在用 */
  hour(): number;
  minute(): number;
  second(): number;
  valueOf(): number;
}

/**
 * 工厂签名。moment 的入参形态很多：`moment()` / `moment("2026-11-11")` /
 * `moment(date)` / `moment("09:30", "HH:mm")`，所以这里放宽成任意参数。
 */
export type MomentFactory = (...args: any[]) => MomentLike;

let factory: MomentFactory | null = null;

/**
 * 由宿主注入日期实现。必须在任何视图创建之前调用（插件 onload 开头）。
 * 重复调用会覆盖前一个实现 —— 测试里靠它在两套实现之间来回切。
 *
 * 参数刻意放宽成「任意函数」：Obsidian 的 `window.moment` 官方类型是完整
 * `Moment`，其 `isSame(inp?: MomentInput, ...)` 等签名与这里的**最小契约**
 * 结构上不兼容（虽然运行时方法面是超集）。让宿主在注入点写一堆 cast 没意义，
 * 由这里统一断言一次即可。
 */
export function setMomentFactory(f: (...args: any[]) => any): void {
  if (typeof f !== "function") throw new Error("setMomentFactory 需要传入一个函数");
  factory = f as MomentFactory;
}

/** 卸载实现（仅测试用；生产环境不要调） */
export function resetMomentFactory(): void {
  factory = null;
}

export function hasMomentFactory(): boolean {
  return factory !== null;
}

/**
 * 创建一个日期对象。等价于原来的 `window.moment(...)`，但实现由宿主决定。
 */
export function moment(...args: any[]): MomentLike {
  if (!factory) {
    throw new Error(
      "TimeNote: 未注入日期实现。宿主必须在 onload 里调用 " +
      "setMomentFactory(window.moment) 或 setMomentFactory(nativeMoment)。"
    );
  }
  return factory(...args);
}
