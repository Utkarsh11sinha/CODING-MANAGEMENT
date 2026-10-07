# Claude Worklog: Inventory Management Implementation

This document records the progress and decisions made during the implementation of the Inventory Management feature for the Cartlane Store.

## Project Overview
**Goal**: Implement a robust inventory tracking system to prevent overselling and allow administrative stock management.

## Tasks

### 1. Compliance Audit & Specification Refinement
**Task**: Perform a final compliance audit of the repository against the Lab 1 requirements and fix missing specification details.

**Prompts/Instructions**:
- "Perform a final compliance audit of the current repository against the Lab 1 requirements... Inspect the current repository and report ONLY the current state."
- "Fix the missing parts in docs/inventory_spec.md. Add: existing products start with stock_quantity = 10, an Out of Scope section, and a Specification Lifecycle section..."

**Changes Made**:
- **Updated `docs/inventory_spec.md`**:
    - Added `Initialization` requirement: Existing products must start with `stock_quantity = 10`.
    - Added `Out of Scope` section: Defined boundaries for the feature (no low-stock alerts, no delta updates).
    - Added `Specification Lifecycle` section: Defined the lifecycle of the document (archived/superseded after completion).

**Results**:
- `docs/inventory_spec.md` now covers initialization, scope, and lifecycle as required for Lab 1.
- At the time, an older root-level `inventory_spec.md` without these additions remained in the repository. It has since been removed so `docs/inventory_spec.md` is the single canonical specification.

### 2. Admin Stock Updates (Issue #3)
**Task**: Implement the ability for administrators to update the stock quantity of existing products via a PUT request.

**Changes Made**:
- **Updated `server.js`**: Modified `PUT /api/admin/products/:id` to accept `stock_quantity` as an absolute value and added validation to ensure the value is not negative.
- **Updated `admin.js`**: Updated the product editing UI to allow users to input a new `stock_quantity`.

**Results**:
- The code accepts an absolute `stock_quantity` on `PUT /api/admin/products/:id`, rejects negative values, and the admin UI prompts for a new stock quantity.
- **Verification gap**: `server.js` failed to parse at every commit before `8ae60ae`, so this behavior could not have been verified against committed code. It has not been re-verified since.

### 3. Git Guardrails Implementation (Lab 2 Evidence)
**Task**: Implement safety hooks to prevent accidental destructive git operations.

**Evidence**:
- **Skill Discovery**: The `git-guardrails-claude-code` skill was reached from a natural language request regarding Git safety.
- **Trigger**: The skill was triggered because the user requested to prevent "accidental force pushes".
- **Verification (Blocked)**: A test simulating `git push --force` was successfully intercepted and blocked by the `PreToolUse` hook.
- **Verification (Allowed)**: A standard `git commit` was successfully permitted, ensuring no interference with normal workflows.
- **Decision**: Chose to implement the guardrail specifically for the project scope via `.claude/settings.json`.

### 4. Checkout Stock Validation
**Task**: Fix checkout accepting orders whose quantity exceeds available stock. Full evidence is in `docs/bug-fix.md`.

**Correction**: Unit 3 was previously marked complete, but `POST /api/orders` had no stock check, and the committed `server.js` did not load: it had a `const count Row` syntax error and a duplicated block in `initDatabase` that redeclared `countRow`.

**Changes Made** (commit `8ae60ae`):
- **Updated `server.js`**: Fixed the `const count Row` syntax error and removed the duplicated `initDatabase` block so the server starts. `POST /api/orders` now returns HTTP 400 if any item's quantity exceeds its `stock_quantity`, before the order is created.
- **Added `tests/checkout-stock.test.js`**: A regression test that starts an isolated copy of the server with its own database.

**Results**:
- The regression test was red against the pre-fix checkout (201 instead of 400) and is green after the fix.
- Out of scope for Issue #4: decrementing stock on successful checkout within the order transaction, as required by `docs/inventory_spec.md`. That is Issue #5 (Atomic Order + Stock Deduction), which is not yet implemented.
- Consequence until Issue #5 is done: `stock_quantity` never decreases, so repeated orders that are each within the stock limit are all accepted. Overselling is still possible, and the spec's "0% overselling" success criterion is not met.

## Key Design Decisions
Each decision lists only what the existing docs support. Where a part is not recorded, it says so; see Documentation Gaps.

### Whole-Order Rejection
- **Question**: When an order contains an item whose quantity exceeds available stock, what should checkout do with the order?
- **Decision**: Reject the entire order with HTTP 400 and a descriptive message if any item's quantity exceeds its `stock_quantity`.
- **Why (recorded at the time)**: Required by `docs/inventory_spec.md`: the objective "Prevent any order from being processed if the requested quantity exceeds available stock" and Functional Requirement 2, "the entire order must be rejected with a clear error message to the user." Issue #4 (2026-09-13) adds "no partial order should be created." The spec's Problem Statement names overselling, manual order cancellation, and manual stock reconciliation as the problems being solved.
- **Alternatives considered at the time**: not recorded.
- **Alternatives (retrospective, 2026-10-07)**:
  - *Partial fulfillment*: create the order with only the in-stock items.
  - *Capping*: lower each quantity to the available stock and create the order.
- **Why the alternatives lose (retrospective, 2026-10-07)**:
  - Both create an order the customer did not ask for, with different contents and a different total, without asking them. Problems like that are what the spec's Problem Statement lists as customer dissatisfaction and manual cancellation.
  - Both need a response contract that tells the customer what was dropped or reduced. The spec defines none, and the frontend would have to handle it.
  - Whole-order rejection needs one 400 and no writes, so there is nothing to undo. This also keeps the check independent of the transaction work in #5.
  - The cost of whole-order rejection is that a customer with one short item gets nothing until they edit the cart themselves.
- **Status**: Implemented in `8ae60ae` (section 4).

### Stock Initialization
- **Question**: What stock value should products that existed before the `stock_quantity` column get?
- **Alternatives**: The spec's default for the new column is `0` (Technical Requirement 1). No other alternatives are recorded.
- **Decision**: Initialize existing products with `stock_quantity = 10`.
- **Why**: "to ensure continuity" (original worklog entry). Why the value is 10 specifically is not recorded.

### Update Method
- **Question**: Should admin stock updates set a new total or apply a change to the current value?
- **Alternatives**: Incremental/decremental (delta) updates.
- **Decision**: Absolute updates; the administrator sets the new total.
- **Why**: "to simplify the API and prevent race condition complexities in the admin interface" (original worklog entry). The spec lists delta-based updates as Out of Scope.

### Transactionality
- **Question**: How should order creation, stock deduction and cart clearing be kept consistent?
- **Alternatives**: Not recorded.
- **Decision**: Perform all three in a single atomic database transaction (issues #1 and #5; added to the spec on 2026-10-07).
- **Why**: "to ensure atomicity" (spec, API Changes) and to prevent "lost update" or "partial success" scenarios (original worklog entry).
- **Status**: **Not yet implemented** (Issue #5).

### Git Safety
- **Question**: How should the agent be prevented from running `git push --force`?
- **Alternatives**: A text-based instruction to the agent alone (`docs/agent-control.md` describes the instruction that the hook backs up).
- **Decision**: Add a `PreToolUse` hook (`.claude/hooks/agent-control.sh`) in the project's `.claude/settings.json` that blocks force pushes (`push` followed by `--force`, `-f`, or a `+refspec`), in addition to the instruction. The hook originally matched only `push --force`; `-f` was added later, and `+refspec` on 2026-10-07.
- **Why**: "an agent might occasionally ignore or misinterpret text-based instructions, and the hook provides a secondary, programmatic layer of safety" (`docs/agent-control.md`). Why the hook is project-level rather than user-level is not recorded.
- **Coverage**: Blocks `push` followed by `--force` (including `--force-with-lease`), `-f`, or a `+refspec` within one command segment, and reads the `command` field with or without spaces around the colon. Tested by feeding sample tool inputs to the script: `git push --force`, `git push -f`, `git push origin main -f` (spaced JSON), and `git push --force-with-lease` were blocked (exit 2); `git status`, `git push origin main`, `git push origin main && rm -f tmp.txt`, and `git push --follow-tags` were allowed (exit 0). The `+refspec` check was added on 2026-10-07: `git push origin +main`, `git push origin +HEAD:main` and `git push origin main +dev` were blocked (exit 2); a `+` in a different command (`git push origin main && echo a +b`), a non-leading `+` in a refspec (`git push origin feature+x`) and a `+` outside a push (`git commit -m "a +b"`) were allowed (exit 0). The original eight cases were re-run with the same results (`docs/agent-control-evidence.md`). Not covered: combined short flags such as `-uf`, commands containing escaped quotes (the field may be read only up to the first quote, before the flag), `git reset --hard`, and `git clean`.

## Issue Dependencies and Order
Source: GitHub issues #1–#5. Issue #1 (Inventory Management) lists the implementation order #2 → #3 → #4 → #5. Each ticket states its own dependency, and those show that not every step in that order is a true dependency.

| Issue | Unit | Depends on (stated in the issue) |
|---|---|---|
| #2 Product Stock Schema | 1 | — (first step) |
| #3 Admin Stock Updates | 2 | #2 |
| #4 Checkout Stock Validation | 3 | #2 |
| #5 Atomic Order + Stock Deduction | — | #4 |

### True dependencies
- **#3 → #2**: "the stock field needs to exist first." `PUT /api/admin/products/:id` reads and writes `stock_quantity` in the same queries as the other product fields. Without the column, SQLite rejects those queries, the error handler returns HTTP 500, and *all* admin product edits break, not just stock edits. That violates #3's requirement that existing product updates keep working.
- **#4 → #2**: "checkout needs the stock value from the products table." `POST /api/orders` selects `stock_quantity` for the ordered products. Without the column, that query fails and every checkout returns HTTP 500.
- **#5 → #4**: "the stock should already be checked before the order is processed." Without validation, deduction would subtract any ordered quantity. The column is `INTEGER NOT NULL DEFAULT 0` with no non-negative constraint, so an order larger than the available stock would drive `stock_quantity` negative.
- **#5 → #2** (indirect, through #4): deduction modifies `stock_quantity`, so the column must exist.

### Preferred order only
- **#3 before #4**: Issue #1 lists Admin Stock Updates before Checkout Stock Validation, but #4 depends only on #2 and explicitly excludes admin-side stock changes. Doing #4 before #3 breaks nothing: checkout validates against the stock values from #2. No reason for this ordering is recorded.
- **#3 before #5**: #5 does not state a dependency on #3 and excludes admin stock updates.

## Status
- [x] Requirement Audit
- [x] Specification Completion
- [x] Implementation Unit 1: Product Stock Schema — code present; not verifiable against committed code before `8ae60ae`
- [x] Implementation Unit 2: Admin Stock Updates — code present; not verifiable against committed code before `8ae60ae`
- [x] Implementation Unit 3 / Issue #4: Checkout Stock Validation — commit `8ae60ae` (see section 4 above)
- [ ] Issue #5: Atomic Order + Stock Deduction — not yet implemented; planned in a fresh session (see Fresh-Session Evidence)
- [x] Git Guardrail Implementation — blocks `git push --force` and `git push -f` (see Key Design Decisions)

## Process Notes

### Context Boundaries
**Boundary 1: after #2, before #3**

*Recorded at the time* (commit `4ab82e5`, 2026-09-13):
- **Decision**: clear the session context before the next ticket.
- **Rationale**:
  - Issue #2 is "fully implemented and verified". *Correction: no committed `server.js` before `8ae60ae` could load, so this could not have been verified against committed code.*
  - Issue #3 "operates within its own distinct scope".
  - Everything needed is "preserved in the project documentation (`docs/inventory_spec.md`) and the GitHub issue tracker".
- **Retained**: the spec and the GitHub issues. This worklog was added to that list later, in `b2d9fdb` (2026-10-06).
- **Date**: not recorded. The note first appears in `4ab82e5`, which already contains the #2 schema code and `stock_quantity` handling in `PUT /api/admin/products/:id`. So the history cannot show the boundary falling between the two units.
- **Alternatives**: not recorded.

*Retrospective (2026-10-07)*:
- **Left out deliberately**: the #2 session's conversation, meaning its exploration, tool output and intermediate attempts. #3 needs only the fact that the column exists and starts at 10, which the spec states, not how #2 got there.
- **Why clearing, not continuing**: #3 would carry #2's schema work into a session about a different route, with nothing to stop it changing #2's code.
- **Why clearing, not compacting**: compacting keeps an unreviewed, model-written summary in the session. Clearing forces anything carried forward into files that can be read and corrected.
- **Cost observed**: the boundary did not stop a wrong claim from crossing it. "Fully implemented and verified" was carried forward in writing, although `server.js` could not start, and was not corrected until the C3 work on 2026-10-06. Writing to files makes claims reviewable, but only if someone re-checks them at the next boundary.

**Boundaries before #4 and before the C3 fix**: not recorded.

**Boundary 2: one fresh planning session per issue, #2–#5 (2026-10-07)**
- **Retained**: that issue and `docs/inventory_spec.md` only.
- **Left out**: all prior conversation, this worklog, other project documentation, and the code history.
- **Result**: each session planned its unit without needing anything else. None implemented anything. See Fresh-Session Evidence.

## Method Judgement (retrospective, added 2026-10-07)
This section was written after the fact. Each point is labelled:
- **Recorded at the time**: stated in GitHub issues #1–#5 (all created 2026-09-13), `docs/inventory_spec.md` as it stood before 2026-10-07, `docs/bug-fix.md`, or earlier worklog entries.
- **Retrospective**: reasoning added on 2026-10-07 from the code, the git history, and the records above. It is not a claim that this reasoning was considered when the issues were written.

No interview or discovery session is recorded for the decomposition, and none is claimed here.

### #4 and #5 as Separate Units
**Recorded at the time**:
- Issue #1 lists Checkout Stock Validation and Atomic Order + Stock Deduction as separate tickets.
- #4 excludes "the final stock deduction/transaction logic". #5 depends on #4 "because the stock should already be checked before the order is processed."
- No other reason for the split is recorded.

**Retrospective (why it was workable)**:
- #4 is a behavior you can observe and test without any transaction: an order with `qty` greater than stock returns HTTP 400, and no order is created. `tests/checkout-stock.test.js` checks exactly that.
- Because #4 stood alone, the C3 fix (`8ae60ae`) could be reproduced, fixed and tested without touching transaction code. #5 now starts from a tested check.

**Cost / tradeoff**:
- *Recorded* (section 4): until #5 is done, `stock_quantity` never decreases, so repeated orders that each fit within stock are all accepted. Overselling is still possible, and the spec's "0% overselling" criterion is not met. #4 on its own delivers none of the spec's success criteria.
- *Retrospective*: the split is by behavior, not by code. Both tickets change the same `POST /api/orders` handler.
- *Retrospective*: #4's check (`server.js:284`) reads stock outside any transaction. Several awaited database calls separate that read from the order insert.
- *Retrospective*: if #5 added the decrement after this check without bringing the check inside the same transaction, two concurrent orders could both pass the check. #5 will therefore probably need to move or repeat #4's check inside the transaction, or use a conditional decrement, so #4's placement of the check is provisional. This rework is expected but not yet observed; #5 has been planned, not implemented.

### #5 as One Atomic Unit
**Recorded at the time**:
- Issue #1: "Order creation, stock deduction and cart clearing should happen together."
- Issue #5: all three "should be part of the same database transaction. If something fails, the changes should be rolled back."
- Spec, API Changes: the decrement must be in the same transaction as order creation "to ensure atomicity".
- Original worklog entry: the goal is to prevent "lost update" or "partial success".
- Discrepancy: until 2026-10-07 the spec named only order creation and stock decrement. Cart clearing appeared only in issues #1 and #5. The spec now includes cart clearing.

**Retrospective (why splitting #5 would not work)**:
- #5's requirement is a property of the three writes together: either all of them commit or none do. Splitting them into separate tickets would produce one of two outcomes:
  - A ticket that ships a write without the transaction. For example, a deduction-only ticket could leave an order with no stock update if the next write fails.
  - A ticket whose only content is wrapping other tickets' writes in a transaction. It could not be tested by itself.
- #5's done condition, "the database rolls back correctly if the operation fails", can only be tested once all three writes are in place.

**Cost / tradeoff (retrospective)**:
- #5 is the largest remaining ticket. It cannot be parallelized, and it delivers nothing until the whole transaction works.
- While it is open, stock is not deducted at all. A non-atomic deduction would have reduced overselling sooner but could leave orders and stock inconsistent on failure. Keeping #5 whole favors consistency over that interim improvement.

### Decomposition Cost Discovered During Implementation
**Recorded facts** (`docs/bug-fix.md`, section 4, git history; parse results re-checked on 2026-10-07 with `node --check` on each commit's `server.js`):
- `server.js` failed to parse at every commit before `8ae60ae`:
  - `4ab82e5` and `8897982`: `countRow` was declared twice.
  - `5e38c31`, `00f12a7`, `efe0a1a`: `const count Row`.
- Even so, issue #2 was closed on 2026-09-21 and Unit 3 was marked complete in this worklog. At that point the server could not start and checkout had no stock check (section 4).
- The work did not land one ticket per commit:
  - `4ab82e5`, the initial project commit, already contains the stock column, the initialization to 10, and `stock_quantity` handling in `PUT /api/admin/products/:id`.
  - `5e38c31` added the negative-stock check, the admin UI change and the git guardrail together. It also introduced the `count Row` error.
- The problem was found only when the C3 reproduction needed a running server. As a result, the claims that #2 and #3 were verified were withdrawn (see Status).

**Retrospective interpretation**:
- Each ticket's done condition is about its own behavior. No ticket and no context boundary required that the whole server start, or that a committed test pass, before the ticket was marked done.
- Splitting the work into independent units left no unit responsible for "the app still runs".
- Clearing context after #2 (Boundary 1, Process Notes) meant later work relied on the written "verified" claim instead of re-checking it.
- Because tickets did not map to commits, the history cannot show which unit introduced which code.
- How #2 was verified is not recorded. This interpretation is the reading most consistent with the record, not a proven cause.

**What this suggests for the remaining work (retrospective)**:
- #5's done condition should include starting the server and running a committed test.
- #5 should land in its own commit.
- These are now part of "Done means" in the spec's Implementation Units section.

### Reframed After Implementation
Every reframe below came from implementation or from auditing it.

| What was believed | What was found | What changed | Recorded |
|---|---|---|---|
| Units 1–3 complete and verified | `server.js` could not start at any commit before `8ae60ae`, and checkout had no stock check | Unit 3 reopened and fixed (`8ae60ae`); Units 1–2 downgraded to "code present, unverified" | When it happened: `e4adac9`, 2026-10-06 |
| Issue #1's order #2 → #3 → #4 → #5 is a chain | Only #3→#2, #4→#2 and #5→#4 are true dependencies; #3 before #4 is preference | Issue Dependencies section separates true dependencies from preferred order | When it happened: `b2d9fdb`, 2026-10-06 |
| #4's check is finished work | It reads stock outside any transaction, so #5 cannot simply add a decrement after it | #4's check is treated as provisional; the constraint is written into the spec's Unit 4 | Retrospective, 2026-10-07 |
| A ticket is done when its own behavior works | That rule let tickets close while the app could not run | "Done means" now also requires the server to start and the committed test to pass | Retrospective, 2026-10-07 |
| The spec and the issues agree | The spec left out cart clearing and the negative-stock rule, which a fresh session following only the spec would miss | Both added to the spec | Retrospective, 2026-10-07 |

## Fresh-Session Evidence
On 2026-10-07, each of issues #2–#5 was given to its own fresh Claude session.
- Each session had no prior conversation and received only that GitHub issue and `docs/inventory_spec.md`, with no other project documentation.
- **These were planning and review sessions, not implementations.** None of them changed code.
- They are evidence that each unit can be planned from its own documentation, not that it was implemented that way.
- Each session's result is summarized below. The full transcripts are not stored in the repository.

### Issue #2: Fresh-Session Plan Review (2026-10-07)
**Setup**: asked for an implementation plan, dependencies, files, verification and out-of-scope behavior.

**Outcome**: planning only; nothing implemented.

**What it identified independently**:
- **Scope**: #2 adds `stock_quantity`, and existing products should start at 10.
- **Dependencies**: none.
- **Files**: `server.js`, `initDatabase()`.
- **Verification**:
  - an empty database and an older database without the column;
  - the server starts;
  - `GET /api/admin/overview` shows the stock;
  - the checkout regression test still passes.
- **Risks**:
  - the backfill failing;
  - stock accidentally being reset on restart.
- **Out of scope**: admin updates, checkout validation, deduction, alerts.
- **Open questions**: repeated order lines; stock for new products.

### Issue #3: Fresh-Session Plan Review (2026-10-07)
**Outcome**: review and planning only; nothing implemented.

**What it identified independently**:
- **Dependencies**: depends on #2, not on #4.
- **Files**: `server.js` (`PUT /api/admin/products/:id`) and `admin.js`.
- **Requirements**:
  - stock is an absolute replacement;
  - negative values return 400;
  - omitted fields keep their existing values.
- **Verification**:
  - absolute replacement;
  - negative values rejected;
  - edits to other fields still work;
  - the server starts;
  - the checkout regression test still passes.
- **Risks / gaps**:
  - Negative-value rejection is recorded only in issue #3's closing comment, not in the issue.
  - The behavior for non-numeric and decimal stock values is not defined.
- **Out of scope**: checkout validation, deduction and transactions, delta updates, alerts, restocking, history and the other items in the spec's Out of Scope.
- **Open question**: stock for newly created products.

### Issue #4: Fresh-Session Plan Review (2026-10-07)
**Outcome**: review and planning only; nothing implemented.

**What it identified independently**:
- **Dependencies**: depends on #2, not on #3; #5 depends on #4.
- **Files**:
  - `server.js` (`POST /api/orders`);
  - `tests/checkout-stock.test.js` for regression coverage.
- **Verification**:
  - insufficient stock is rejected with 400;
  - no order is created and the cart is not changed;
  - the server starts;
  - the regression test passes.
  - It also noted that a successful order for exactly the available stock has no committed test.
- **Open questions**: repeated order lines; concurrency.
- **Out of scope**: admin stock updates, stock deduction, transactions, alerts, restocking, history and the other items in the spec's Out of Scope.

### Issue #5: Fresh-Session Plan Review (2026-10-07)
**Setup**:
- A completely new Claude session with no prior conversation.
- It was given only GitHub issue #5 and `docs/inventory_spec.md`.
- The session's result is recorded below. The full transcript is not stored in the repository.

**Outcome**: the session **planned and reviewed #5 only. It did not implement anything.** No code changed, and #5 remains open.

**What it identified independently**:
- **Dependencies**:
  - #5 depends on #4, because checkout stock validation must exist.
  - Indirectly, #5 depends on #2, because `stock_quantity` must exist.
  - Unit 2 (admin stock updates) is not required.
- **Scope**:
  - The implementation belongs in `POST /api/orders` in `server.js`.
  - Successful orders must reduce `stock_quantity`.
  - It listed the correct out-of-scope areas.
- **Atomicity**:
  - Order creation, stock deduction and cart clearing must be one transaction.
  - A failure partway through must roll everything back.
- **Technical risks**:
  - The check-then-write concurrency risk in Unit 3's stock check.
  - The shared SQLite connection, and what that means for holding a transaction open.
- **Verification**:
  - It proposed tests for successful deduction and for rollback.
  - It identified the existing checkout test, `tests/checkout-stock.test.js`.
- **Open questions**: it flagged that repeated order lines and the stock for new products are unresolved. It did not invent a decision for either.

**What this shows**:
- Issue #5 can be planned from its own documentation without prior session context.
- With only the issue and the spec, a fresh session found:
  - the dependencies specified for #5, and that #3 is not one of them;
  - the files involved;
  - the atomicity and rollback requirements;
  - both known technical risks;
  - how to verify;
  - the scope boundaries;
  - the remaining open questions.
- **Limit**: every item it found is written in the spec, in the Resolved Ambiguities and Implementation Units sections added on 2026-10-07.
  - This shows the documentation is enough on its own.
  - It does not show the session found these points by reading the code.
  - It does not show that #5 can be *implemented* without further context, because the session stopped at the plan.

### What the #2–#5 Planning Sessions Show Together
- **Each unit can be planned from its own issue and the spec without prior session context.** Each session identified:
  - the dependencies specified for its unit (the #3 and #4 sessions each noted that the two do not depend on each other);
  - the files involved;
  - how to verify the unit;
  - the scope boundaries.
- **Limit**: most of what they found is written in the spec sections added on 2026-10-07. This shows the documentation is enough on its own, not that the sessions found these points in the code.
- **Findings that go beyond the spec**:
  - #2: the risk of resetting stock on restart.
  - #3: undefined behavior for non-numeric and decimal stock values.
  - Neither has been added to the spec yet.
- **Not shown**: that any unit can be *implemented* from its documentation alone. Every session stopped at the plan.

### Earlier Implementation Sessions (#2–#4)
The fresh planning sessions above are not the sessions that implemented #2–#4.
- No transcript of those implementation sessions is preserved.
- There is no evidence that #2, #3 or #4 was implemented by a fresh session from the issue and spec alone.

| Unit | Evidence of how it was implemented | What can be verified now |
|---|---|---|
| 1 / #2 | None. The code first appears in `4ab82e5` (2026-09-13), about 80 minutes after the issues were created. The issue was closed on 2026-09-21. | Code present. No committed test. Server did not start until `8ae60ae`. |
| 2 / #3 | Only the Boundary 1 note in Process Notes. Its timing cannot be confirmed from history. | Code present (`4ab82e5`; negative check and UI in `5e38c31`). No committed test. |
| 3 / #4 | `docs/bug-fix.md` records the reproduction, red test and fix. Whether that session started fresh is not recorded. | `node --test tests/checkout-stock.test.js` passes (re-run 2026-10-07). |

## Documentation Gaps (not yet recorded)
These are known to be missing. They need input from the people who made the decisions and are intentionally left blank rather than reconstructed:
- **Alternatives considered at the time** for whole-order rejection, transactionality and context clearing. Retrospective alternatives are in Key Design Decisions and Process Notes.
- **Stock initialization**: why the initial value is 10.
- **Git safety**: why the guardrail is project-level rather than user-level.
- **Boundary 1 timing**: the date of the #2 → #3 context-clearing decision.
- **Session records**:
  - No transcripts are preserved for the #2–#4 implementation sessions.
  - For the 2026-10-07 planning sessions (#2–#5), results are summarized in Fresh-Session Evidence, but the full transcripts are not stored.
- **Open product decisions**:
  - Already listed under "Still open" in the spec's Resolved Ambiguities: stock for new admin-created products; repeated order lines.
  - Raised by the #3 planning session and not yet in the spec: non-numeric and decimal stock values.
