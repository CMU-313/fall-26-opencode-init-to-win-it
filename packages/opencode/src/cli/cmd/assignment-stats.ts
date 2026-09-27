import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"

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
    console.log(formatAssignmentStats({}))
  }),
})