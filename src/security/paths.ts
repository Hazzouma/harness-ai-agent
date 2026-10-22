import path from "node:path";
export function inside(root: string, relative: unknown): string {
  if (typeof relative !== "string" || !relative.trim())
    throw Error("path must be a non-empty relative path");
  if (path.isAbsolute(relative)) throw Error("Absolute paths are not allowed");
  const r = path.resolve(root, relative),
    rel = path.relative(path.resolve(root), r);
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel))
    throw Error("Path escapes workspace");
  return r;
}
export function safeBranch(value: unknown, blocked: string[]): string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,100}$/.test(value) ||
    value.includes("..") ||
    value.endsWith("/") ||
    blocked.some((x) => x.toLowerCase() === value.toLowerCase())
  )
    throw Error("Invalid or protected branch name");
  return value;
}
