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

This document records the pre-fix reproduction and diagnosis for C3.