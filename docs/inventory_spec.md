# Specification: Inventory Management System

## Overview
This document outlines the requirements for implementing an inventory management feature to track product availability, prevent overselling, and maintain accurate stock levels within the e-commerce platform.

## Problem Statement
Currently, the system allows users to order any product regardless of its actual availability. This leads to:
1. **Overselling**: Customers purchase items that are out of stock.
2. **Customer Dissatisfaction**: Orders must be canceled manually, leading to poor user experience.
3. **Operational Overhead**: Manual reconciliation of stock and orders is required.

## Objectives
- Implement a robust mechanism to track stock levels for every product.
- Prevent any order from being processed if the requested quantity exceeds available stock.
- Provide a way for administrators to update stock levels.

## Resolved Ambiguities
The original request is not stored in the repository. The closest record is GitHub issue #1 (Inventory Management), whose goal reads: "keep track of product stock", "stop customers from ordering more than available", "let the admin change stock", "make sure stock and orders are updated correctly". Each line leaves a question open. This spec resolves them as follows:

| Request line | Ambiguity | Options | Decision | Recorded in |
|---|---|---|---|---|
| "stop customers from ordering more than available" | What happens to an order where only some items exceed stock? | Reject the whole order; fulfill the in-stock items (partial fulfillment); cap each quantity at available stock | Reject the whole order with HTTP 400; create no partial order | Issue #1, issue #4, Functional Requirement 2 |
| "keep track of product stock" | What stock do products that existed before the column get? | The column default (`0`); a starting value | `stock_quantity = 10` | Issue #1, issue #2, Technical Requirement 1 |
| "let the admin change stock" | Does the admin set a new total or add/subtract? | Absolute value; delta | Absolute value; deltas are out of scope | Issue #1, issue #3, Functional Requirement 3 |
| "let the admin change stock" | Can stock be set below zero? | Allow; reject | Reject with HTTP 400 | Code only (`server.js`, `PUT /api/admin/products/:id`, commit `5e38c31`) and the issue #3 closing comment; not in issue #3 |
| "make sure stock and orders are updated correctly" | Which writes must succeed or fail together? | Order only; order + stock; order + stock + cart | Order creation, stock deduction and cart clearing in one transaction | Issue #1, issue #5 |
| "stop customers from ordering more than available" | An order lists the same product on several lines, each within stock but together above it. Is it accepted? | Check each line alone (accept; stock goes negative after deduction); check the summed quantity (reject); merge the lines | Reject the whole order with HTTP 400 `Insufficient stock for <name>.` when the lines for a product sum to more than its stock; lines are not merged, and an accepted order keeps them as sent | Code (`server.js`, `POST /api/orders`, conditional stock deduction; Unit 4) and `tests/checkout-transaction.test.js`; decided 2026-10-07 during issue #5; not in any issue |
| "keep track of product stock" | Can a checkout line have a fractional `qty`? Once Unit 4 deducts it, `qty: 1.5` on stock `10` leaves `8.5` (observed 2026-10-07 before this decision) | Accept as-is; round; reject | Checkout quantity is a positive integer. Any line whose `qty` is not a whole number rejects the whole order with HTTP 400 `Quantity must be a whole number.`, before any write. Lines with `qty` ≤ 0 are still dropped as before, and the order is rejected only if no valid line remains | Code (`server.js`, `POST /api/orders`) and `tests/checkout-transaction.test.js`; decided by the user on 2026-10-07 during issue #5; not in any issue |

Still open (not decided anywhere in the repository):
- **Stock for new products**: products created through `POST /api/admin/products` get the column default, `0`.

## Functional Requirements

### 1. Stock Tracking
- Every product in the database must have an associated `stock_quantity` attribute.
- The system must maintain an accurate count of available items.

### 2. Order Validation (The "No Overselling" Rule)
- During the checkout process, the absolute quantity of each item in the cart must be verified against the `stock_quantity`.
- If any item in the cart exceeds the available `stock_quantity`, the entire order must be rejected with a clear error message to the user.

### 3. Inventory Management (Admin)
- Administrators must be able to update the `stock_quantity` of any product.
- Updates must be absolute: the administrator sets a new total value for the `stock_quantity`.

## Technical Requirements

### 1. Database Schema Changes
- **Table**: `products`
- **New Column**: `stock_quantity` (Type: `INTEGER`, Default: `0`)
- **Initialization**: Existing products must be initialized with `stock_quantity = 10`.

### 2. API Changes
- **Endpoint**: `POST /api/orders` (Existing)
  - **Logic**: Add a validation step to check `stock_quantity` before finalizing the order.
  - **Transactionality**: The stock decrement and the cart clearing must occur within the same database transaction as the order creation to ensure atomicity.
- **Endpoint**: `PUT /api/admin/products/:id` (Existing)
  - **Logic**: Allow updates to the `stock_quantity` field by setting an absolute value. Reject a negative value with HTTP `400`.

### 3. Error Handling
- Return HTTP `400 Bad Request` if an order is attempted for out-of-stock items.
- Error response must include a descriptive message (e.g., `"Item [Product Name] is out of stock"`).

## Out of Scope
- Low-stock notifications or alerts.
- Delta-based stock updates (only absolute values are supported).
- Integration with external warehouse management systems.
- Automatic restocking, stock history, stock reservations and multiple warehouses (from issue #1, "Not included").

## Implementation Units
Each unit matches one GitHub issue. A fresh session should need only the issue and this spec. Facts below are taken from the current code.

**Applies to every unit**
- **Stack**: Express + `sqlite3` in one file, `server.js`. Install with `npm install`. Start with `npm start`; the server logs `Cartlane server running on http://localhost:<PORT>`.
- **Database**: `data/store.db`. It is created and migrated by `initDatabase()` in `server.js` at startup.
- **Database access**: requests share one connection (`db`) and the promise helpers `run`, `get` and `all`, which take an optional third argument for another connection. Transactions go through `withTransaction(work)`, which runs `work(txDb)` on a second, dedicated connection inside `BEGIN IMMEDIATE … COMMIT`, rolls back on any error, and runs one transaction at a time. Both connections wait up to 5 s for a lock (`busyTimeout`). Added in Unit 4.
- **Admin routes**: need the owner key in `x-owner-key` or `?key=`. The key comes from `OWNER_KEY` and defaults to `owner123`.
- **Committed tests**: `node --test tests/checkout-stock.test.js tests/checkout-transaction.test.js`. Each starts a copy of `server.js` in a temp directory with its own database. Reuse that pattern for new tests.
- **Done means**: the issue's done condition holds, `server.js` still starts, and the committed test still passes. A unit was previously marked done while the server could not start; see `docs/claude-worklog.md`, Method Judgement.

### Unit 1: Product Stock Schema (issue #2)
- **Depends on**: nothing.
- **Files**: `server.js`, `initDatabase()`:
  - `CREATE TABLE products` with `stock_quantity INTEGER NOT NULL DEFAULT 0`;
  - an `ALTER TABLE` plus `UPDATE … SET stock_quantity = 10` for existing databases;
  - a seed of 10 products, each with stock `10`, for an empty database.
- **Verify**: start on an empty `data/` folder and on an older database without the column. `GET /api/admin/overview` must return `stock_quantity: 10` for every pre-existing product, with other product fields unchanged.
  - No committed test covers this.
  - The `ALTER`/`UPDATE` block ignores every error, so a failed backfill is silent.
- **Out of scope**: the admin update API, checkout validation, stock deduction, low-stock alerts.

### Unit 2: Admin Stock Updates (issue #3)
- **Depends on**: Unit 1. `PUT /api/admin/products/:id` reads and writes `stock_quantity` in the same queries as the other fields. Without the column, every admin product edit fails with HTTP 500, not only stock edits.
- **Files**:
  - `server.js`, `PUT /api/admin/products/:id`.
  - `admin.js`: shows `Stock: <n>` and prompts for a new stock quantity when editing.
- **Requirements**:
  - `stock_quantity` in the body replaces the stored value.
  - A negative value returns HTTP 400.
  - Omitted fields keep their current values.
- **Verify**: with the owner key, `PUT` an absolute value, then confirm it in `GET /api/admin/overview`. Also check that a negative value returns 400 and that editing only `name` or `price` still works.
  - No committed test covers this.
- **Out of scope**: checkout validation, stock deduction, delta updates, low-stock alerts.

### Unit 3: Checkout Stock Validation (issue #4)
- **Depends on**: Unit 1. `POST /api/orders` selects `stock_quantity`; without the column, every checkout fails with HTTP 500.
  - Independent of Unit 2; Units 2 and 3 can be done in either order.
- **Files**: `server.js`, `POST /api/orders`.
- **Requirements**:
  - If any item's `qty` exceeds its `stock_quantity`, return HTTP 400 with `Insufficient stock for <product name>.`
  - This check runs before the order is inserted and before the cart is cleared, so no order or cart change happens.
- **Verify**: `node --test tests/checkout-stock.test.js` (passes as of 2026-10-07). Ordering exactly the available stock must still return 201; covered since Unit 4 by `tests/checkout-transaction.test.js`.
- **Changed by Unit 4**: the check now runs inside the checkout transaction, still before the order insert.
- **Out of scope**: admin stock changes, stock deduction, transactions.
- **Status**: done in commit `8ae60ae`.

### Unit 4: Atomic Order + Stock Deduction (issue #5)
- **Depends on**: Unit 3. Without the check, deduction subtracts any quantity, and the column has no non-negative constraint, so stock can go negative.
- **Files**: `server.js`, `POST /api/orders` and the `withTransaction` helper; `tests/checkout-transaction.test.js`. Before Unit 4, the handler inserted the order and cleared the cart as two separate `run` calls and did not deduct stock.
- **Requirements**:
  - On a successful order, reduce each product's `stock_quantity` by its ordered `qty`.
  - Order insert, stock deductions and cart clearing are one transaction; any failure rolls all of them back.
  - Each line's `qty` must be a whole number; otherwise HTTP 400 `Quantity must be a whole number.` and nothing is written (Resolved Ambiguities). This check runs with the other payload validation, before the transaction opens.
- **Constraints known from the code**:
  - Unit 3's check reads stock before any transaction. Concurrent orders could both pass it unless the check is made part of the transaction, or the decrement is conditional on enough stock.
  - Because every request shares one `db` connection, a `BEGIN … COMMIT` spanning awaited calls can include statements from other requests.
- **How the implementation handles them**:
  - The transaction runs on the dedicated `txDb` connection, so other requests' statements on `db` cannot join it or be rolled back with it.
  - The product read and Unit 3's check run inside the transaction. `BEGIN IMMEDIATE` takes SQLite's write lock at the start, and transactions are queued in-process, so concurrent checkouts see each other's committed deductions.
  - Each deduction is conditional (`WHERE id = ? AND stock_quantity >= ?`). If it changes no row, the order is rejected with HTTP 400 `Insufficient stock for <name>.` and everything rolls back. This also enforces the repeated-lines decision (Resolved Ambiguities).
  - Write order inside the transaction: order insert, stock deductions, cart clear. Stock is unchanged for rejected or failed orders.
- **Verify** (from issue #5's done condition):
  - A test showing a successful order reduces stock by the ordered amounts.
  - A test that forces a failure partway through and shows no order, unchanged stock and an unchanged cart.
  - The existing committed test still passes.
- **Out of scope**: admin stock updates, low-stock alerts, automatic restocking, stock history, reservations, multiple warehouses.
- **Status**: implemented on 2026-10-07; not yet committed. Verified with `node --test tests/checkout-stock.test.js tests/checkout-transaction.test.js`: 6/6 pass, and all five tests in `checkout-transaction.test.js` fail against the pre-Unit 4 `server.js`. See `docs/claude-worklog.md`, section 5.
- **Known limits**:
  - Checkouts in one server process run one at a time.
  - A lock held longer than 5 s (e.g. by another process on the same database) makes the checkout fail with HTTP 500, with nothing written.

## Specification Lifecycle
This specification is considered active during the implementation of the Inventory Management feature. Once the work is completed and verified, this document will be archived and superseded by the post-implementation documentation.

## Success Criteria
- 0% overselling rate in production.
- Successful processing of orders for all in-stock items.
- Ability for admins to successfully update stock levels via existing admin API.
