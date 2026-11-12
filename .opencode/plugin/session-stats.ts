import { tool, type Plugin } from "@opencode-ai/plugin"
import { readAssignment, recordAssignmentQuery, writeAssignment } from "../assignment"

export const ASSIGNMENT_CONFLICT_MESSAGE =
  "Only one assignment per summary. Complete the assignment in one session terminal or press –continue to come back to the session later."

export function assignmentConflict(existing: string | undefined, requested: string) {
  return existing !== undefined && existing !== requested ? ASSIGNMENT_CONFLICT_MESSAGE : undefined
}

export type SessionMessage = {
  info: {
    id?: string
    role: string
    modelID?: string
    parentID?: string
    error?: {
      name?: string
    }
  }
  parts: Array<{
    type: string
    synthetic?: boolean
    cost?: number
    tokens?: {
      input?: number
      output?: number
      reasoning?: number
      cache?: {
        read?: number
        write?: number
      }
    }
  }>
}

const finiteNonNegative = (value: number | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0

export function computeStats(messages: SessionMessage[]) {
  const parts = messages.flatMap((message) => message.parts)
  const steps = parts.filter((part) => part.type === "step-finish")
  const cancelledPromptIDs = new Set(
    messages.flatMap((message) =>
      message.info.role === "assistant" && message.info.error?.name === "MessageAbortedError" && message.info.parentID
        ? [message.info.parentID]
        : [],
    ),
  )
  const prompts = messages.filter(
    (message) =>
      message.info.role === "user" &&
      !cancelledPromptIDs.has(message.info.id ?? "") &&
      !message.parts.every((part) => "synthetic" in part && part.synthetic),
  ).length
  const assistantModels = [
    ...new Set(
      messages.flatMap((message) =>
        message.info.role === "assistant" && message.info.modelID ? [message.info.modelID] : [],
      ),
    ),
  ]
  const tokenParts = steps.filter((part) => part.tokens)
  const tokens = tokenParts.reduce(
    (total, part) => ({
      input: total.input + finiteNonNegative(part.tokens?.input),
      output: total.output + finiteNonNegative(part.tokens?.output),
      reasoning: total.reasoning + finiteNonNegative(part.tokens?.reasoning),
      cacheRead: total.cacheRead + finiteNonNegative(part.tokens?.cache?.read),
      cacheWrite: total.cacheWrite + finiteNonNegative(part.tokens?.cache?.write),
    }),
    { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
  )

  return {
    prompts,
    steps: steps.length,
    cost: steps.reduce((total, part) => total + finiteNonNegative(part.cost), 0),
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    reasoningTokens: tokens.reasoning,
    cacheReadTokens: tokens.cacheRead,
    cacheWriteTokens: tokens.cacheWrite,
    models: assistantModels,
    hasTokens: tokenParts.length > 0,
  }
}

export function formatSessionStats(messages: SessionMessage[], assignment: string, saved: string) {
  const stats = computeStats(messages)

  return [
    `assignment: ${assignment}`,
    `saved to: ${saved}`,
    `prompts sent: ${stats.prompts}`,
    `assistant steps: ${stats.steps}`,
    `cost: ${stats.cost.toFixed(4)}`,
    `model: ${stats.models.length > 0 ? stats.models.join(", ") : "unavailable"}`,
    `tokens: ${
      stats.hasTokens
        ? `input=${stats.inputTokens}, output=${stats.outputTokens}, reasoning=${stats.reasoningTokens}, cacheRead=${stats.cacheReadTokens}, cacheWrite=${stats.cacheWriteTokens}`
        : "unavailable"
    }`,
  ].join("\n")
}

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
        const existing = await readAssignment(input.worktree)
        const conflict = assignmentConflict(existing, args.assignment)
        if (conflict) throw new Error(conflict)

        const saved = await writeAssignment(input.worktree, args.assignment)
        const messages = ((await input.client.session.messages({ path: { id: ctx.sessionID } })).data ??
          []) as SessionMessage[]
        return formatSessionStats(messages, args.assignment, saved)
      },
    }),
  },
})) satisfies Plugin
