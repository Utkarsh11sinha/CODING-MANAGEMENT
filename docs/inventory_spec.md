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

Still open (not decided anywhere in the repository):
- **Stock for new products**: products created through `POST /api/admin/products` get the column default, `0`.
- **Repeated order lines**: an order that lists the same product on several lines is checked line by line, not by the summed quantity.

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
- **Database access**: all requests share one connection (`db`) and the promise helpers `run`, `get` and `all`. No transaction helper exists.
- **Admin routes**: need the owner key in `x-owner-key` or `?key=`. The key comes from `OWNER_KEY` and defaults to `owner123`.
- **Committed test**: `node --test tests/checkout-stock.test.js`. It starts a copy of `server.js` in a temp directory with its own database. Reuse that pattern for new tests.
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
- **Verify**: `node --test tests/checkout-stock.test.js` (passes as of 2026-10-07). Ordering exactly the available stock must still return 201; this was checked manually once and has no committed test.
- **Out of scope**: admin stock changes, stock deduction, transactions.
- **Status**: done in commit `8ae60ae`.

### Unit 4: Atomic Order + Stock Deduction (issue #5)
- **Depends on**: Unit 3. Without the check, deduction subtracts any quantity, and the column has no non-negative constraint, so stock can go negative.
- **Files**: `server.js`, `POST /api/orders`. It currently inserts the order and clears the cart as two separate `run` calls, and it does not deduct stock.
- **Requirements**:
  - On a successful order, reduce each product's `stock_quantity` by its ordered `qty`.
  - Order insert, stock deductions and cart clearing are one transaction; any failure rolls all of them back.
- **Constraints known from the code**:
  - Unit 3's check reads stock before any transaction. Concurrent orders could both pass it unless the check is made part of the transaction, or the decrement is conditional on enough stock.
  - Because every request shares one `db` connection, a `BEGIN … COMMIT` spanning awaited calls can include statements from other requests.
- **Verify** (from issue #5's done condition):
  - A test showing a successful order reduces stock by the ordered amounts.
  - A test that forces a failure partway through and shows no order, unchanged stock and an unchanged cart.
  - The existing committed test still passes.
- **Out of scope**: admin stock updates, low-stock alerts, automatic restocking, stock history, reservations, multiple warehouses.
- **Status**: not implemented. Planned in a fresh session on 2026-10-07; see `docs/claude-worklog.md`, Fresh-Session Evidence.

## Specification Lifecycle
This specification is considered active during the implementation of the Inventory Management feature. Once the work is completed and verified, this document will be archived and superseded by the post-implementation documentation.

## Success Criteria
- 0% overselling rate in production.
- Successful processing of orders for all in-stock items.
- Ability for admins to successfully update stock levels via existing admin API.
