// sources/blinko-local.ts — 本地 Blinko **导出 md** 来源（DEC-027）
//
// 这是「Blinko 导出到 vault 里的 markdown 文件」，与走 HTTP API 的
// `blinko.ts` 是两回事：
//
//   blinko.ts        → POST /api/v1/note/list，聚合进来的，只读
//   blinko-local.ts  → 读 vault 里的 Blinko/Notes/*.md，文件本体在本地
//
// 两者的 `source` 都是 "blinko"（沿用历史数据，改 id 会让既有条目的
// 徽标与配色失效），但可写性完全不同 —— 这也是 `NoteEntry.readonly`
// 存在的原因（DEC-023）。
//
// ── 关于「能不能回写」的实测结论（2026-11-11）─────────────────────────
// 历史注释（`ui/view.ts` / `sources/types.ts` / `sources/meta.ts`）都写着
// 「本地 Blinko 导出历史上一直允许拖拽改时间」。实测不成立：
// 这类条目的 `lineNum` 是硬编码的 1、`rawLine` 是去掉 frontmatter 后的正文，
// 而 `DailySource.updateEntryTime` 要求 `lines[lineNum-1]` 匹配「列表项 + 行首
// 时间前缀」。导出文件第 1 行恒为 `---`（`parseBlinkoFile` 本身要求有
// frontmatter），因此三个写方法全部返回 false、零次写入：
//
//   updateEntryTime      → false
//   updateEntryPointTime → false
//   moveEntryToDate      → false
//
// 而且这些条目 `isRange` 为空 → `isPointEntry()` 为真 → 画成**时间点线**，
// 而点线的拖拽入口本来就挡掉了 `source !== "daily"`。也就是说用户眼前
// 从来没有过可拖的把手，那条注释描述的是一个不存在的功能。
//
// 因此本来源：`readonly = false`（条目确有本地文件，点开能跳转 ——
// `openEntry` 是靠 `readonly` 判断「有没有本地文件」的），但**不实现任何
// 写方法**。时间存在 frontmatter 的 `date:` 字段里，没有「行首锚点」，
// 真要支持拖拽得改写 YAML，那是独立功能，不在本次迁移范围（见 DEC-027）。

import type { NoteEntry, NoteSource } from "./types";
import type { NoteFile, NoteFileStore } from "./fs";

export interface BlinkoLocalSourceConfig {
  /** 宿主提供的文件存储 */
  store: NoteFileStore;
  /**
   * 判定某个文件是否属于 Blinko 导出。默认沿用原实现的两条规则：
   * 前缀 `Blinko/Notes`，或路径里含 `Blinko`（后者兼容用户自定义导出目录）。
   */
  matchPath?: (path: string) => boolean;
}

/** 默认路径规则，逐字照搬自 main.ts 的 getEntriesForRange */
export function defaultBlinkoPathMatch(path: string): boolean {
  return path.startsWith("Blinko/Notes") || path.includes("Blinko");
}

export class BlinkoLocalSource implements NoteSource {
  readonly id = "blinko";
  readonly label = "Blinko";
  /** 条目有本地文件（能点开跳转），但时间在 frontmatter 里、无从回写 —— 见文件头 */
  readonly readonly = false;

  private store: NoteFileStore;
  private matchPath: (path: string) => boolean;

  /** filePath -> { mtime, entry }，按 mtime 判失效（原实现即此策略） */
  readonly fileCache = new Map<string, { mtime: number; entry: NoteEntry | null }>();

  constructor(config: BlinkoLocalSourceConfig) {
    this.store = config.store;
    this.matchPath = config.matchPath || defaultBlinkoPathMatch;
  }

  /**
   * 列出区间内的条目。
   *
   * 原实现是「遍历全库 md → 命中路径规则 → 逐文件解析 → 只保留桶里已有的日期」，
   * 这里保持不变：先全量解析再按区间过滤，因为日期要从 frontmatter 里读出来
   * 才知道，光看文件名判断不了。
   */
  async listEntries(startDate: string, endDate: string): Promise<NoteEntry[]> {
    const files = await this.store.listMarkdownFiles();
    const out: NoteEntry[] = [];
    for (const file of files) {
      if (!this.matchPath(file.path)) continue;
      const entry = await this.parseFile(file);
      if (!entry) continue;
      if (entry.dateStr < startDate || entry.dateStr > endDate) continue;
      out.push(entry);
    }
    return out;
  }

  /**
   * 解析单个 Blinko 导出文件。
   *
   * ⚠️ 逐字搬自 main.ts 的 `parseBlinkoFile`（DEC-027）。这些正则对应真实导出
   * 文件的格式，一个字符都不要"顺手优化"（红线 24）。
   */
  async parseFile(file: NoteFile): Promise<NoteEntry | null> {
    const cached = this.fileCache.get(file.path);
    if (cached && cached.mtime === file.mtime) {
      return cached.entry;
    }

    const content = await this.store.read(file.path);
    const entry = this.parseContent(file, content);
    this.fileCache.set(file.path, { mtime: file.mtime, entry });
    return entry;
  }

  /** 纯解析：内容 → 条目。单拆出来是为了测试能直接喂字符串。 */
  parseContent(file: NoteFile, content: string): NoteEntry | null {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return null;

    const yaml = fmMatch[1];
    const dateMatch = yaml.match(/date:\s*(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!dateMatch) return null;

    const dateStr = dateMatch[1];
    const sh = parseInt(dateMatch[2], 10);
    const sm = parseInt(dateMatch[3], 10);
    const ss = dateMatch[4] ? parseInt(dateMatch[4], 10) : 0;
    const startSeconds = sh * 3600 + sm * 60 + ss;
    const endSeconds = Math.min(86400, startSeconds + 1800);
    const startMinutes = Math.floor(startSeconds / 60);
    const endMinutes = Math.floor(endSeconds / 60);
    const timeStr = dateMatch[4]
      ? `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
      : `${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}`;

    // 标签：frontmatter 的 tags: [a, b] 与正文里的 #tag 都收
    const tags: string[] = [];
    const tagMatch = yaml.match(/tags:\s*\[(.*?)\]/);
    if (tagMatch && tagMatch[1]) {
      tagMatch[1].split(",").forEach(t => {
        const clean = t.trim().replace(/^['"]|['"]$/g, "");
        if (clean) tags.push(clean);
      });
    }

    // 正文：去掉 frontmatter，剥掉 #tag 收进 tags
    let body = content.replace(/^---\n[\s\S]*?\n---/, "").trim();
    body = body.replace(/#([\w\u4e00-\u9fa5\/-]+)/g, (_, t) => {
      if (!tags.includes(t)) tags.push(t);
      return "";
    }).trim();

    return {
      id: `${file.path}#blinko`,
      filePath: file.path,
      dateStr,
      // 原实现就这么写：拿不到正文里"第几行"，用 1 占位。
      // 写方法因此全部不可用 —— 见文件头。
      lineNum: 1,
      rawLine: body,
      isTask: false,
      isCompleted: false,
      hasTime: true,
      // 导出文件只给了起始时刻，没有区间语法 → 与原来一样画时间点线（DEC-018）
      isRange: false,
      startSeconds,
      endSeconds,
      startMinutes,
      endMinutes,
      timeStr,
      text: body.slice(0, 80) || (tags.length > 0 ? tags.map(t => `#${t}`).join(" ") : "Blinko 闪念"),
      tags,
      subItems: [],
      source: "blinko",
      // 显式 null 而非 undefined：原来没有这个字段，两者都是 falsy，
      // 但类型要求 string | null，写清楚免得下一个人以为"忘了设"
      tint: null
    };
  }
}
