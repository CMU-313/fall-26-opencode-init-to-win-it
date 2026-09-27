import { join } from "node:path"

// Single source of truth for the assignment name, shared by every plugin in this repo.
// Kept at `.opencode/assignment.ts` rather than inside `plugin/` so it is not auto-loaded
// as a plugin (every `.ts` under `plugin/` is, see ConfigPlugin.load).
export function assignmentPath(worktree: string) {
  return join(worktree, ".opencode", "assignment.json")
}

export async function readAssignment(worktree: string) {
  const file = Bun.file(assignmentPath(worktree))
  if (!(await file.exists())) return undefined
  const parsed: unknown = await file.json().catch(() => undefined)
  if (typeof parsed !== "object" || parsed === null || !("assignment" in parsed)) return undefined
  return typeof parsed.assignment === "string" ? parsed.assignment : undefined
}

export async function writeAssignment(worktree: string, assignment: string) {
  const file = assignmentPath(worktree)
  await Bun.write(file, JSON.stringify({ assignment }, null, 2) + "\n")
  return file
}
