import { cpSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "public");
const target = resolve(root, "dist");

rmSync(target, { recursive: true, force: true });
cpSync(source, target, { recursive: true });

console.log("Build output created in dist/");
