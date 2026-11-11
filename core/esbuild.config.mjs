// core 构建配置：core/index.ts → core/index.mjs（ESM）
//
// 为什么单独产出一份 ESM：测试脚本要 import 真实实现来验证，
// 而不是像以前那样从 main.js 里按位置切片 —— esbuild 会丢弃源码注释，
// 位置切片在 core 拆成多文件后必然错位（ai/DECISIONS.md DEC-023 背景 ④）。
//
// 这份产物只给测试与开发脚本用，不进任何发布包。
import esbuild from "esbuild";
import process from "process";

await esbuild.build({
  entryPoints: ["core/index.ts"],
  outfile: "core/index.mjs",
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2018",
  logLevel: "info",
  minify: false
});
