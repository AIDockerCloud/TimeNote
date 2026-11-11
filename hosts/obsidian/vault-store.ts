// hosts/obsidian/vault-store.ts — Obsidian vault 版 NoteFileStore（DEC-026）
//
// sources/daily.ts 只认 NoteFileStore 接口，不认 TFile / Vault。
// 这一层把接口落回 vault API。
//
// ⚠️ 为什么读 / 写不直接用 vault.adapter.read / write：
// 原实现走的是 vault.read(file) / vault.modify(file)，它们会触发
// vault 的 "modify" 事件 —— 插件的重渲染靠这个事件驱动，多视图才同步。
// adapter.write 是更底层的文件写入，不走事件通道。为了让 Obsidian 侧行为
// 与重构前逐字一致，这里仍然按 path 找回 TFile 再调 vault.read / modify。
//
// 本文件刻意不从 hosts/index.ts 导出：它 import 了 obsidian，
// 而 hosts/index.ts 要打成 platform:neutral 的 ESM（obsidian 包只有类型、没有运行时实现）。

import { TFile, normalizePath } from "obsidian";
import type { NoteFile, NoteFileStore } from "../../sources/fs";

export function createObsidianFileStore(app: any): NoteFileStore {
  const vault = app.vault;

  return {
    // vault.getMarkdownFiles() 是同步的，接口允许同步返回 —— 保持索引构建同步语义
    listMarkdownFiles(): NoteFile[] {
      return vault.getMarkdownFiles().map((f: any) => ({
        path: f.path,
        basename: f.basename,
        mtime: f.stat.mtime
      }));
    },

    async read(path: string): Promise<string> {
      const file = vault.getAbstractFileByPath(normalizePath(path));
      if (!(file instanceof TFile)) throw new Error(`文件不存在: ${path}`);
      return vault.read(file);
    },

    async write(path: string, content: string): Promise<void> {
      const file = vault.getAbstractFileByPath(normalizePath(path));
      if (!(file instanceof TFile)) throw new Error(`文件不存在: ${path}`);
      await vault.modify(file, content);
    },

    async create(path: string, content: string): Promise<void> {
      await vault.create(normalizePath(path), content);
    },

    async exists(path: string): Promise<boolean> {
      return vault.adapter.exists(normalizePath(path));
    },

    async createFolder(path: string): Promise<void> {
      await vault.createFolder(normalizePath(path));
    }
  };
}
