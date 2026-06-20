import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "public");
const target = resolve(root, "dist");

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });

const manifest = {
  version: 1,
  layers: [{ name: "site", target: "STATIC", directory: "." }],
  routes: [{ pattern: "^/.*$", layer: "site", priority: 0 }],
  meta: {
    framework: {
      name: "static",
    },
  },
};

mkdirSync(resolve(target, ".onreza"), { recursive: true });
writeFileSync(
  resolve(target, ".onreza", "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`
);

console.log("Build output created in dist/");
