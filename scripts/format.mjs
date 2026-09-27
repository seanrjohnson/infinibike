import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

// Enumerate project files through Git so format checks never traverse ignored
// tool caches, even when a cache contains directories we cannot read.
const root = fileURLToPath(new URL("../", import.meta.url));
const mode = process.argv[2];
if (mode !== "--check" && mode !== "--write") {
  throw new Error("Expected --check or --write");
}
const files = [
  ...new Set(
    execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      {
        cwd: root,
        encoding: "utf8",
        maxBuffer: 16 * 1024 * 1024,
      },
    )
      .split("\0")
      .filter((file) => file && existsSync(join(root, file))),
  ),
];
const prettier = fileURLToPath(
  new URL("../node_modules/prettier/bin/prettier.cjs", import.meta.url),
);
// Small batches also stay below Windows command-line length limits.
for (let offset = 0; offset < files.length; offset += 50) {
  const result = spawnSync(
    process.execPath,
    [
      prettier,
      mode,
      "--ignore-unknown",
      "--",
      ...files.slice(offset, offset + 50),
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}
