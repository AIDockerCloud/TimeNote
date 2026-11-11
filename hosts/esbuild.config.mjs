// hosts 构建配置：hosts/index.ts → hosts/index.mjs（ESM）
//
// 与 core / sources / ui 同理：测试 import 真实实现，不靠字符串切片。
// 只打包平台无关的部分（types + memory adapter），不含 obsidian 适配器。
import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["hosts/index.ts"],
  outfile: "hosts/index.mjs",
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2018",
  logLevel: "info",
  minify: false
});
