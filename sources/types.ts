// sources/types.ts — 数据源契约（DEC-023）
//
// 「数据从哪来」与「怎么渲染」彻底解耦。三端（Obsidian / Blinko / 思源）
// 各自有自己的宿主，但都能挂载任意多个数据源：
//
//   Obsidian 宿主 → 本地日记 + Blinko 聚合 + memos 聚合
//   Blinko  宿主 → 本地 Blinko + memos 聚合
//   思源    宿主 → 本地思源块 + Blinko 聚合 + memos 聚合
//
// 聚合进来的来源一律只读（readonly = true）—— 与 DEC-018 / DEC-022 已定的
// 「外部来源不参与跨天移动」边界一致：只读来源不允许回写、不允许移动、
// 不允许勾选任务。

/**
 * 一条定时记录。core 的解析器产出这个结构，各 adapter 负责把
 * 自己平台的数据映射成它。
 */
export interface NoteEntry {
  id: string;
  /** 来源内定位用的路径 / id（回写时用它找到原文） */
  filePath: string;
  /** 归属日期 YYYY-MM-DD */
  dateStr: string;
  /** 在来源内的行号 / 序号（回写定位用） */
  lineNum: number;
  /** 原始文本（回写时校验「目标行没变」） */
  rawLine: string;
  isTask: boolean;
  isCompleted: boolean;
  hasTime: boolean;
  /** 是否有显式区间或时长标签（决定画块还是画点线，DEC-018） */
  isRange: boolean;
  startSeconds: number;
  endSeconds: number;
  startMinutes: number;
  endMinutes: number;
  timeStr: string;
  text: string;
  tags: string[];
  /** 显式配色指令（DEC-016） */
  tint: string | null;
  subItems: string[];
  /** 来源标识：daily / blinko / memos / siyuan ... */
  source: string;
  /**
   * 是否禁止回写（拖拽 / 跨天移动 / 勾选任务）。
   *
   * 判据必须用它、而不是 `source !== "daily"`：Obsidian vault 里的
   * Blinko **导出 md 文件**同样标 `source: "blinko"`，但它对应的是本地真实文件，
   * 而走 HTTP API 聚合进来的 Blinko / memos 条目没有本地行可改。两者 source
   * 相同、本地有无文件相反。
   *
   * ⚠️ 这个字段目前还兼着第二个语义：`hosts/obsidian/adapter.ts` 的 `openEntry`
   * 用它在「点击定位」时判断「有没有本地文件可跳转」。所以本地 Blinko 导出
   * **不能**标成 true —— 否则点一下会提示「来自远程接口，没有对应笔记」，
   * 而文件明明就在 vault 里。两个语义该拆开，已登记为待办（DEC-027）。
   *
   * 另注：本地 Blinko 导出的时间存在 frontmatter 的 `date:` 里，条目没有
   * 「行首时间前缀」这个回写锚点，写操作对它一律无效（实测三个写方法全返回
   * false、零次写入）。所以它虽然 `readonly` 为假，实际也改不了时间。
   */
  readonly?: boolean;
}

/**
 * 数据源契约。
 *
 * 聚合型来源（从别的软件拉数据）实现其中一部分即可：只需能列条目，
 * 写操作一律返回「不支持」，由 `readonly` 表达。
 */
export interface NoteSource {
  /** 来源标识，进条目 source 字段 */
  readonly id: string;
  /** 显示名（设置页、图例用） */
  readonly label: string;
  /**
   * 是否只读。聚合来源恒为 true；
   * 本地来源（Obsidian 日记 / Blinko 本地 / 思源本地）可为 false。
   */
  readonly readonly: boolean;

  /**
   * 列出 [startDate, endDate] 区间内的所有条目。
   * @param startDate YYYY-MM-DD（含）
   * @param endDate   YYYY-MM-DD（含）
   */
  listEntries(startDate: string, endDate: string): Promise<NoteEntry[]>;

  /**
   * 改某条记录的时间。只读来源必须拒绝（返回 false）。
   * @returns 是否写入成功
   */
  updateEntryTime?(entry: NoteEntry, startSec: number, endSec: number): Promise<boolean>;

  /**
   * 只改时刻（时间点）。只读来源必须拒绝。
   */
  updateEntryPointTime?(entry: NoteEntry, startSec: number): Promise<boolean>;

  /**
   * 把记录搬到另一天。只读来源必须拒绝。
   */
  moveEntryToDate?(entry: NoteEntry, targetDate: string, startSec: number, endSec: number): Promise<boolean>;

  /**
   * 勾选 / 取消勾选任务。只读来源必须拒绝。
   */
  toggleTask?(entry: NoteEntry): Promise<boolean>;

  /**
   * 新建一条记录。只读来源必须拒绝。
   */
  createEntry?(
    dateStr: string,
    timeStr: string,
    content: string,
    isTask: boolean,
    tags?: string[],
    endTimeStr?: string
  ): Promise<boolean>;
}

/**
 * 只读来源的统一拒绝实现：把写操作都实现成「明确拒绝」，
 * 这样调用方不必到处写 `if (source.readonly)` 分支，
 * 但行为仍然明确（返回 false = 未写入），不会静默成功。
 */
export const READONLY_REJECT = {
  updateEntryTime: async () => false,
  updateEntryPointTime: async () => false,
  moveEntryToDate: async () => false,
  toggleTask: async () => false,
  createEntry: async () => false
};
