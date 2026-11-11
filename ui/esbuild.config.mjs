// ui 构建配置：ui/index.ts → ui/index.mjs（ESM）
//
// 与 core / sources 同理：测试 import 真实实现，不靠字符串切片。
// 这份产物只给测试与开发脚本用，不进任何发布包。
import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["ui/index.ts"],
  outfile: "ui/index.mjs",
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2018",
  logLevel: "info",
  minify: false
});
