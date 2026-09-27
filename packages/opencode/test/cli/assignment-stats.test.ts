import { expect, test } from "bun:test"
import { formatAssignmentStats } from "../../src/cli/cmd/assignment-stats"

test("displays query counts by assignment", () => {
  expect(formatAssignmentStats({ "Assignment 2": 3, "Assignment 1": 1 })).toBe(
    "Assignment 1: 1 query\nAssignment 2: 3 queries",
  )
  expect(formatAssignmentStats({})).toBe("No assignment queries recorded.")
})
