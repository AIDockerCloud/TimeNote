// ui/native-moment.ts — 零依赖的 moment 兼容实现（DEC-024）
//
// 给 Blinko / 思源宿主用：它们没有 Obsidian 注入的 window.moment。
// 只实现 main.ts 实际用到的方法面（见 ui/date.ts 的 MomentLike），
// 不追求完整复刻 moment —— 追求的是「同一个视图在三端算出同一天、同一格」。
//
// ⚠️ 语义红线：`add()` / `startOf()` / `endOf()` / `year(n)` / `month(n)` /
// `date(n)` 在 moment 里都是**可变**的（改自己并返回自己），只有 `clone()`
// 产生新对象。main.ts 大量依赖这个语义（`navigatePeriod` 直接
// `this.currentDate.add(...)` 再渲染），写成不可变会让导航整个失灵。
//
// 本地化：星期名 / 月名固定中文（用户是中文环境，两个新宿主也没有 Obsidian
// 的 locale 体系）。需要多语言时在这里加一个 locale 参数即可。

import { MomentLike } from "./date";

const WEEKDAYS_SHORT = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const WEEKDAYS_FULL = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const MONTHS_FULL = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** 该月的天数 */
function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

/** 解析入参。main.ts 只用 moment() 与 moment("YYYY-MM-DD")，这里多兼容几种。 */
function parseDate(args: any[]): Date {
  const first = args[0];
  if (first === undefined || first === null) return new Date();
  if (first instanceof Date) return new Date(first.getTime());
  if (typeof first === "number") return new Date(first);
  if (typeof first === "string") {
    // "YYYY-MM-DD" 用本地时区构造（不能用 new Date(str)，那是 UTC，会差一天）
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/.exec(first);
    if (m) {
      return new Date(
        Number(m[1]), Number(m[2]) - 1, Number(m[3]),
        Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0), 0
      );
    }
    return new Date(first);
  }
  return new Date();
}

/** 加月份并夹住月末：1 月 31 日 + 1 月 = 2 月 28 日（moment 的行为） */
function addMonthsClamped(d: Date, delta: number): void {
  const y = d.getFullYear();
  const m = d.getMonth() + delta;
  const day = d.getDate();
  const target = new Date(y, m, 1, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  target.setDate(Math.min(day, daysInMonth(target)));
  d.setTime(target.getTime());
}

/** ISO 周序号（周一为一周之始；跨年时归到含该周四的那一年的第几周） */
function isoWeekNumber(d: Date): number {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (t.getDay() + 6) % 7; // 周一=0
  t.setDate(t.getDate() - day + 3); // 本周四
  const firstThursday = new Date(t.getFullYear(), 0, 4);
  const fday = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - fday + 3);
  return 1 + Math.round((t.getTime() - firstThursday.getTime()) / (7 * 86400000));
}

/** 取某单位的起点（返回新 Date，不改入参） */
function startOfUnit(src: Date, unit: string): Date {
  const d = new Date(src.getTime());
  const u = String(unit || "").replace(/s$/, ""); // days -> day
  switch (u) {
    case "year":
      d.setMonth(0, 1); d.setHours(0, 0, 0, 0); break;
    case "quarter":
      d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1); d.setHours(0, 0, 0, 0); break;
    case "month":
      d.setDate(1); d.setHours(0, 0, 0, 0); break;
    case "isoWeek":
    case "week": {
      // 中文环境：一周从周一开始（isoWeek 与 week 同义）。
      // Obsidian 在 zh-cn locale 下 startOf("week") 也是周一。
      const back = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - back); d.setHours(0, 0, 0, 0); break;
    }
    case "day":
      d.setHours(0, 0, 0, 0); break;
    case "hour":
      d.setMinutes(0, 0, 0); break;
    case "minute":
      d.setSeconds(0, 0); break;
    case "second":
      d.setMilliseconds(0); break;
  }
  return d;
}

class NativeMomentImpl implements MomentLike {
  private d: Date;

  constructor(d: Date) { this.d = d; }

  format(pattern: string): string {
    const d = this.d;
    const tokens: Record<string, () => string> = {
      YYYY: () => String(d.getFullYear()),
      MMMM: () => MONTHS_FULL[d.getMonth()],
      MM: () => pad(d.getMonth() + 1),
      DD: () => pad(d.getDate()),
      dddd: () => WEEKDAYS_FULL[d.getDay()],
      ddd: () => WEEKDAYS_SHORT[d.getDay()],
      HH: () => pad(d.getHours()),
      mm: () => pad(d.getMinutes()),
      ss: () => pad(d.getSeconds()),
      M: () => String(d.getMonth() + 1),
      D: () => String(d.getDate()),
      H: () => String(d.getHours()),
      m: () => String(d.getMinutes()),
      s: () => String(d.getSeconds())
    };
    // 长 token 必须排在前面，否则 "MMMM" 会被 "MM" 抢先匹配
    const re = /(YYYY|MMMM|dddd|ddd|MM|DD|HH|mm|ss|M|D|H|m|s)/g;
    return String(pattern).replace(re, (tok) => (tokens[tok] ? tokens[tok]() : tok));
  }

  clone(): MomentLike { return new NativeMomentImpl(new Date(this.d.getTime())); }

  add(amount: number, unit: string): MomentLike {
    const u = String(unit || "").replace(/s$/, "");
    switch (u) {
      case "day": this.d.setDate(this.d.getDate() + amount); break;
      case "week":
      case "isoWeek": this.d.setDate(this.d.getDate() + amount * 7); break;
      case "month": addMonthsClamped(this.d, amount); break;
      case "quarter": addMonthsClamped(this.d, amount * 3); break;
      case "year": addMonthsClamped(this.d, amount * 12); break;
      case "hour": this.d.setHours(this.d.getHours() + amount); break;
      case "minute": this.d.setMinutes(this.d.getMinutes() + amount); break;
      case "second": this.d.setSeconds(this.d.getSeconds() + amount); break;
    }
    return this; // moment 的可变语义
  }

  subtract(amount: number, unit: string): MomentLike { return this.add(-amount, unit); }

  startOf(unit: string): MomentLike {
    this.d = startOfUnit(this.d, unit);
    return this;
  }

  endOf(unit: string): MomentLike {
    const next = startOfUnit(this.d, unit);
    // 起点 + 1 个单位 - 1ms
    const adder = new NativeMomentImpl(new Date(next.getTime()));
    adder.add(1, unit);
    this.d = new Date(adder.valueOf() - 1);
    return this;
  }

  private cmp(other: MomentLike, unit?: string): [number, number] {
    if (unit) {
      return [startOfUnit(this.d, unit).getTime(), startOfUnit(new Date(other.valueOf()), unit).getTime()];
    }
    return [this.d.getTime(), other.valueOf()];
  }

  isSame(other: MomentLike, unit?: string): boolean {
    const [a, b] = this.cmp(other, unit); return a === b;
  }
  isSameOrBefore(other: MomentLike, unit?: string): boolean {
    const [a, b] = this.cmp(other, unit); return a <= b;
  }
  isSameOrAfter(other: MomentLike, unit?: string): boolean {
    const [a, b] = this.cmp(other, unit); return a >= b;
  }
  isBefore(other: MomentLike, unit?: string): boolean {
    const [a, b] = this.cmp(other, unit); return a < b;
  }
  isAfter(other: MomentLike, unit?: string): boolean {
    const [a, b] = this.cmp(other, unit); return a > b;
  }

  year(): number;
  year(value: number): MomentLike;
  year(value?: number): number | MomentLike {
    if (value === undefined) return this.d.getFullYear();
    const day = this.d.getDate();
    this.d.setFullYear(value);
    this.d.setDate(Math.min(day, daysInMonth(this.d)));
    return this;
  }

  month(): number;
  month(value: number): MomentLike;
  month(value?: number): number | MomentLike {
    if (value === undefined) return this.d.getMonth();
    addMonthsClamped(this.d, value - this.d.getMonth());
    return this;
  }

  date(): number;
  date(value: number): MomentLike;
  date(value?: number): number | MomentLike {
    if (value === undefined) return this.d.getDate();
    this.d.setDate(value); return this;
  }

  day(): number { return this.d.getDay(); }
  daysInMonth(): number { return daysInMonth(this.d); }
  quarter(): number { return Math.floor(this.d.getMonth() / 3) + 1; }
  isoWeek(): number { return isoWeekNumber(this.d); }

  /**
   * ISO 星期：周一=1 … 周日=7。
   * ⚠️ 这一方法**必须存在**：ui/view.ts 的周视图标题用它判断「整周」，
   * 缺失会让 renderHeader 抛 TypeError，renderView 在画完导航按钮后中断 ——
   * 表现就是「界面只有按钮、没有内容和视图」（2026-11-14 思源 3.8 真机反馈）。
   * Obsidian 用真 moment 从没暴露，两个新宿主用 nativeMoment 才踩到。
   */
  isoWeekday(): number;
  isoWeekday(value: number): MomentLike;
  isoWeekday(value?: number): number | MomentLike {
    const current = ((this.d.getDay() + 6) % 7) + 1; // 周日 0 → 7，周一 1 → 1
    if (value === undefined) return current;
    const target = ((Number(value) - 1) % 7 + 7) % 7; // 0=周一 … 6=周日
    this.d.setDate(this.d.getDate() - (current - 1) + target);
    return this; // moment 的可变语义
  }
  hours(): number { return this.d.getHours(); }
  minutes(): number { return this.d.getMinutes(); }
  seconds(): number { return this.d.getSeconds(); }
  hour(): number { return this.hours(); }
  minute(): number { return this.minutes(); }
  second(): number { return this.seconds(); }
  valueOf(): number { return this.d.getTime(); }
}

/**
 * 可直接传给 `setMomentFactory()` 的工厂。
 *
 * @example
 * import { nativeMoment } from "./ui";
 * setMomentFactory(nativeMoment);   // Blinko / 思源宿主 onload
 */
export function nativeMoment(...args: any[]): MomentLike {
  return new NativeMomentImpl(parseDate(args));
}
