import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { InstanceRef } from "@/effect/instance-ref"
import { readAssignmentCounts } from "../../../../../.opencode/assignment"

export function formatAssignmentStats(counts: Record<string, number>): string {
  const assignments = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))

  if (assignments.length === 0) return "No assignment queries recorded."

  return assignments
    .map(([assignment, count]) => `${assignment}: ${count} ${count === 1 ? "query" : "queries"}`)
    .join("\n")
}
export const AssignmentStatsCommand = effectCmd({
  command: "assignment-stats",
  describe: "show query statistics by assignment",
  handler: Effect.fn("Cli.assignmentStats")(function* () {
    const ctx = yield* InstanceRef
    if (!ctx) return

    const counts = yield* Effect.promise(() => readAssignmentCounts(ctx.worktree))
    console.log(formatAssignmentStats(counts))
  }),
})
