import { Glob } from "bun";
import { join, sep } from "path";

console.log("Initializing build process...");

const glob = new Glob("*/src/**/*.ts");
const entrypoints = [...glob.scanSync(".")];

const groups = new Map<string, string[]>();

for (const entry of entrypoints) {
  const pkg = entry.split(sep)[0];
  if (!groups.has(pkg)) groups.set(pkg, []);
  groups.get(pkg)!.push(entry);
}

let idx = 1;
for (const [pkg, entries] of groups) {
  await Bun.build({
    entrypoints: entries,
    outdir: join(pkg, "dist"),
    target: "browser",
    minify: true,
    naming: "[dir]/[name].mjs",
    root: join(pkg, "src"),
  });
  console.log(
    `\x1b[32m[${idx}/${groups.size}]\x1b[0m Successfully built ${pkg}.`
  );
  idx++;
}

console.log("Build complete.");
