// hosts/siyuan/kernel.ts — 思源内核 HTTP API 的最小客户端（DEC-032）
//
// 只做一件事：把 /api/* 调用收口成一个可注入的 transport。
//   · 真机：fetch POST JSON（思源内核监听 127.0.0.1:6806，插件前端同源）
//   · 测试：传一个假的 post，完全不发网络请求
//
// ⚠️ 官方插件开发规范要求「读写 data 目录一律走内核 API」，不许直接用
//    fs / electron / node。本文件全部走 /api/*，符合该约束。
// ⚠️ 内核返回值形态在不同版本里略有差异（data 可能是对象 / 字符串 / 数组），
//    所以每个读取点都做多形态兼容 —— 无真机环境下这是必要的防御。

export interface KernelTransport {
  post(url: string, body: any): Promise<any>;
}

/** 浏览器 fetch 版 transport。baseUrl 默认空（与思源前端同源） */
export function createFetchTransport(baseUrl = ""): KernelTransport {
  return {
    async post(url: string, body: any) {
      const res = await fetch(`${String(baseUrl || "").replace(/\/$/, "")}${url}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {})
      });
      if (!res.ok) throw new Error(`思源内核 ${url} HTTP ${res.status}`);
      return await res.json();
    }
  };
}

export interface SiyuanDocRef {
  id: string;
  dateStr: string;
  /** 内核 blocks.updated（毫秒） */
  updated: number;
}

export interface SiyuanBlock {
  id: string;
  markdown: string;
  type: string;
  parentId: string;
}

/** 内核时间字段形如 "20261112153000"；解析失败回 0（缓存仍靠写代数兜底） */
export function parseKernelTime(raw: any): number {
  const s = String(raw || "").replace(/\D/g, "");
  if (s.length < 14) return 0;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  const hh = Number(s.slice(8, 10));
  const mm = Number(s.slice(10, 12));
  const ss = Number(s.slice(12, 14));
  const t = Date.UTC(y, m - 1, d, hh, mm, ss);
  return Number.isFinite(t) ? t : 0;
}

/** 从属性名 custom-dailynote-20261112 里抽日期 */
export function dateFromDailyNoteAttr(name: string): string | null {
  const m = /custom-dailynote-(\d{8})/.exec(String(name || ""));
  if (!m) return null;
  const s = m[1];
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export class SiyuanKernel {
  private t: KernelTransport;

  constructor(transport: KernelTransport) {
    this.t = transport;
  }

  /** 统一拆 {code,msg,data}；code 非 0 直接抛，避免静默写入失败 */
  async call(url: string, body: any = {}): Promise<any> {
    const res = await this.t.post(url, body);
    if (res && typeof res === "object" && "code" in res && res.code !== 0) {
      throw new Error(`思源内核 ${url}: ${res.msg || `code=${res.code}`}`);
    }
    return res && typeof res === "object" && "data" in res ? res.data : res;
  }

  async querySql(stmt: string): Promise<any[]> {
    const data = await this.call("/api/query/sql", { stmt });
    return Array.isArray(data) ? data : [];
  }

  /** 查询工作空间里可作为 TimeNote 日记的文档（两条通道合并，任一失败不影响另一条） */
  async listDailyNotes(folder: string): Promise<SiyuanDocRef[]> {
    const out = new Map<string, SiyuanDocRef>();
    const safeFolder = String(folder || "SpiralNotes").replace(/'/g, "''");

    // 通道 ①：我们自己按 <folder>/YYYY/Daily/MM/YYYY-MM-DD 建的文档
    try {
      const rows = await this.querySql(
        `SELECT id, content, hpath, updated FROM blocks WHERE type = 'd' ` +
        `AND hpath LIKE '/${safeFolder}/%' LIMIT 2000`
      );
      for (const r of rows) {
        const dateStr = String(r.content || r.hpath || "").split("/").pop() || "";
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
        out.set(dateStr, {
          id: String(r.id), dateStr,
          updated: parseKernelTime(r.updated)
        });
      }
    } catch { /* 表结构差异不该让整个日历打空 */ }

    // 通道 ②：思源原生「每日笔记」（自带 custom-dailynote-yyyymmdd 属性）
    try {
      const rows = await this.querySql(
        `SELECT root_id, name FROM attributes WHERE name LIKE 'custom-dailynote-%' LIMIT 2000`
      );
      for (const r of rows) {
        const dateStr = dateFromDailyNoteAttr(String(r.name || ""));
        if (!dateStr || out.has(dateStr)) continue;
        out.set(dateStr, { id: String(r.root_id), dateStr, updated: 0 });
      }
    } catch { /* 属性表可能不可见，忽略 */ }

    return [...out.values()];
  }

  /** 读文档内的块。只取能映射成 md 行的类型，顺序按 created/id 稳定化 */
  async listBlocks(docId: string): Promise<SiyuanBlock[]> {
    const safe = String(docId).replace(/'/g, "''");
    const rows = await this.querySql(
      `SELECT id, markdown, type, parent_id, created FROM blocks ` +
      `WHERE root_id = '${safe}' AND type IN ('i','p','h','l') ` +
      `ORDER BY created ASC, id ASC LIMIT 1000`
    );
    return rows.map(r => ({
      id: String(r.id),
      markdown: String(r.markdown || ""),
      type: String(r.type || ""),
      parentId: String(r.parent_id || "")
    }));
  }

  /**
   * 新建一篇日记文档。
   * 走 createDocWithMd 而不是 createDailyNote：后者只能建「模板日记」且日期格式
   * 在不同内核版本里不统一；我们维护自己的路径与索引，用 createDocWithMd
   * 可以一次性把整篇 markdown 写进去，也能精确控制标题。
   */
  async createDocWithMd(notebook: string, path: string, markdown: string): Promise<string> {
    const data = await this.call("/api/filetree/createDocWithMd", {
      notebook, path, markdown
    });
    const id = data && typeof data === "object" ? (data.id || data.ID || data.rootID) : data;
    if (!id || typeof id !== "string") {
      throw new Error("createDocWithMd 未返回文档 id");
    }
    return id;
  }

  /** 取第一个已打开的笔记本 id（设置里没指定时用） */
  async firstNotebookId(): Promise<string> {
    const data = await this.call("/api/notebook/lsNotebooks", {});
    const books = data && Array.isArray(data.notebooks) ? data.notebooks : [];
    const open = books.find((b: any) => b && !b.closed) || books[0];
    const id = open && (open.id || open.ID);
    if (!id) throw new Error("没有可用的思源笔记本，请在设置里指定笔记本 ID");
    return String(id);
  }

  async updateBlock(id: string, markdown: string): Promise<void> {
    await this.call("/api/block/updateBlock", { id, dataType: "markdown", data: markdown });
  }

  async insertBlock(parentId: string, markdown: string, previousId?: string): Promise<void> {
    const body: any = { parentID: parentId, dataType: "markdown", data: markdown };
    if (previousId) body.previousID = previousId;
    await this.call("/api/block/insertBlock", body);
  }

  async deleteBlock(id: string): Promise<void> {
    await this.call("/api/block/deleteBlock", { id });
  }

  /** 诊断用：导出整篇 markdown。主读写路径不依赖它（避免 IAL / 缩进差异） */
  async exportMdContent(id: string): Promise<string> {
    const data = await this.call("/api/export/exportMdContent", { id, refMode: 0, embedMode: 0 });
    if (typeof data === "string") return data;
    return String((data && (data.content || data.md || data.markdown)) || "");
  }
}
