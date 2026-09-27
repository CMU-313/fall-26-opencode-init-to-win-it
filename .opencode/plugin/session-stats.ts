import { tool, type Plugin } from "@opencode-ai/plugin"
import { readAssignment, recordAssignmentQuery, writeAssignment } from "../assignment"

export default (async (input) => ({
  event: async ({ event }) => {
    if (event.type !== "message.updated") return
    const message = event.properties.info
    if (message.role !== "user") return

    const assignment = await readAssignment(input.worktree)
    if (!assignment) return
    await recordAssignmentQuery(input.worktree, assignment, message.id)
  },
  tool: {
    session_stats: tool({
      description: "Statistics for the current session: prompts sent, steps, cost",
      args: {
        assignment: tool.schema.string().describe("Assignment name, e.g. hw2"),
      },
      async execute(args, ctx) {
        const saved = await writeAssignment(input.worktree, args.assignment)
        const messages = (await input.client.session.messages({ path: { id: ctx.sessionID } })).data ?? []
        const parts = messages.flatMap((m) => m.parts)
        const prompts = messages.filter(
          (m) => m.info.role === "user" && !m.parts.every((p) => "synthetic" in p && p.synthetic),
        ).length
        const steps = parts.filter((p) => p.type === "step-finish")
        return [
          `assignment: ${args.assignment}`,
          `saved to: ${saved}`,
          `prompts sent: ${prompts}`,
          `assistant steps: ${steps.length}`,
          `cost: ${steps.reduce((total, p) => total + p.cost, 0).toFixed(4)}`,
        ].join("\n")
      },
    }),
  },
})) satisfies Plugin
