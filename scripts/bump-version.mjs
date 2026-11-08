#!/usr/bin/env node
/**
 * 版本号递增：每次提交前跑 `npm run bump`，patch +1（1.0.0 → 1.0.1）。
 *
 * 同步三处，避免版本漂移：
 *   1. manifest.json  version（Obsidian 读取的插件版本）
 *   2. package.json   version（npm / lock 一致性）
 *   3. versions.json  version → minAppVersion（社区插件市场要求的版本映射表）
 *
 * 用法：
 *   npm run bump            自动 +0.0.1
 *   npm run bump -- 1.2.0   指定版本（跳过自增）
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(root, "manifest.json");
const packagePath = resolve(root, "package.json");
const versionsPath = resolve(root, "versions.json");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, data) => writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf8");

const bumpPatch = (version) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version).trim());
  if (!m) throw new Error(`版本号不是 x.y.z 形式：${version}`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
};

const manifest = readJson(manifestPath);
const pkg = readJson(packagePath);
const minAppVersion = manifest.minAppVersion || "1.0.0";

const explicit = process.argv[2];
const next = explicit ? String(explicit).trim() : bumpPatch(manifest.version);

if (explicit && !/^\d+\.\d+\.\d+$/.test(next)) {
  throw new Error(`指定的版本号不合法：${explicit}`);
}

const prev = manifest.version;
manifest.version = next;
pkg.version = next;
writeJson(manifestPath, manifest);
writeJson(packagePath, pkg);

const versions = existsSync(versionsPath) ? readJson(versionsPath) : {};
versions[next] = minAppVersion;
const sorted = Object.fromEntries(
  Object.entries(versions).sort(([a], [b]) => {
    const pa = a.split(".").map(Number);
    const pb = b.split(".").map(Number);
    for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
    return 0;
  })
);
writeJson(versionsPath, sorted);

console.log(`版本: ${prev} -> ${next}  (minAppVersion: ${minAppVersion})`);
console.log(`  manifest.json  ${manifest.version}`);
console.log(`  package.json   ${pkg.version}`);
console.log(`  versions.json  ${Object.keys(sorted).length} 条: ${Object.keys(sorted).join(", ")}`);
console.log("记得重新 `npm run build` 再提交（main.js 是产物）。");
