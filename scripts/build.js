import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "public");
const serverSource = resolve(root, "server", "server.js");
const target = resolve(root, "dist");

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });

await build({
  entryPoints: [serverSource],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outfile: resolve(target, "server.js"),
  packages: "bundle",
});

const manifest = {
  version: 1,
  layers: [{ name: "app", target: "COMPUTE", directory: ".", entry: "server.js" }],
  routes: [{ pattern: "^/.*$", layer: "app", priority: 0 }],
  meta: {
    framework: {
      name: "node",
    },
  },
};

mkdirSync(resolve(target, ".onreza"), { recursive: true });
writeFileSync(
  resolve(target, ".onreza", "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);

console.log("Build output created in dist/");
