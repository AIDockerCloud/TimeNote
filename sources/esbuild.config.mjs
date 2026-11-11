// sources 构建配置：sources/index.ts → sources/index.mjs（ESM）
//
// 与 core 同理：测试要 import 真实实现来验证，而不是靠字符串切片
// （esbuild 会丢弃源码注释，位置切片在多文件下必然错位 —— DEC-023 背景 ④）。
//
// 这份产物只给测试与开发脚本用，不进任何发布包。
import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["sources/index.ts"],
  outfile: "sources/index.mjs",
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2018",
  logLevel: "info",
  minify: false
});
