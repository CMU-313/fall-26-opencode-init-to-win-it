import { describe, expect, test } from "bun:test"
import fc from "fast-check"
import type { ConfigPermissionV1 } from "@opencode-ai/core/v1/config/permission"
import { Permission } from "../../src/permission"
import { StudentMode } from "../../src/agent/student-mode"

/**
 * Generators aim at the boundaries interviewees cared about:
 * - assignment-like paths and odd write targets (append/truncate-style names)
 * - shell commands students might ask the agent to run (python homework, echo redirects)
 * - allow-heavy base rulesets like the default build agent, so student denies must win
 * - env truthy/falsey strings that students might set by hand
 */
const pathArb = fc.oneof(
  fc.constantFrom(
    "homework.py",
    "src/main.ts",
    "assignment/soln.py",
    "../outside.txt",
    "README.md",
    ".env",
    "file with spaces.txt",
  ),
  fc
    .stringMatching(/^[A-Za-z0-9._/-]{1,40}$/)
    .filter((value) => value.replaceAll("/", "").length > 0),
)

const bashCommandArb = fc.oneof(
  fc.constantFrom(
    "python homework.py",
    "ls -la",
    "echo hi > homework.py",
    "rm -rf .",
    "git status",
    "bun test",
    "cat homework.py",
  ),
  fc.stringMatching(/^[A-Za-z0-9 ._\-|>]{1,40}$/),
)

const ALLOW_BASES: ConfigPermissionV1.Info[] = [
  { "*": "allow" },
  { "*": "allow", edit: "allow", bash: "allow", read: "allow" },
  { "*": "allow", edit: "allow", bash: "allow", read: "allow", question: "allow" },
  { edit: "allow", bash: "allow", read: "allow" },
]
const allowBaseArb = fc.constantFrom(...ALLOW_BASES)

const truthyEnvArb = fc.constantFrom("1", "true", "TRUE", "True")
const falseyEnvArb = fc.constantFrom("0", "false", "FALSE", "", "no", "off")

const EDIT_FAMILY = ["edit", "write", "apply_patch"] as const
const TOOLS = ["edit", "write", "apply_patch", "bash", "read"] as const

const assertOpts = { numRuns: 50 }

describe("StudentMode properties", () => {
  // R1: When config.student_mode is a boolean, that value decides whether student
  // mode is on, regardless of OPENCODE_STUDENT_MODE.
  // Kind: invariant
  test("R1: config.student_mode beats OPENCODE_STUDENT_MODE", () => {
    fc.assert(
      fc.property(fc.boolean(), truthyEnvArb, falseyEnvArb, (flag, truthy, falsey) => {
        const againstTruthyEnv = StudentMode.enabled({
          config: { student_mode: flag },
          env: { OPENCODE_STUDENT_MODE: truthy },
        })
        const againstFalseyEnv = StudentMode.enabled({
          config: { student_mode: flag },
          env: { OPENCODE_STUDENT_MODE: falsey },
        })
        expect(againstTruthyEnv).toBe(flag)
        expect(againstFalseyEnv).toBe(flag)
      }),
      assertOpts,
    )
  })

  // R2: While student mode is on, write and apply_patch are denied the same way as edit.
  // Kind: invariant
  test("R2: write and apply_patch are disabled with edit", () => {
    fc.assert(
      fc.property(allowBaseArb, (config) => {
        const rules = StudentMode.apply(Permission.fromConfig(config), true)
        const hidden = Permission.disabled([...TOOLS], rules)
        for (const tool of EDIT_FAMILY) {
          expect(hidden.has(tool)).toBe(true)
        }
      }),
      assertOpts,
    )
  })

  // R3: While student mode is on, bash is denied.
  // Kind: invariant
  test("R3: bash is denied for any command", () => {
    fc.assert(
      fc.property(allowBaseArb, bashCommandArb, (config, command) => {
        const rules = StudentMode.apply(Permission.fromConfig(config), true)
        expect(Permission.evaluate("bash", command, rules).action).toBe("deny")
        expect(Permission.disabled([...TOOLS], rules).has("bash")).toBe(true)
      }),
      assertOpts,
    )
  })

  // R4: While student mode is on, read-only actions stay allowed.
  // Kind: metamorphic — turning student mode on must not change an allowed read into a deny,
  // and must not hide the read tool.
  test("R4: turning student mode on keeps allowed reads allowed", () => {
    fc.assert(
      fc.property(allowBaseArb, pathArb, (config, path) => {
        const base = Permission.fromConfig(config)
        const before = Permission.evaluate("read", path, base).action
        fc.pre(before === "allow")

        const student = StudentMode.apply(base, true)
        expect(Permission.evaluate("read", path, student).action).toBe("allow")
        expect(Permission.disabled([...TOOLS], student).has("read")).toBe(false)
      }),
      assertOpts,
    )
  })

  // R5: Turning student mode off allows the previously refused write; turning it
  // back on refuses that write again. Only the current setting matters.
  // Kind: round-trip
  test("R5: off/on round-trip restores deny for edits", () => {
    fc.assert(
      fc.property(allowBaseArb, pathArb, (config, path) => {
        const base = Permission.fromConfig(config)
        fc.pre(Permission.evaluate("edit", path, base).action === "allow")

        const on = StudentMode.apply(base, true)
        const off = StudentMode.apply(base, false)
        const onAgain = StudentMode.apply(base, true)

        expect(Permission.evaluate("edit", path, on).action).toBe("deny")
        expect(Permission.evaluate("edit", path, off).action).toBe("allow")
        expect(off).toBe(base)
        expect(Permission.evaluate("edit", path, onAgain).action).toBe("deny")
      }),
      assertOpts,
    )
  })
})
