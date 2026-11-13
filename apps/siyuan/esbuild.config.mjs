#!/usr/bin/env node
/**
 * 思源插件打包（DEC-032）。
 *
 *   npm run build:plugins   →  dist/siyuan/package.zip
 *
 * 思源加载器用 window.eval 把 index.js 当 CommonJS 执行，再取
 * `module.exports.default`，且要求 `prototype instanceof require("siyuan").Plugin`。
 * 所以：format=cjs、external 只留 "siyuan"、默认导出插件类。
 * zip 根目录直接放 plugin.json / index.js / index.css / i18n / README / 图片，
 * 不套一层目录（思源集市与手动安装都要求这个结构）。
 */
import esbuild from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildZip, makePng } from "../../scripts/dev/lib/zip.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = resolve(root, "dist/siyuan");
mkdirSync(resolve(outDir, "i18n"), { recursive: true });

const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
const version = String(manifest.version || "");
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`manifest.json 的 version 不合法：${version}`);
  process.exit(1);
}

// ① CommonJS 入口
await esbuild.build({
  entryPoints: [resolve(root, "apps/siyuan/index.ts")],
  outfile: resolve(outDir, "index.js"),
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2018",
  external: ["siyuan"],
  logLevel: "warning",
  minify: false
});

// ② 清单（版本跟随仓库，避免三端漂移）
const pluginJson = JSON.parse(readFileSync(resolve(root, "apps/siyuan/plugin.json"), "utf8"));
pluginJson.version = version;
const pluginJsonText = JSON.stringify(pluginJson, null, 2) + "\n";
writeFileSync(resolve(outDir, "plugin.json"), pluginJsonText);

// ③ 样式：三端共用同一份 styles.css，不改动 Obsidian 产物
const css = readFileSync(resolve(root, "styles.css"));
writeFileSync(resolve(outDir, "index.css"), css);

// ④ 多语言、说明、集市图片
const i18nFiles = ["zh_CN.json", "en_US.json"];
for (const f of i18nFiles) {
  writeFileSync(resolve(outDir, "i18n", f), readFileSync(resolve(root, "apps/siyuan/i18n", f)));
}
const readmeFiles = ["README.md", "README.zh-CN.md"];
for (const f of readmeFiles) {
  writeFileSync(resolve(outDir, f), readFileSync(resolve(root, "apps/siyuan", f)));
}
const icon = makePng(160, 160);
const preview = makePng(1024, 768);
writeFileSync(resolve(outDir, "icon.png"), icon);
writeFileSync(resolve(outDir, "preview.png"), preview);

// ⑤ package.zip
const entries = [
  { name: "plugin.json", data: pluginJsonText },
  { name: "index.js", data: readFileSync(resolve(outDir, "index.js")) },
  { name: "index.css", data: css },
  ...i18nFiles.map(f => ({ name: `i18n/${f}`, data: readFileSync(resolve(outDir, "i18n", f)) })),
  ...readmeFiles.map(f => ({ name: f, data: readFileSync(resolve(root, "apps/siyuan", f)) })),
  { name: "icon.png", data: icon },
  { name: "preview.png", data: preview }
];
const zip = buildZip(entries);
const zipPath = resolve(outDir, "package.zip");
writeFileSync(zipPath, zip);

console.log(`思源插件 ${version} 打包完成`);
for (const e of entries) console.log(`  ${e.name.padEnd(22)} ${(e.data.length / 1024).toFixed(1)} KB`);
console.log(`  → ${zipPath} (${(zip.length / 1024).toFixed(1)} KB)`);
