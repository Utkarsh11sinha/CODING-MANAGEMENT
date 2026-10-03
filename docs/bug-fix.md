# C3 Bug Evidence: Checkout/Inventory Stock Enforcement

## 1. Bug/Symptom
The order API fails to validate available stock levels, allowing orders to be created for quantities that exceed current inventory.

## 2. Reproduction Command
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/orders" -Method Post -ContentType "application/json" -Body '{"userId": 3, "items": [{"productId": 1, "qty": 9999}]}'
```

## 3. Observed Result
**HTTP 201 Created**
The API returned a success status and created an order for 9999 units instead of the expected rejection.

## 4. Analysis
The failure of the check (exit code 1) rules out the hypothesis that the checkout process is correctly enforcing stock limits. It demonstrates that the system currently permits orders exceeding available inventory.

## 5. Note
This document serves as pre-fix reproduction evidence.
