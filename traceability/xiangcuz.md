# Project 4A — Traceability

**Andrew ID:** xiangcuz  
**Feature:** assignment-stats  
**Team:** Init to win

## 1. Requirements Traceability Table

The requirements below are based on my Project 3 interviews. R1 was a template example, so my actual requirements are R2–R8.

| ID | Interview Evidence | Requirement | Acceptance Criteria | Changed in P4? | Property | Test | AI Assistance |
|---|---|---|---|---|---|---|---|
| R2 | C-3 | The system must not report a positive query count for an assignment with no recorded queries. | An assignment with no valid query records must never have a positive count. | No | Invariant: invalid records do not create positive counts | `R2: invalid records never create positive counts` | Developed through guided discussion with ChatGPT, which explained the invariant and suggested the generator and initial test code. |
| R3 | C-4, S-3 | The system must count each unique message ID at most once per assignment. | Two records with the same assignment and message ID count as one query. The same ID can be counted separately under different assignments. | No | Invariant: deduplication within each assignment | `R3: same message ID counts once in each assignment` | ChatGPT helped identify the cross-assignment edge case and suggested the property and initial test code. I ran the tests, examined the counterexample, and verified the fix. |
| R4 | C-6, S-6, O-7 | Query counts must be independent of the order of log records. | Reordering the same query records produces identical counts for every assignment. | No | Metamorphic: reordering preserves counts | `R4: reordering records preserves counts` | - |
| R5 | S-7, O-8 | Reassigning a query between assignments must update the corresponding counts according to unique message IDs within each assignment. | Moving a uniquely counted query from A to B decreases A's count by one. B's count increases by one if the ID is not already counted in B. | Yes | Metamorphic: reassignment changes counts predictably | `R5: moving a query updates assignment counts` | ChatGPT helped clarify the reassignment behavior and suggested the property, generator, and initial test code. I ran and verified the test. |
| R6 | C-7, S-8 | The system should allow users to view the individual queries included in each assignment's count. | Given three distinct queries for Assignment A, the system displays all three in a detail view, and the number of listed queries matches the reported count. | No | Not selected for P4 testing | — | — |
| R7 | C-2, C-7, S-2, O-3 | The system should count queries by explicitly recorded types, including conceptual questions and clarification requests. | Given two conceptual queries and one clarification query, the system reports 2 conceptual queries and 1 clarification query. | Yes | Not selected for P4 testing | — | - |
| R8 | O-1, O-2, O-10 | The system should generate an assignment-level summary of concepts using concept tags associated with recorded queries. | Given queries tagged with recursion, recursion, and arrays, the summary reports recursion: 2 and arrays: 1. | Yes | Not selected for P4 testing | — | ChatGPT helped review and clarify the requirement's testability. |

**Property test file:** `packages/opencode/test/cli/assignment-stats.property.test.ts`

**Implementation file:** `.opencode/assignment.ts`

## 2. Requirement Changes

### R5 — Reassignment and Deduplication

**Original (P3):**  
Reassigning a unique query from one assignment to another must update both assignments' counts.

**Revised (P4):**  
Reassigning a query between assignments must update the corresponding counts according to unique message IDs within each assignment.

**Reason:**  
The original acceptance criteria assumed that the moved message ID did not already exist in the destination assignment. This could conflict with R3, which requires deduplication within each assignment.

The revised requirement clarifies that moving a uniquely counted query from A to B decreases A's count by one, while B increases by one only when the message ID is not already counted there. This preserves the expectations from S-7 and O-8.

### R7 — Query Type Categorization

**Original (P3):**  
The system should categorize queries by type, including conceptual questions and clarification requests.

**Revised (P4):**  
The system should count queries by explicitly recorded types, including conceptual questions and clarification requests.

**Reason:**  
The original requirement did not specify how the system determines a query's type. The existing query log only records assignment names and message IDs, so automatic classification would require additional logic and a way to validate classification accuracy.

Using explicitly recorded type tags makes the expected counting behavior deterministic and testable. It preserves the interviewees' need to distinguish meaningful conceptual questions from simple clarification requests (C-2, C-7, S-2, O-3).

This functionality would require extending the current log format and is not implemented in P4A.

### R8 — Concept Summary

**Original (P3):**  
The system should generate an assignment-level summary of concepts associated with the user's recorded queries.

**Revised (P4):**  
The system should generate an assignment-level summary of concepts using concept tags associated with recorded queries.

**Reason:**  
The current query records do not contain concept information. Without a defined source of concept labels, it is unclear how the summary should determine which concepts belong to each query.

The revised requirement uses explicit concept tags, making the counts verifiable. It preserves the outside interviewee's goal of identifying difficult concepts for later review (O-1, O-2, O-10).

This functionality requires additional metadata and summary logic, so it is not implemented in P4A.

### Review of Unchanged Requirements

**R2:** Feasible and directly testable because the system already distinguishes valid and invalid query records.

**R3:** Feasible and testable using assignment names and message IDs. Property testing revealed that the original implementation incorrectly deduplicated message IDs globally. This required a code fix rather than a requirement change.

**R4:** Feasible and testable because reordering records should not affect the number of unique queries within each assignment.

**R6:** Feasible as an additional detail-view feature, but not currently implemented. The existing log stores assignment names and message IDs, not full query text. Implementing this requirement would require retrieving or storing the corresponding query content and adding a way to display it. Its acceptance criteria remain checkable, so the requirement is retained for future work.

## 3. Properties and Generator Choices

Four requirements were selected for property-based testing: R2, R3, R4, and R5. All tests use `fast-check` with `fc.asyncProperty()` and run 30 generated cases per property.

### R2 — Invariant

**Property:** Invalid query records must never create positive assignment counts.

**Generator:** `fc.constantFrom()` generates records with missing fields, incorrect field types, null values, and other invalid structures. `fc.array()` generates different combinations of these records.

**Why:** This exercises validation behavior beyond a single fixed invalid record and verifies that invalid entries cannot inflate query counts.

**Expected result:** An input containing only invalid records produces an empty counts object.

### R3 — Invariant

**Property:** The same message ID must be counted only once within an assignment while remaining countable in another assignment.

**Generator:** `fc.stringMatching()` generates nonempty alphanumeric message IDs with different lengths and values.

**Why:** This checks that deduplication depends on both the assignment and message ID, rather than on the message ID alone.

**Expected result:** Recording the same generated ID twice under hw1 and once under hw2 produces `{ hw1: 1, hw2: 1 }`.

### R4 — Metamorphic

**Property:** Reordering query records must not change assignment counts.

**Generator:** `fc.record()` generates records containing assignment names and message IDs. `fc.array()` creates sequences of records, which are then reversed.

**Why:** The generated records cover different assignments, message IDs, and potentially repeated records. Reversing the input tests whether counts depend on record order.

**Expected result:** The counts before and after reordering are identical.

### R5 — Metamorphic

**Property:** Moving a uniquely counted query from Assignment A to Assignment B changes their counts predictably.

**Generator:** `fc.uniqueArray()` generates unique message IDs for each assignment. Different prefixes distinguish A's IDs from B's IDs.

**Why:** This avoids destination collisions in the selected property test, allowing the test to focus on the effect of reassigning a unique query.

**Expected result:** A decreases by one and B increases by one. If A has no remaining queries, it is absent from the returned counts object.

This test covers the no-collision case of R5. The destination-collision condition is specified in the revised requirement but is not separately generated by this property.

## 4. Testing and Triage

### R3 — Bug Found and Fixed

**Initial result:** Failed.

**Counterexample reported by fast-check:** `messageID = "a"`

**Input scenario:**
- Record message "a" under hw1.
- Record message "a" again under hw1.
- Record message "a" under hw2.

**Expected output:** `{ hw1: 1, hw2: 1 }`

**Actual output:** `{ hw1: 1 }`

**Diagnosis:** Code bug.

The original `readAssignmentCounts()` used a global `Set` of message IDs. Once a message ID appeared under one assignment, subsequent records with the same ID were ignored even when they belonged to a different assignment.

This violated R3's requirement to count unique message IDs separately within each assignment.

**Fix:** Changed the deduplication key to include both the assignment name and message ID:

```typescript
const key = JSON.stringify([entry.assignment, entry.messageID])
```

The implementation now checks and stores the combined key instead of the message ID alone.

**Verification:** The R3 property passed after the code fix.

### R2, R4, and R5

All three properties passed after running the updated implementation. No additional code fixes were required for these properties.

### Local Test Results

**Property-based tests:**
- R2: Passed
- R3: Passed
- R4: Passed
- R5: Passed

**Total:** 4 passed, 0 failed, 150 assertions.

**Existing unit tests:** 9 passed, 0 failed, 17 assertions.

These results confirm that the tested behaviors pass locally and that the R3 fix did not break the existing unit tests.

GitHub Actions verification is recorded separately in the PR.

## 5. Hand-written Mutants

Predictions were recorded before running the mutants.

| ID | Requirement | Change | Predicted Killer | Actual Result |
|---|---|---|---|---|
| H1 | R3 | Deduplicate globally using messageID only | R3: cross-assignment IDs should be counted separately | Killed by R3. R3 failed with counterexample `messageID = "a"`. Expected `{ hw1: 1, hw2: 1 }`, but received `{ hw1: 1 }`. R2, R4, and R5 passed. |
| H2 | R2 | Accept some invalid records by weakening validation | R2: invalid records must not create positive counts | Killed by R2. fast-check found a counterexample containing `{"assignment":"hw1","messageID":123}`. Expected `{}`, but received `{ hw1: 1 }`. R3, R4, and R5 passed. |
| H3 | R4 | Keep only the first record for each assignment | R4 may survive; R5 may kill it | Killed by R3, R4, and R5. R4 found a counterexample with two records belonging to hw1 and hw2. The mutant processed only the first record, so reversing the records changed the result from `{ hw1: 1 }` to `{ hw2: 1 }`. R2 passed.|
| H4 | R5 | Skip the first valid log record | R5 should detect incorrect counts | Killed by R4 and R5. R4 found that skipping the first log record caused different counts after reversing the record order. R5 detected that the initial count for Assignment A was missing. R2 and R3 passed. |
| H5 | R3 | Normalize message IDs to lowercase before deduplication | May survive because R3 generates only lowercase IDs | Survived all four properties. The mutant converts message IDs to lowercase before deduplication, but the existing generators only produce lowercase alphanumeric IDs. Therefore, the tests do not detect case-insensitive collisions. |