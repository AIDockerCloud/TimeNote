// hosts/types.ts — 宿主装配契约（DEC-025）
//
// 「一份渲染引擎 + N 个宿主」的接缝。渲染层（ui/view.ts）只认这个接口，
// 不认识 Obsidian / Blinko / 思源里的任何具体 API。
//
// 分工：
//   ui/view.ts       —— 怎么画（时间轴、布局、拖拽、回写流程）
//   HostAdapter      —— 数据从哪来、写去哪、宿主能力（通知/图标/弹窗/跳转）
//   hosts/<name>/    —— 各宿主把上面的能力实现一遍
//   apps/<name>/     —— 入口与打包，负责「构造 adapter → 注入 renderer」
//
// 新增宿主只需要实现这一个接口 + 写一个入口，渲染层零改动。

import type { MomentLike } from "../ui/date";
import type { NoteEntry } from "../sources/types";

/** 与 main.ts 的 DEFAULT_SETTINGS 一一对应。宿主负责持久化。 */
export interface TimenoteSettings {
  periodicNotesFolder: string;
  includeBlinko: boolean;
  defaultView: string;
  startHour: number;
  endHour: number;
  slotHeight: number;
  firstDayOfWeek: number;
  parseAllBullets: boolean;
  quickAddSection: string;
  /** 日记模板（DEC-028）："" 跟随 Obsidian、路径 = 自定义、off = 不用模板 */
  dailyNoteTemplate: string;
  layoutMode: string;
  defaultDuration: number;
  defaultAddType: string;
  allDayHeight: number;
  elasticTimeline: boolean;
  // 远程来源聚合（DEC-023）
  memosEnabled: boolean;
  memosBaseUrl: string;
  memosToken: string;
  blinkoApiEnabled: boolean;
  blinkoBaseUrl: string;
  blinkoApiKey: string;
  // 允许宿主追加自己的设置项
  [key: string]: any;
}

/**
 * 快速记录弹窗的预览状态（DEC-033）。
 * 弹窗里改时间范围 / 类型 / 标题 / 日期时，由宿主把这个状态转发给渲染层，
 * 渲染层据此更新「待创建」块的位置、高度与文字。
 */
export interface QuickAddPreviewState {
  /** YYYY-MM-DD；改了日期就用它找对应列 */
  dateStr: string;
  /** 开始时刻（秒）；null = 时间框留空或格式非法（预览保持上一次位置） */
  startSec: number | null;
  /** 结束时刻（秒）；null = 时间点 / 未填结束时间 */
  endSec: number | null;
  isPoint: boolean;
  /** 标题，随输入实时变化 */
  title: string;
}

/** 弹窗 ↔ 渲染层的预览钩子（DEC-033）。全部可选，老宿主不实现也能正常工作。 */
export interface QuickAddHooks {
  /** 字段变化时更新待创建块 */
  onPreview?(state: QuickAddPreviewState): void;
  /** 弹窗关闭（保存成功 / 取消 / Esc / 点遮罩）时移除待创建块 */
  onDismiss?(): void;
}

/**
 * 宿主适配器。所有方法都由具体宿主实现；渲染层不允许绕过它去碰宿主全局。
 */
export interface HostAdapter {
  /** 设置对象（引用）。渲染层可直接改字段，然后调 saveSettings() 落盘。 */
  readonly settings: TimenoteSettings;
  /** 持久化设置并触发必要的重渲染 */
  saveSettings(): Promise<void>;

  // ---- 宿主 UI 能力 ----
  /** 轻提示。Obsidian 是 Notice；其它宿主可以是 toast / console */
  notice(message: string): void;
  /** 给按钮填图标。无图标体系的宿主可退化成文字或 no-op */
  setIcon(el: HTMLElement, icon: string): void;
  /** 快速记录弹窗。参数与 QuickAddModal 的位置参数一一对应；
   *  hooks 是 DEC-033 的预览联动（可选，不实现则弹窗退化为无预览） */
  openQuickAdd(
    dateStr: string,
    onSaved: () => void,
    prefillTime?: string,
    prefillEndTime?: string | undefined,
    prefillType?: string,
    hooks?: QuickAddHooks
  ): void;
  /** 子项详情弹窗 */
  openSubItems(entry: NoteEntry): void;
  /** 跳转到某条记录的原文（只读来源由宿主给出提示） */
  openEntry(entry: NoteEntry): Promise<void>;
  /** 打开某一天的日记：不存在则按宿主规则创建后再打开（DEC-017） */
  openDailyNote(dateStr: string): Promise<void>;
  /** 订阅外部数据变更（Obsidian 是 vault.on("modify")）；返回取消订阅函数 */
  onExternalChange(cb: () => void): (() => void) | void;

  // ---- 数据读写 ----
  /** 取 [start, end] 区间条目，按 dateStr 分桶。两端是注入的日期对象 */
  getEntriesForRange(start: MomentLike, end: MomentLike): Promise<Map<string, NoteEntry[]>>;
  /** 清空本地文件 / 索引 / 远程缓存，强制下一轮重读 */
  invalidateCache(): void;
  toggleTask(entry: NoteEntry): Promise<boolean>;
  updateEntryTime(entry: NoteEntry, startSec: number, endSec: number): Promise<boolean>;
  updateEntryPointTime(entry: NoteEntry, startSec: number): Promise<boolean>;
  moveEntryToDate(entry: NoteEntry, targetDate: string, startSec: number, endSec: number): Promise<boolean>;
}

/** 宿主标识，排障日志用 */
export type HostId = "obsidian" | "blinko" | "siyuan" | "web";
