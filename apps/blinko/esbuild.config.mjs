#!/usr/bin/env node
/**
 * Blinko 插件打包（DEC-032）。
 *
 *   npm run build:plugins   →  dist/blinko/release.zip
 *
 * Blinko 的 PluginManagerStore 用 `System.import("/plugins/<name>/index.js")`
 * 加载插件并取 `module.default`，所以产物必须是 SystemJS 的
 * `System.register([], exports => ({execute: ...}))` 单文件模块。
 * 做法：esbuild 先编成 IIFE（globalName），再由本脚本包一层 register —— 不需要
 * vite-plugin-blinko / preact / bun 那一整套工具链，零新增运行时依赖。
 *
 * 官方安装器固定下载 `<repo>/releases/download/v<version>/release.zip`，
 * zip 根目录直接放 index.js / index.css / plugin.json / README*.md。
 */
import esbuild from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildZip } from "../../scripts/dev/lib/zip.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = resolve(root, "dist/blinko");
mkdirSync(outDir, { recursive: true });

const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
const version = String(manifest.version || "");
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`manifest.json 的 version 不合法：${version}`);
  process.exit(1);
}

// ① IIFE → SystemJS 包装
const result = await esbuild.build({
  entryPoints: [resolve(root, "apps/blinko/index.ts")],
  bundle: true,
  format: "iife",
  globalName: "TimeNoteBlinkoPlugin",
  platform: "browser",
  target: "es2018",
  write: false,
  logLevel: "warning",
  minify: false,
  // 版本跟随 manifest.json，避免入口里手写常量漂移（DEC-032 遗留）
  define: { __TIMENOTE_VERSION__: JSON.stringify(version) }
});
const iife = result.outputFiles[0].text;
const systemJs = `/* TimeNote for Blinko — SystemJS module (generated, do not edit) */\n` +
  `System.register([], function (exports) {\n` +
  `  return {\n` +
  `    execute: function () {\n` +
  iife.split("\n").map(l => `      ${l}`).join("\n") + "\n" +
  `      exports('default', TimeNoteBlinkoPlugin.default || TimeNoteBlinkoPlugin);\n` +
  `    }\n` +
  `  };\n` +
  `});\n`;
writeFileSync(resolve(outDir, "index.js"), systemJs);

// ② 清单（版本跟随仓库）
const pluginJson = JSON.parse(readFileSync(resolve(root, "apps/blinko/plugin.json"), "utf8"));
pluginJson.version = version;
const pluginJsonText = JSON.stringify(pluginJson, null, 2) + "\n";
writeFileSync(resolve(outDir, "plugin.json"), pluginJsonText);

// ③ 样式：宿主从插件目录扫描所有 .css 并注入 <style>，文件名任意
const css = readFileSync(resolve(root, "styles.css"));
writeFileSync(resolve(outDir, "index.css"), css);

const readmes = ["README.md", "README_zh.md"];
for (const f of readmes) {
  writeFileSync(resolve(outDir, f), readFileSync(resolve(root, "apps/blinko", f)));
}

// ④ release.zip
const entries = [
  { name: "index.js", data: Buffer.from(systemJs, "utf8") },
  { name: "index.css", data: css },
  { name: "plugin.json", data: pluginJsonText },
  ...readmes.map(f => ({ name: f, data: readFileSync(resolve(root, "apps/blinko", f)) }))
];
const zip = buildZip(entries);
const zipPath = resolve(outDir, "release.zip");
writeFileSync(zipPath, zip);

console.log(`Blinko 插件 ${version} 打包完成`);
for (const e of entries) console.log(`  ${e.name.padEnd(22)} ${(e.data.length / 1024).toFixed(1)} KB`);
console.log(`  → ${zipPath} (${(zip.length / 1024).toFixed(1)} KB)`);
