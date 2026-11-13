#!/usr/bin/env node
/**
 * 零依赖的 zip / PNG 生成器，供两个新宿主插件的打包脚本共用（DEC-032）。
 *
 * 刻意不复用 scripts/pack.mjs：那是 Obsidian 发版链路，已上线且被
 * .github/workflows/release.yml 调用，改它有风险。这里复制其 zip 实现，
 * 保持「纯 Node + 手写 zip 结构」的特性（不依赖系统 zip / 第三方包）。
 */
import { deflateRawSync, deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const dosTime = (d) =>
  ((d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)) & 0xffff;
const dosDate = (d) =>
  (((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

/** entries: [{ name, data:Buffer|string, mtime?:Date }] */
export function buildZip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  const now = new Date();

  for (const { name, data, mtime = now } of entries) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), "utf8");
    const crc = crc32(buf);
    let body = deflateRawSync(buf, { level: 9 });
    let method = 8;
    if (body.length >= buf.length) { body = buf; method = 0; }
    const nameBuf = Buffer.from(name, "utf8");
    const time = dosTime(mtime);
    const date = dosDate(mtime);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(buf.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    local.push(lh, nameBuf, body);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(buf.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...local, centralBuf, eocd]);
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32LE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32LE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/**
 * 生成一张纯色 PNG（思源集市要求 icon.png 160x160 / preview.png 1024x768）。
 * 没有图形库也能出合法文件，本地安装/集市列表都不会显示破图。
 */
export function makePng(width, height, rgb = [59, 124, 246]) {
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const base = y * stride;
    raw[base] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const p = base + 1 + x * 4;
      // 中间画一条浅色横带，避免完全空白像损坏图
      const band = Math.abs(y - Math.floor(height / 2)) < Math.max(2, Math.floor(height / 24));
      raw[p] = band ? 255 : rgb[0];
      raw[p + 1] = band ? 255 : rgb[1];
      raw[p + 2] = band ? 255 : rgb[2];
      raw[p + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32LE(width, 0);
  ihdr.writeUInt32LE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}
