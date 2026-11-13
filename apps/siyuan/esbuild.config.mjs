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

// ③ 样式：三端共用同一份 styles.css，末尾只给思源追加宿主适配段。
//    styles.css 沿用 Obsidian 的 CSS 变量名，思源主题用的是 --b3-*；
//    不映射的话 var() 无定义会让整条声明被丢弃，背景 / 边框 / 文字色全失效。
//    另外部分版本的自定义页签没有确定高度，height:100% 会塌成 0，
//    overflow:hidden 就把整张日历裁没了 —— 给容器一个最小高度兜底。
const HOST_CSS = `

/* ===== TimeNote for 思源：宿主变量 / 容器高度适配 ===== */
:root {
  --background-primary: var(--b3-theme-background, #ffffff);
  --background-secondary: var(--b3-theme-surface, #f5f6f7);
  --background-secondary-alt: var(--b3-theme-surface-light, var(--b3-theme-surface, transparent));
  --background-modifier-border: var(--b3-border-color, #dfe1e5);
  --background-modifier-hover: var(--b3-theme-primary-light, rgba(127,127,127,.12));
  --text-normal: var(--b3-theme-on-background, #202124);
  --text-muted: var(--b3-theme-on-surface, #5f6368);
  --text-on-accent: var(--b3-theme-on-primary, #ffffff);
  --color-accent: var(--b3-theme-primary, #3575f0);
  --interactive-accent: var(--b3-theme-primary, #3575f0);
  --color-green: #1f9d55;
  --color-orange: #e8912d;
  --color-purple: #8a63d2;
  --font-interface: var(--b3-font-family, system-ui, sans-serif);
  --font-monospace: var(--b3-font-family-code, monospace);
}
.timenote-container { min-height: 360px; }
`;
const css = Buffer.from(readFileSync(resolve(root, "styles.css"), "utf8") + HOST_CSS, "utf8");
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
