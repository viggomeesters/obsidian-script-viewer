import esbuild from "esbuild";
import process from "node:process";

const production = process.env.NODE_ENV === "production";

await esbuild.build({
  banner: {
    js: "/* Script Viewer generated bundle */",
  },
  bundle: true,
  entryPoints: ["src/main.ts"],
  external: ["obsidian"],
  format: "cjs",
  logLevel: "info",
  minify: production,
  outfile: "main.js",
  platform: "browser",
  sourcemap: production ? false : "inline",
  target: "es2022",
});
