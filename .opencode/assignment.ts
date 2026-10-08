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

export function queryLogPath(worktree: string) {
  return join(worktree, ".opencode", "assignment-queries.jsonl")
}

export async function recordAssignmentQuery(worktree: string, assignment: string, messageID: string) {
  const { appendFile } = await import("node:fs/promises")
  await appendFile(queryLogPath(worktree), JSON.stringify({ assignment, messageID }) + "\n")
}

export async function readAssignmentCounts(worktree: string): Promise<Record<string, number>> {
  const file = Bun.file(queryLogPath(worktree))
  if (!(await file.exists())) return {}

  const counts: Record<string, number> = {}
  const seen = new Set<string>()

  for (const line of (await file.text()).split("\n")) {
    if (!line) continue
    const entry: unknown = JSON.parse(line)
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("assignment" in entry) ||
      !("messageID" in entry) ||
      typeof entry.assignment !== "string" ||
      typeof entry.messageID !== "string" ||
      seen.has(entry.messageID)
    ) continue

    seen.add(entry.messageID)
    counts[entry.assignment] = (counts[entry.assignment] ?? 0) + 1
  }

  return counts
}
