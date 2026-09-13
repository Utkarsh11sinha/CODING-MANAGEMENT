# Cartlane Store

Cartlane is a lightweight e-commerce demo built with Express + SQLite.
It includes:

- Product catalog
- Signup/login
- Persistent carts for logged-in users
- Checkout and order storage
- Owner dashboard for product and user management
- Optional Google Sheets event sync

All persistent data is stored in `data/store.db`.

## Tech Stack

- Node.js
- Express
- SQLite (`sqlite3`)
- Vanilla HTML/CSS/JS frontend

## Data Model

The database stores the following records:

- `products`
- `users`
- `carts`
- `orders`

On first run, the server seeds 10 demo products automatically.

## Quick Start

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

3. Open the store:

```text
http://localhost:3000
```

4. Open the owner panel:

```text
http://localhost:3000/admin.html
```

## Environment Variables

You can configure these variables before starting the server:

- `PORT`: Server port (default: `3000`)
- `OWNER_KEY`: Owner dashboard/API key (default: `owner123`)
- `GOOGLE_SHEETS_WEBHOOK_URL`: Optional Apps Script webhook URL for event sync

PowerShell example:

```powershell
$env:PORT = "3000"
$env:OWNER_KEY = "owner123"
$env:GOOGLE_SHEETS_WEBHOOK_URL = "https://script.google.com/macros/s/your-deployment-id/exec"
npm start
```

## Owner Dashboard

1. Open `http://localhost:3000/admin.html`
2. Enter the owner key (default: `owner123` unless overridden by `OWNER_KEY`)
3. Load dashboard data
4. Manage records:
   - Add, edit, and delete products
   - Delete users
   - View orders and totals

When a user is deleted, their account and cart are removed. They must sign up again to use the store.

## Google Sheets Integration (Optional)

Cartlane can push server events to Google Sheets using a Google Apps Script webhook.

### 1. Create the Apps Script Webhook

1. Open a Google Sheet.
2. Go to Extensions > Apps Script.
3. Paste this script:

```javascript
function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Events");
  if (!sheet) {
    sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Events");
    sheet.appendRow(["timestamp", "eventType", "payload"]);
  }

  var body = JSON.parse(e.postData.contents || "{}");
  sheet.appendRow([
    body.timestamp || new Date().toISOString(),
    body.eventType || "unknown",
    JSON.stringify(body.payload || {})
  ]);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

4. Deploy > New deployment > Web app
5. Execute as: Me
6. Who has access: Anyone
7. Copy the web app URL

### 2. Configure Cartlane

Set `GOOGLE_SHEETS_WEBHOOK_URL` before `npm start`.

When configured, these events are sent:

- `signup`
- `login`
- `cart_save`
- `order_created`
- `user_deleted`

## API Overview

Public routes:

- `GET /api/products`
- `POST /api/signup`
- `POST /api/login`
- `POST /api/cart/save`
- `POST /api/orders`

Owner routes (require owner key via `?key=...` or `x-owner-key`):

- `GET /api/admin/overview`
- `POST /api/admin/products`
- `PUT /api/admin/products/:id`
- `DELETE /api/admin/products/:id`
- `DELETE /api/admin/users/:id`

## Notes

- Passwords are currently stored in plain text for demo simplicity. Do not use this as-is in production.
- To reset all data, stop the server and delete `data/store.db`, then restart.
