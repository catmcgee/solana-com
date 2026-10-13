import { execFileSync } from "node:child_process";
import { repoRoot } from "./paths.ts";

function git(args: string[], input?: string) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    input,
  });
}

/** Repo-relative paths of every tracked file under `prefix` at `ref`. */
export function listFilesAtRef(ref: string, prefix: string): string[] {
  return git(["ls-tree", "-r", "--name-only", ref, "--", prefix])
    .split("\n")
    .filter(Boolean);
}

/** Repo-relative paths of every file under `prefix` tracked in the index. */
export function listTrackedFiles(prefix: string): string[] {
  return git(["ls-files", "--", prefix]).split("\n").filter(Boolean);
}

export function showFileAtRef(ref: string, file: string): string {
  return git(["show", `${ref}:${file}`]);
}

export function refExists(ref: string): boolean {
  try {
    git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Batch `git mv`. Each pair is moved individually (git mv cannot take
 * different destinations in one call) but parent folders are created first.
 */
export function gitMv(src: string, dest: string) {
  git(["mv", "--", src, dest]);
}

export function gitRm(files: string[]) {
  const chunk = 500;
  for (let i = 0; i < files.length; i += chunk) {
    git(["rm", "-q", "--", ...files.slice(i, i + chunk)]);
  }
}

export function gitAdd(files: string[]) {
  const chunk = 500;
  for (let i = 0; i < files.length; i += chunk) {
    git(["add", "--", ...files.slice(i, i + chunk)]);
  }
}
