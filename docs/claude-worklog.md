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
- **Alternatives**: Not recorded.
- **Decision**: Reject the entire order with HTTP 400 and a descriptive message if any item's quantity exceeds its `stock_quantity`.
- **Why**: Required by `docs/inventory_spec.md`: the objective "Prevent any order from being processed if the requested quantity exceeds available stock" and Functional Requirement 2, "the entire order must be rejected with a clear error message to the user." The spec's Problem Statement names overselling, manual order cancellation, and manual stock reconciliation as the problems being solved.
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
- **Question**: How should order creation and stock decrement be kept consistent?
- **Alternatives**: Not recorded.
- **Decision**: Perform both in a single atomic database transaction.
- **Why**: "to ensure atomicity" (spec, API Changes) and to prevent "lost update" or "partial success" scenarios (original worklog entry).
- **Status**: **Not yet implemented** (Issue #5).

### Git Safety
- **Question**: How should the agent be prevented from running `git push --force`?
- **Alternatives**: A text-based instruction to the agent alone (`docs/agent-control.md` describes the instruction that the hook backs up).
- **Decision**: Add a `PreToolUse` hook (`.claude/hooks/agent-control.sh`) in the project's `.claude/settings.json` that blocks Bash commands containing `push --force`, in addition to the instruction.
- **Why**: "an agent might occasionally ignore or misinterpret text-based instructions, and the hook provides a secondary, programmatic layer of safety" (`docs/agent-control.md`). Why the hook is project-level rather than user-level is not recorded.
- **Coverage**: It does not block `git push -f`, plain `git push`, `git reset --hard`, or `git clean`. When tested with sample input, it matched only compact JSON (`"command":"…"`) and allowed the same command with a space after the colon.

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
- [ ] Issue #5: Atomic Order + Stock Deduction — not yet implemented
- [x] Git Guardrail Implementation — blocks `push --force` only (see Key Design Decisions)

## Process Notes

### Context Management for Issue #2 Completion
**Question**: After completing Issue #2, should the session context be kept or cleared before the next ticket?

**Alternatives**: Not recorded.

**Decision**: Chose to clear the session context before proceeding to the next ticket.

**When**: After completing Issue #2 and before starting Issue #3. The date and commit are not recorded.

**Rationale**: 
- Issue #2 (Product Stock Schema) is fully implemented and verified. *(Correction: no committed `server.js` before `8ae60ae` could load, so this verification could not have been against committed code.)*
- The next ticket (Issue #3) operates within its own distinct scope.
- All essential implementation details, requirements, and constraints are preserved in the specification (`docs/inventory_spec.md`), the GitHub issues, and this worklog.

## Documentation Gaps (not yet recorded)
These are known to be missing. They need input from the people who made the decisions and are intentionally left blank rather than reconstructed:
- **Whole-order rejection**: Which alternatives, if any, were considered.
- **Stock initialization**: Why the initial value is 10.
- **Transactionality**: Which alternatives, if any, were considered.
- **Git safety**: Why the guardrail is project-level rather than user-level.
- **Context clearing**: Which alternatives, if any, were considered.
- **Undocumented behavior**: Products created through `POST /api/admin/products` get the column default `stock_quantity = 0`; no decision about this is recorded.
- **Context decision timing**: The date or commit of the Issue #2 context-clearing decision.
