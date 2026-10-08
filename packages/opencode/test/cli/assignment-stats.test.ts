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
test("returns empty counts when the query log does not exist", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { readAssignmentCounts } = await import("../../../../.opencode/assignment")

  const worktree = await mkdtemp(join(tmpdir(), "assignment-stats-missing-"))
  try {
    const counts = await readAssignmentCounts(worktree)

    expect(counts).toEqual({})
    expect(formatAssignmentStats(counts)).toBe("No assignment queries recorded.")
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})

test("returns empty counts when the query log is empty", async () => {
  const { mkdtemp, mkdir, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { queryLogPath, readAssignmentCounts } = await import("../../../../.opencode/assignment")

  const worktree = await mkdtemp(join(tmpdir(), "assignment-stats-empty-"))
  try {
    await mkdir(join(worktree, ".opencode"))
    await Bun.write(queryLogPath(worktree), "")

    const counts = await readAssignmentCounts(worktree)

    expect(counts).toEqual({})
    expect(formatAssignmentStats(counts)).toBe("No assignment queries recorded.")
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})
test("ignores invalid records while counting valid queries", async () => {
  const { mkdtemp, mkdir, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { queryLogPath, readAssignmentCounts } = await import("../../../../.opencode/assignment")

  const worktree = await mkdtemp(join(tmpdir(), "assignment-stats-invalid-"))
  try {
    await mkdir(join(worktree, ".opencode"))

    const entries = [
      null,
      42,
      "invalid",
      {},
      { assignment: "hw1" },
      { messageID: "message-1" },
      { assignment: 123, messageID: "message-1" },
      { assignment: "hw1", messageID: 123 },
      { assignment: "hw1", messageID: "message-1" },
      { assignment: "hw2", messageID: "message-2" },
    ]

    await Bun.write(
      queryLogPath(worktree),
      entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
    )

    expect(await readAssignmentCounts(worktree)).toEqual({ hw1: 1, hw2: 1 })
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})