// hosts/blinko/api.ts — window.Blinko.api（tRPC）最小封装（DEC-032）
//
// 插件跑在 Blinko 自己的前端里，`window.Blinko.api` 用的是**登录会话**，
// 不需要用户再填 API Token（远程聚合 Blinko 才需要 token）。
// 这里把 tRPC 调用收口成一个可注入接口，测试传假 api 即可，不发网络请求。
//
// 已核实（blinko-space/blinko 主仓 server/routerTrpc/note.ts）：
//   notes.list.query({ startDate, endDate, page, size, orderBy, type, ... })
//   notes.upsert.mutate({ content, type, id?, createdAt?, metadata?, ... })
//   notes.trashMany.mutate({ ids: number[] })
// tRPC 配置了 superjson transformer，所以 createdAt 可以直接传 Date 对象。

export interface BlinkoNote {
  id: number | string;
  content?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  metadata?: any;
  type?: number;
  isRecycle?: boolean;
  isArchived?: boolean;
}

export interface BlinkoApiLike {
  notes: {
    list: { query(input: any): Promise<any> };
    upsert: { mutate(input: any): Promise<any> };
    trashMany?: { mutate(input: any): Promise<any> };
  };
}

export interface ListNotesInput {
  startDate: string;
  endDate: string;
  pageSize?: number;
  maxPages?: number;
}

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 20;

export class BlinkoNoteApi {
  private api: BlinkoApiLike;

  constructor(api: BlinkoApiLike) {
    this.api = api;
  }

  /** 服务端按 startDate / endDate 过滤，避免把整个实例拖回来（手机热点流量敏感） */
  async listNotes(input: ListNotesInput): Promise<BlinkoNote[]> {
    const size = input.pageSize || DEFAULT_PAGE_SIZE;
    const maxPages = input.maxPages || DEFAULT_MAX_PAGES;
    const out: BlinkoNote[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const data = await this.api.notes.list.query({
        startDate: input.startDate,
        endDate: input.endDate,
        page,
        size,
        orderBy: "asc",
        type: -1,
        isArchived: false,
        isRecycle: false,
        searchText: ""
      });
      const rows: BlinkoNote[] = Array.isArray(data) ? data : [];
      out.push(...rows);
      if (rows.length < size) break;
    }
    return out;
  }

  /** 新建 / 更新一条 note。调用方负责合并既有 metadata，别把 Blinko 自己的字段冲掉 */
  async upsertNote(input: any): Promise<any> {
    return await this.api.notes.upsert.mutate(input);
  }

  /** 删除一律走「回收站」而不是硬删 —— 跨天搬移中途失败时用户还能找回来 */
  async trashNotes(ids: number[]): Promise<void> {
    if (!ids.length) return;
    if (this.api.notes.trashMany && typeof this.api.notes.trashMany.mutate === "function") {
      await this.api.notes.trashMany.mutate({ ids });
      return;
    }
    for (const id of ids) {
      await this.api.notes.upsert.mutate({ id, isRecycle: true });
    }
  }
}
