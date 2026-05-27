import * as esbuild from "esbuild";

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const context = await esbuild.context({
  entryPoints: ["src/extension.ts"],
  bundle: true,
  platform: "node",
  target: "node18",
  format: "cjs",
  outfile: "dist/extension.js",
  external: ["vscode", "@homebridge/node-pty-prebuilt-multiarch"],
  sourcemap: !production,
  minify: production,
  logLevel: "info"
});

if (watch) {
  await context.watch();
  console.log("Watching extension sources...");
} else {
  await context.rebuild();
  await context.dispose();
}
