import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Flag } from "@opencode-ai/core/flag/flag"
import { Permission } from "@/permission"

/**
 * Task 3 (runtime): when student mode is on, block file-write / execute tools.
 *
 * Modeled on plan mode's `edit: deny` pattern in `agent.ts`, plus `bash: deny`
 * so the agent cannot write files or run shell commands for the student.
 *
 * Task 2 alignment (toggle):
 * - Provisional enablement: `OPENCODE_STUDENT_MODE=1|true`
 * - Expected config key once Task 2 lands: `student_mode?: boolean`
 *   (replace / extend `enabled()` — do not invent a second competing API)
 */
export const RULESET_CONFIG = {
  edit: "deny",
  bash: "deny",
} as const

/** Hardcoded deny ruleset for student mode (edit + bash). */
export function ruleset(): PermissionV1.Ruleset {
  return Permission.fromConfig(RULESET_CONFIG)
}

/**
 * If student mode is enabled, merge deny rules after the base agent ruleset.
 * Later rules win in `Permission.evaluate` (`findLast`), so these denies stick.
 */
export function apply(base: PermissionV1.Ruleset, studentMode: boolean): PermissionV1.Ruleset {
  if (!studentMode) return base
  return Permission.merge(base, ruleset())
}

export type EnabledInput = {
  /** Override env lookup (tests). Defaults to process env via Flag. */
  env?: NodeJS.ProcessEnv
  /**
   * Task 2 config hook. When present, `student_mode: true` enables the mode.
   * Env flag remains a provisional override for local/dev until Task 2 ships.
   */
  config?: { student_mode?: boolean }
}

/**
 * Provisional detection until Task 2 owns the real flag/config API.
 * Priority: explicit `config.student_mode` if boolean, else `OPENCODE_STUDENT_MODE`.
 */
export function enabled(input: EnabledInput = {}): boolean {
  if (typeof input.config?.student_mode === "boolean") {
    return input.config.student_mode
  }
  if (input.env) {
    const value = input.env["OPENCODE_STUDENT_MODE"]?.toLowerCase()
    return value === "true" || value === "1"
  }
  return Flag.OPENCODE_STUDENT_MODE
}

export * as StudentMode from "./student-mode"
