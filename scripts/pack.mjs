#!/usr/bin/env node
/**
 * 把 Obsidian 插件三件套打成 zip，供 GitHub Release / BRAT 手动安装使用。
 *
 *   npm run pack   →  dist/timenote-<version>.zip
 *
 * 约定（改之前先看 AGENTS.md 红线 19）：
 *   - zip **根目录**直接放 manifest.json / main.js / styles.css，不套一层目录，
 *     Obsidian 手动安装与 BRAT 都要求这个结构。
 *   - 只打三件套，不带 README / 源码 / node_modules。
 *   - 纯 Node 实现（zlib deflateRaw + 手写 zip 结构），不依赖系统 `zip`
 *     命令或任何第三方包 —— Windows / macOS / CI 行为一致。
 */
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = ["manifest.json", "main.js", "styles.css"];

/* ---------------- CRC32 ---------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/* ---------------- DOS 时间戳 ---------------- */
const dosTime = (d) =>
  ((d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)) & 0xffff;
const dosDate = (d) =>
  (((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

/* ---------------- 组装 zip（store / deflate 二选一） ---------------- */
function buildZip(entries) {
  const local = [];
  const central = [];
  let offset = 0;

  for (const { name, data, mtime } of entries) {
    const crc = crc32(data);
    let body = deflateRawSync(data, { level: 9 });
    let method = 8; // deflate
    if (body.length >= data.length) {
      body = data;
      method = 0; // store（小文件压缩后反而更大时）
    }
    const nameBuf = Buffer.from(name, "utf8");
    const time = dosTime(mtime);
    const date = dosDate(mtime);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); // local file header
    lh.writeUInt16LE(20, 4); // version needed
    lh.writeUInt16LE(0x0800, 6); // bit 11 = UTF-8 文件名
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28); // extra length
    local.push(lh, nameBuf, body);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); // central directory header
    ch.writeUInt16LE(20, 4); // version made by
    ch.writeUInt16LE(20, 6); // version needed
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30); // extra
    ch.writeUInt16LE(0, 32); // comment
    ch.writeUInt16LE(0, 34); // disk number
    ch.writeUInt16LE(0, 36); // internal attrs
    ch.writeUInt32LE(0, 38); // external attrs
    ch.writeUInt32LE(offset, 42); // local header offset
    central.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20); // comment length
  return Buffer.concat([...local, centralBuf, eocd]);
}

/* ---------------- 主流程 ---------------- */
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
const version = manifest.version;
if (!/^\d+\.\d+\.\d+$/.test(String(version || ""))) {
  console.error(`manifest.json 的 version 不合法：${version}`);
  process.exit(1);
}

const entries = FILES.map((name) => {
  const p = resolve(root, name);
  const st = statSync(p); // 缺文件直接抛，避免打出缺件包
  return { name, data: readFileSync(p), mtime: st.mtime, size: st.size };
});

const zip = buildZip(entries);
const outDir = resolve(root, "dist");
mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, `timenote-${version}.zip`);
writeFileSync(outPath, zip);

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`打包 timenote ${version}`);
for (const e of entries) console.log(`  ${e.name.padEnd(14)} ${kb(e.size).padStart(9)}`);
const raw = entries.reduce((s, e) => s + e.size, 0);
console.log(`  原始 ${kb(raw)} → zip ${kb(zip.length)}`);
console.log(outPath);
