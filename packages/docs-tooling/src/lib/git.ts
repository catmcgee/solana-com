import { execFileSync } from "node:child_process";
import { repoRoot } from "./paths.ts";

function git(args: string[]) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
}

/** Repo-relative paths of every tracked file under `prefix` at `ref`. */
export function listFilesAtRef(ref: string, prefix: string): string[] {
  return git(["ls-tree", "-r", "--name-only", ref, "--", prefix])
    .split("\n")
    .filter(Boolean);
}

export function showFileAtRef(ref: string, file: string): string {
  return git(["show", `${ref}:${file}`]);
}
