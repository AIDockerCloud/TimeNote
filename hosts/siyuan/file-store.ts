// hosts/siyuan/file-store.ts — 思源每日笔记文档 ↔ 虚拟 markdown 文件（DEC-032）
//
// TimeNote 的 DailySource 只认「一群 md 文件」，思源却把内容存成块树。
// 这里用一个 NoteFileStore 把两者接起来：
//
//   虚拟路径 <folder>/YYYY/Daily/MM/YYYY-MM-DD.md
//        ↓ dateStr
//   思源文档（路径 /<folder>/.../<date>，标题就是日期）
//        ↓ SQL 查 blocks
//   一个块 ↔ md 的一行（顶层块直接输出，子块缩进两空格）
//
// 写回采用**行级 diff**：改一行 → updateBlock，新增 → insertBlock，删除 →
// deleteBlock。绝不整篇覆盖，用户的块 id / 块引用 / 子块都不会被冲掉。
// 这是「宿主原生数据」方案能保住数据完整性的关键。
//
// ⚠️ 已知边界（无真机，按内核源码实现，待验证）：
//   · 只处理 i / p / h / l 四类块，表格 / 代码块等复杂块不进虚拟文件；
//   · 新插入的块按 previousID 尽量贴近原位置，跨块重排未做；
//   · 空行不建块，read 永远返回「块行拼接」的无空行文本，保证 lineNum 稳定。

import type { NoteFile, NoteFileStore } from "../../sources/fs";
import { diffLines } from "../../apps/shared/line-diff";
import type { LineOp } from "../../apps/shared/line-diff";
import { SiyuanKernel } from "./kernel";
import type { SiyuanBlock } from "./kernel";

// diff 实现已抽到 apps/shared（Blinko 共用），这里保留 re-export 方便测试引用
export { diffLines } from "../../apps/shared/line-diff";
export type { LineOp } from "../../apps/shared/line-diff";

/** 从虚拟路径里取 YYYY-MM-DD */
export function dateOfPath(path: string): string | null {
  const name = String(path || "").split("/").pop() || "";
  const m = /^(\d{4}-\d{2}-\d{2})(?:\.md)?$/i.exec(name);
  return m ? m[1] : null;
}

/** 思源块的 markdown 常带 IAL 尾缀，去掉后再给解析器看 */
export function stripIal(line: string): string {
  return String(line || "")
    .replace(/\s*\{:\s*[^}]*\}\s*$/, "")
    .replace(/\r$/, "");
}

/** 虚拟路径 → 思源文档 hpath（不带扩展名） */
export function siyuanDocPath(folder: string, dateStr: string): string {
  const f = String(folder || "SpiralNotes").replace(/^\/+|\/+$/g, "");
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(5, 7);
  return `/${f}/${y}/Daily/${m}/${dateStr}`;
}

/** 块列表 → 虚拟 md 行 + 行号到块 id 的映射（父子重排，子项紧跟父项） */
export function blocksToLines(docId: string, blocks: SiyuanBlock[]): { lines: string[]; ids: Array<string | null> } {
  const byId = new Map<string, SiyuanBlock>();
  for (const b of blocks) byId.set(b.id, b);

  const isTopLevel = (b: SiyuanBlock): boolean => {
    if (!b.parentId || b.parentId === docId) return true;
    const parent = byId.get(b.parentId);
    // 列表容器 l 的直接子项也算顶层记录行
    return !!parent && parent.type === "l";
  };

  const lines: string[] = [];
  const ids: Array<string | null> = [];
  const emit = (b: SiyuanBlock, indent: boolean) => {
    if (b.type === "l") return; // 列表容器本身不产生一行
    const text = stripIal(b.markdown);
    if (!text.trim()) return;
    lines.push(indent ? `  ${text}` : text);
    ids.push(b.id);
  };

  const tops = blocks.filter(isTopLevel);
  const emitted = new Set<string>();
  for (const parent of tops) {
    if (emitted.has(parent.id)) continue;
    emit(parent, false);
    emitted.add(parent.id);
    for (const child of blocks) {
      if (child.parentId !== parent.id || emitted.has(child.id)) continue;
      emit(child, true);
      emitted.add(child.id);
    }
  }
  // 兜底：父块不在同一个结果集里时（例如只查到子块），别把内容整段丢掉
  for (const b of blocks) {
    if (emitted.has(b.id)) continue;
    emit(b, false);
    emitted.add(b.id);
  }
  return { lines, ids };
}

export interface SiyuanFileStoreConfig {
  kernel: SiyuanKernel;
  /** 与 settings.periodicNotesFolder 一致 */
  folder?: string;
  /** 笔记本 id；留空时自动取第一个已打开的 */
  notebookId?: string;
  /** 诊断用回调 */
  warn?: (msg: string) => void;
}

interface Snapshot {
  lines: string[];
  ids: Array<string | null>;
}

export class SiyuanFileStore implements NoteFileStore {
  private kernel: SiyuanKernel;
  private folder: string;
  private notebookId: string;
  private warn: (msg: string) => void;
  /** dateStr -> 思源文档 id */
  private dateToDoc = new Map<string, string>();
  /** dateStr -> 稳定的 mtime（写时更新，避免每次 list 都让缓存失效） */
  private mtimes = new Map<string, number>();
  /** path -> 上一次 read 出来的行与块 id */
  private snapshots = new Map<string, Snapshot>();

  constructor(config: SiyuanFileStoreConfig) {
    this.kernel = config.kernel;
    this.folder = config.folder || "SpiralNotes";
    this.notebookId = config.notebookId || "";
    this.warn = config.warn || (() => {});
  }

  /** 设置变更后立即生效（日记目录 / 笔记本 id） */
  setFolder(folder: string): void { this.folder = folder || "SpiralNotes"; }
  setNotebookId(id: string): void { this.notebookId = id || ""; }

  /** 供 adapter 的 openDailyNote / openEntry 跳转用 */
  async getDocId(dateStr: string): Promise<string | null> {
    if (this.dateToDoc.has(dateStr)) return this.dateToDoc.get(dateStr)!;
    await this.listMarkdownFiles();
    return this.dateToDoc.get(dateStr) || null;
  }

  private virtualPath(dateStr: string): string {
    const f = this.folder.replace(/^\/+|\/+$/g, "");
    return `${f}/${dateStr.slice(0, 4)}/Daily/${dateStr.slice(5, 7)}/${dateStr}.md`;
  }

  async listMarkdownFiles(): Promise<NoteFile[]> {
    const docs = await this.kernel.listDailyNotes(this.folder);
    for (const d of docs) {
      this.dateToDoc.set(d.dateStr, d.id);
      if (!this.mtimes.has(d.dateStr)) {
        this.mtimes.set(d.dateStr, d.updated || 1);
      }
    }
    return docs.map(d => ({
      path: this.virtualPath(d.dateStr),
      basename: d.dateStr,
      mtime: this.mtimes.get(d.dateStr) || 1
    }));
  }

  async read(path: string): Promise<string> {
    const dateStr = dateOfPath(path);
    if (!dateStr) throw new Error(`不是合法的日记路径: ${path}`);
    const docId = await this.getDocId(dateStr);
    if (!docId) throw new Error(`思源里找不到 ${dateStr} 日记文档`);
    const blocks = await this.kernel.listBlocks(docId);
    const snap = blocksToLines(docId, blocks);
    this.snapshots.set(path, snap);
    return snap.lines.join("\n");
  }

  async write(path: string, content: string): Promise<void> {
    const dateStr = dateOfPath(path);
    if (!dateStr) throw new Error(`不是合法的日记路径: ${path}`);
    const docId = await this.getDocId(dateStr);
    if (!docId) throw new Error(`思源里找不到 ${dateStr} 日记文档`);

    let snap = this.snapshots.get(path);
    if (!snap) {
      const blocks = await this.kernel.listBlocks(docId);
      snap = blocksToLines(docId, blocks);
    }
    // 空行不建块：过滤后仍保持有效行的相对顺序，lineNum 才能稳定
    const newLines = String(content || "").split("\n").filter(l => l.trim().length > 0);
    const ops = diffLines(snap.lines, newLines, snap.ids);

    let previousId: string | undefined;
    // 写回后必须**保留未变行的块 id**：下一次写（删行 / 再拖一次）才能继续
    // 命中同一个块，而不是把整篇当成全新内容重新插一遍。
    // 新建的块暂时没有 id（insertBlock 不返回），下次 read 会重新查 SQL 补齐。
    const nextIds: Array<string | null> = [];
    for (const op of ops) {
      try {
        if (op.op === "keep") {
          previousId = op.blockId || undefined;
          nextIds.push(op.blockId || null);
        } else if (op.op === "replace") {
          if (op.blockId) {
            await this.kernel.updateBlock(op.blockId, String(op.newLine || ""));
            previousId = op.blockId;
            nextIds.push(op.blockId);
          } else {
            await this.kernel.insertBlock(docId, String(op.newLine || ""), previousId);
            previousId = undefined;
            nextIds.push(null);
          }
        } else if (op.op === "delete") {
          if (op.blockId) await this.kernel.deleteBlock(op.blockId);
        } else if (op.op === "insert") {
          await this.kernel.insertBlock(docId, String(op.newLine || ""), previousId);
          previousId = undefined;
          nextIds.push(null);
        }
      } catch (err) {
        this.warn(`[TimeNote/思源] 块写入失败 ${op.op}: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
    }

    this.snapshots.set(path, { lines: newLines, ids: nextIds });
    this.mtimes.set(dateStr, Date.now());
  }

  async create(path: string, content: string): Promise<void> {
    const dateStr = dateOfPath(path);
    if (!dateStr) throw new Error(`不是合法的日记路径: ${path}`);
    if (this.dateToDoc.has(dateStr)) {
      await this.write(path, content);
      return;
    }
    const notebook = this.notebookId || await this.kernel.firstNotebookId();
    // 文档标题本身就是日期，去掉模板里的 # YYYY-MM-DD H1 免得重复
    const md = String(content || "")
      .split("\n")
      .filter((l, i) => !(i === 0 && /^#\s*\d{4}-\d{2}-\d{2}\s*$/.test(l.trim())))
      .join("\n");
    const docPath = siyuanDocPath(this.folder, dateStr);
    const docId = await this.kernel.createDocWithMd(notebook, docPath, md);
    this.dateToDoc.set(dateStr, docId);
    this.mtimes.set(dateStr, Date.now());
    this.snapshots.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    // DailySource.ensureFolder 会逐级问目录；思源没有真实目录，一律放行
    if (!/\.md$/i.test(String(path || ""))) return true;
    const dateStr = dateOfPath(path);
    if (!dateStr) return false;
    if (this.dateToDoc.has(dateStr)) return true;
    await this.listMarkdownFiles();
    return this.dateToDoc.has(dateStr);
  }

  async createFolder(_path: string): Promise<void> {
    // 文档路径自带层级，createDocWithMd 会建好父文档，无需单独建目录
  }
}
