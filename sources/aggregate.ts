// sources/aggregate.ts — 多来源聚合器
//
// 把多个 NoteSource 的条目合并成一份列表，供视图渲染。
//
// 设计要点：
//   · 某个来源失败（认证失效 / 实例不可达）**不应打断整个视图** ——
//     聚合器吞掉单个来源的异常，只把它当成「这个来源本次没有数据」。
//     这是聚合模式最关键的健壮性要求：memos 服务挂了，Obsidian 日历还得能用。
//   · 本地来源（可写）与聚合来源（只读）在同一份列表里共存，
//     渲染层靠 entry.source 区分能否拖拽回写。

import { NoteEntry, NoteSource } from "./types";

export interface AggregateResult {
  /** 合并后的条目（按来源分组，组内按开始时间稳定排序） */
  entries: NoteEntry[];
  /** 各来源本次的条目数（设置页 / 排障用） */
  bySource: Record<string, number>;
  /** 各来源本次的错误信息（来源失败时给出提示，但不中断渲染） */
  errors: Record<string, string>;
}

export class AggregateSource {
  private sources: NoteSource[];

  constructor(sources: NoteSource[] = []) {
    this.sources = sources;
  }

  /** 挂载一个来源 */
  add(source: NoteSource): void {
    if (source) this.sources.push(source);
  }

  /** 当前挂载的所有来源 */
  get list(): NoteSource[] {
    return this.sources.slice();
  }

  /**
   * 拉取所有来源在 [startDate, endDate] 区间内的条目。
   *
   * 单个来源抛错时只记录错误、继续下一个 —— 聚合模式下
   * 「一个后端挂了」不应该让整个日历变空白。
   */
  async listEntries(startDate: string, endDate: string): Promise<AggregateResult> {
    const entries: NoteEntry[] = [];
    const bySource: Record<string, number> = {};
    const errors: Record<string, string> = {};

    for (const source of this.sources) {
      try {
        const list = await source.listEntries(startDate, endDate);
        bySource[source.id] = list.length;
        entries.push(...list);
      } catch (err) {
        errors[source.id] = err instanceof Error ? err.message : String(err);
        bySource[source.id] = 0;
      }
    }

    // 稳定排序：来源内按开始时间 → 行号 → 文本。
    // 不按来源分组 —— 各来源之间没有天然先后，混在一起按时间排才对。
    entries.sort((a, b) =>
      (a.startSeconds || 0) - (b.startSeconds || 0) ||
      (a.lineNum || 0) - (b.lineNum || 0) ||
      String(a.text || "").localeCompare(String(b.text || ""))
    );

    return { entries, bySource, errors };
  }

  /** 按 id 找来源 */
  find(id: string): NoteSource | undefined {
    return this.sources.find(s => s.id === id);
  }
}
