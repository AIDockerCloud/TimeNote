// apps 构建配置：apps/index.ts → apps/index.mjs（ESM）
// 只给测试 import 用，不进任何发布包。
import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["apps/index.ts"],
  outfile: "apps/index.mjs",
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2018",
  logLevel: "info",
  minify: false
});
