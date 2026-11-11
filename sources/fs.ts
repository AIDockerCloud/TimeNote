// sources/fs.ts — 本地文件存储抽象（DEC-026）
//
// 本地日记、本地 Blinko 导出这些来源的本质都是「一群 markdown 文件」，
// 但 Obsidian 用 vault API、Blinko 用浏览器 File System Access、思源用块树。
// 所以 sources/ 层只认这个最小接口，由各宿主提供实现：
//
//   Obsidian → vault（hosts/obsidian/vault-store.ts）
//   Blinko   → 浏览器侧文件句柄实现
//   思源     → 块树适配（思源没有「文件」，可以把块聚合成虚拟文件）
//
// 这里刻意不出现 TFile / Vault / window：sources/ 要能打成 platform:neutral。

/** 一个 markdown 文件的最小元数据（不含内容，内容按需 read） */
export interface NoteFile {
  /** 仓库内路径，形如 `SpiralNotes/2026/Daily/11/2026-11-11.md` */
  path: string;
  /** 不含扩展名的文件名，日记就是 `YYYY-MM-DD` */
  basename: string;
  /** 最后修改时间（毫秒），解析缓存靠它判断是否失效 */
  mtime: number;
}

/**
 * 本地文件存储。
 *
 * 所有方法都允许返回 Promise —— Obsidian 的 vault 全是异步的，
 * 而浏览器内存实现可以同步返回，`await` 一次就抹平差异。
 */
export interface NoteFileStore {
  /** 列出全部 markdown 文件（只要元数据，不要内容） */
  listMarkdownFiles(): NoteFile[] | Promise<NoteFile[]>;
  /** 读全文 */
  read(path: string): Promise<string>;
  /** 覆盖写（文件必须已存在） */
  write(path: string, content: string): Promise<void>;
  /** 新建（文件不能已存在） */
  create(path: string, content: string): Promise<void>;
  /** 路径是否存在（文件或目录都算） */
  exists(path: string): Promise<boolean>;
  /** 建目录（已存在时不应报错） */
  createFolder(path: string): Promise<void>;
}

/** 内存实现：测试与「无文件系统宿主」的兜底 */
export class MemoryFileStore implements NoteFileStore {
  /** path -> { content, mtime } */
  private files = new Map<string, { content: string; mtime: number }>();
  /** 已存在的目录集合（显式建过的） */
  private folders = new Set<string>();
  /** 每次写操作递增，保证 mtime 单调，缓存能正确失效 */
  private tick = 1;
  /** 记录 create / write / read 次数，供测试断言「没有多余写入 / 缓存真的生效」 */
  readonly stats = { creates: 0, writes: 0, reads: 0, folders: 0 };
  /**
   * 调用序列（只记写类操作，读太频繁）。
   * 「先写目标日记再删源行」这类顺序保证只能靠它验证 ——
   * 数据丢了才知道顺序错了就太晚了。
   */
  readonly calls: { op: "write" | "create" | "folder"; path: string }[] = [];

  constructor(initial: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initial)) {
      this.files.set(normalizePath(path), { content, mtime: this.tick++ });
    }
  }

  listMarkdownFiles(): NoteFile[] {
    return [...this.files.entries()]
      .filter(([path]) => path.endsWith(".md"))
      .map(([path, f]) => ({
        path,
        basename: basenameOf(path),
        mtime: f.mtime
      }));
  }

  async read(path: string): Promise<string> {
    const hit = this.files.get(normalizePath(path));
    if (!hit) throw new Error(`文件不存在: ${path}`);
    this.stats.reads++;
    return hit.content;
  }

  async write(path: string, content: string): Promise<void> {
    const key = normalizePath(path);
    if (!this.files.has(key)) throw new Error(`文件不存在: ${path}`);
    this.files.set(key, { content, mtime: this.tick++ });
    this.stats.writes++;
    this.calls.push({ op: "write", path: key });
  }

  async create(path: string, content: string): Promise<void> {
    const key = normalizePath(path);
    if (this.files.has(key)) throw new Error(`文件已存在: ${path}`);
    this.files.set(key, { content, mtime: this.tick++ });
    this.stats.creates++;
    this.calls.push({ op: "create", path: key });
  }

  async exists(path: string): Promise<boolean> {
    const key = normalizePath(path);
    return this.files.has(key) || this.folders.has(key);
  }

  async createFolder(path: string): Promise<void> {
    const key = normalizePath(path);
    this.folders.add(key);
    this.stats.folders++;
    this.calls.push({ op: "folder", path: key });
  }

  /** 测试辅助：直接读当前内容，不做存在性异常 */
  peek(path: string): string | undefined {
    return this.files.get(normalizePath(path))?.content;
  }
}

function normalizePath(path: string): string {
  return String(path).replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
}

function basenameOf(path: string): string {
  const name = normalizePath(path).split("/").pop() || "";
  return name.replace(/\.md$/i, "");
}
