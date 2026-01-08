# Real-Time Perpetual Inventory Management System

**Client:** Finance Department / Bookstore

**Status:** Phase 1 (Core Architecture Skeleton)

## Project Overview
This is a Real-Time Inventory Management System designed to replace legacy manual tracking. The primary focus is **Financial Integrity** and **Auditability**. The system adheres to the Perpetual Inventory accounting method, ensuring that every stock movement is logged, atomic, and verifiable.

**Key Features:**
*   **Real-time Dashboard:** Live stock updates via WebSockets (Firestore).
*   **Scanner Optimized:** UI designed for USB Barcode Scanners (Keyboard Emulation).
*   **Audit Trail:** Immutable transaction logs for every inventory change.
*   **Race Condition Prevention:** Uses database transactions to prevent overselling.

## The Business Logic
The system enforces the **Perpetual Inventory Formula**:

```math
Ending Inventory = Beginning Inventory + Receiving - Return/Pull Out - Issuance/Shipments + Issuance Returns
```

### Transaction Types
| Type | Logic | Description |
| :--- | :--- | :--- |
| **RECEIVE** | (+) Stock | New deliveries from publishers/suppliers. |
| **SALE** | (-) Stock | Standard POS transaction to student. |
| **RETURN_IN** | (+) Stock | Student returns an item (Restocking). |
| **RETURN_OUT** | (-) Stock | Damaged/Unsold items returned to vendor. |

## Tech Stack
*   **Frontend:** React (Vite), Tailwind CSS v3, DaisyUI.
*   **Backend:** Firebase (Serverless).
*   **Database:** Cloud Firestore (NoSQL).
*   **Deployment:** Vercel.

## Setup & Installation

### Prerequisites
*   Node.js (v18+)
*   A Firebase Project with Firestore enabled.

### Installation
1.  Clone the repository:
    ```bash
    git clone https://github.com/roma5840/inventory-system.git
    cd inventory-system
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Configure Environment:
    *   Update `src/lib/firebase.js` with your specific Firebase Project Config keys.
4.  Run the development server:
    ```bash
    npm run dev
    ```

## Database Schema (NoSQL)

### `products` Collection
Stores the "Master Data" or current state of inventory.
```json
{
  "id": "978013409",  // BARCODE (Document ID)
  "name": "Financial Accounting Vol 1",
  "price": 1500,
  "currentStock": 50,
  "minStockLevel": 10
}
```

### `transactions` Collection
Stores the "Audit Trail." **Never delete records from here.**
```json
{
  "id": "Auto-Generated-ID",
  "type": "SALE", // or RECEIVE, RETURN, etc
  "productId": "978013409",
  "productName": "Financial Accounting Vol 1", // Denormalized for easier reporting
  "qty": 1,
  "previousStock": 50,
  "newStock": 49,
  "timestamp": "Timestamp(ServerTime)",
  "userId": "admin_uid"
}
```

## Critical Implementation Details
**Why Firestore Transactions?**
We are dealing with financial assets. If two cashiers sell the last book at the exact same second:
1.  Without Transactions: Both sales succeed, stock goes to -1.
2.  With Transactions: The second request fails/retries because the document changed mid-read. Data integrity is prioritized over speed.