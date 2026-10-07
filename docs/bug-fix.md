# C3 Bug Evidence: Checkout Stock Validation

## Bug

The checkout endpoint was creating orders even when the requested quantity was greater than the available stock.

The expected behavior is that checkout should reject the entire order when any requested quantity exceeds the product's available stock.

## Reproduction

I started the application and sent an order for product `1` with a quantity of `9999` using user `3`.

Command used:

    Invoke-RestMethod -Uri "http://localhost:3000/api/orders" -Method Post -ContentType "application/json" -Body '{"userId": 3, "items": [{"productId": 1, "qty": 9999}]}'

The quantity was intentionally set much higher than the available stock so that the stock validation path would be tested.

## Observed Result

The API returned HTTP 201 Created and created an order containing product ID 1 with quantity 9999. The order total was `799820.01`. This was incorrect. The order should have been rejected instead of being created.

## Red Check

I then checked the same scenario expecting the API to return HTTP 400 for insufficient stock. The check went red and exited with code 1 because the API returned 201 instead of the expected 400. This ruled out the hypothesis that checkout was already enforcing the required stock limit.

## Diagnosis

The checkout code was reading product information without using the available `stock_quantity` to validate the requested quantity before creating the order. As a result, an order could be created even when the requested quantity exceeded the available inventory.

## Fix Direction

The checkout flow needs to validate every requested item's quantity against its current `stock_quantity` before creating the order. If any item exceeds the available stock, the entire order should be rejected.

## Root Cause

Two problems in `server.js` had to be fixed:

1. **No stock check in checkout.** `POST /api/orders` loaded products with `SELECT id, name, price`. It never read `stock_quantity`, so nothing compared the requested `qty` with the available stock before inserting the order.
2. **The server could not start.** `initDatabase` contained a second copy of the users/carts/orders table setup and the product seeding (the old seed without `stock_quantity`). The second `const countRow` made `server.js` fail to load with `SyntaxError: Identifier 'countRow' has already been declared`. The committed version before the fix failed even earlier, on `const count Row`. So at the time of the fix, the committed `server.js` could not be used to reproduce the bug.

## Red Test

Added `tests/checkout-stock.test.js`, a `node:test` regression test. It starts a copy of `server.js` in a temp directory on a random port with its own SQLite database, so it never touches `data/store.db` and does not need a running server. The test:

- signs up a user,
- orders product 1 with `qty = stock_quantity + 1` (stock 10, qty 11),
- expects HTTP 400, no new order, and unchanged `stock_quantity`.

Against the committed `server.js`, the test failed because the server exited before listening (the syntax error above). That is not a valid red for C3. To confirm the test catches the real bug, it was also run against a throwaway copy of `server.js` with only the duplicate `countRow` renamed. That run gave the expected red:

    AssertionError: expected 400 for qty > stock, got 201: {"order":{"id":1, ... "qty":11, "lineTotal":879.89}],"total":879.89, ...}}

## Fix

Committed in `8ae60ae` ("Reject checkout when quantity exceeds stock (C3)"):

- Removed the duplicated block in `initDatabase` so the server starts. The remaining seed sets `stock_quantity = 10`.
- `POST /api/orders` now selects `stock_quantity`. If any item's `qty` is greater than its stock, the whole order is rejected with HTTP 400 and `"Insufficient stock for <product name>."`. The check runs before the order is inserted and before the cart is cleared.

## Green Test

    node --test tests/checkout-stock.test.js

    ✔ checkout rejects an order whose quantity exceeds available stock
    ℹ tests 1
    ℹ pass 1
    ℹ fail 0

A one-off manual check (not committed) confirmed that ordering exactly the available stock (`qty = 10`) still returns HTTP 201.

## Alternative Cause Ruled Out

**Hypothesis:** the bug was in the stock data, not in checkout. If products had no usable `stock_quantity` (the column missing, the backfill failing, or the duplicated stock-less seed leaving stock at `0`), the fix would belong in `initDatabase`, not in `POST /api/orders`.

**Evidence against it:**

- The pre-fix `server.js` (`git show 8ae60ae^:server.js`) already created the column, `stock_quantity INTEGER NOT NULL DEFAULT 0`, plus an `ALTER TABLE` and a backfill to `10` for existing databases. It also seeded products with `stock_quantity`, and `GET /api/admin/overview` already selected it.
- The red run used a copy of that `server.js` with only `countRow` renamed, so it still contained the duplicated block. Before ordering, the test read the product's stock from `GET /api/admin/overview` and asserted it was greater than `0`. The test got past that assertion and only failed on the status check. The response shows `qty` `11` (stock + 1), so stock was `10` when checkout accepted the order.
- In `8ae60ae`, the only `POST /api/orders` changes were adding `stock_quantity` to the `SELECT` and adding the comparison. The only `initDatabase` changes were the `countRow` fix and removing the duplicated block. With the handler change in place, the same test went green.

Stock was present and correct. Checkout just never read it.

## Where the Finding Belongs

**Test.** The missing safeguard was a test:

- **Not the spec.** `docs/inventory_spec.md` already required this: Functional Requirement 2 rejects the whole order, Technical Requirement 2 adds a validation step to `POST /api/orders`, and Error Handling requires HTTP 400. The spec was correct and did not need to change.
- **Not code structure.** The fix was one extra column in an existing `SELECT` and one comparison inside the existing handler. The structural limits in the code (one shared `db` connection, no transaction helper) affect Unit 4's atomic deduction, not this bug.
- **Test.** Nothing ran checkout against stock, and nothing even loaded `server.js`, which is how a syntax error reached a commit unnoticed. `tests/checkout-stock.test.js` covers both. It boots `server.js`, so a startup failure fails the test, and it checks that `qty > stock` returns 400 with no order and unchanged stock.

## Remaining Work (outside this fix)

- A successful checkout does not decrement `stock_quantity`. `docs/inventory_spec.md` requires the decrement to happen in the same transaction as order creation. That is not implemented yet.
- `tests/regression_test_stock.js` (the earlier manual check, untracked) still targets a running server on port 3000 and writes to `data/store.db`. `tests/checkout-stock.test.js` replaces it.
