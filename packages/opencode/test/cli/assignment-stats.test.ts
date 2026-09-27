import { expect, test } from "bun:test"
import { formatAssignmentStats } from "../../src/cli/cmd/assignment-stats"

test("displays query counts by assignment", () => {
  expect(formatAssignmentStats({ "Assignment 2": 3, "Assignment 1": 1 })).toBe(
    "Assignment 1: 1 query\nAssignment 2: 3 queries",
  )
  expect(formatAssignmentStats({})).toBe("No assignment queries recorded.")
})
test("records queries by assignment without counting the same message twice", async () => {
  const { mkdtemp, mkdir, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { recordAssignmentQuery, readAssignmentCounts } = await import("../../../../.opencode/assignment")

  const worktree = await mkdtemp(join(tmpdir(), "assignment-stats-"))
  try {
    await mkdir(join(worktree, ".opencode"))
    await recordAssignmentQuery(worktree, "hw1", "message-1")
    await recordAssignmentQuery(worktree, "hw1", "message-1")
    await recordAssignmentQuery(worktree, "hw1", "message-2")
    await recordAssignmentQuery(worktree, "hw2", "message-3")

    expect(await readAssignmentCounts(worktree)).toEqual({ hw1: 2, hw2: 1 })
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})
