# Real-Time Perpetual Inventory Management System

**Client:** Finance Department / Bookstore  
**Developers:** Ryan Oliver Aquino & Jancesar Taguiang

## Project Overview
This is a Real-Time Inventory Management System designed to replace legacy manual tracking. The primary focus is **Financial Integrity** and **Auditability**. The system adheres to the Perpetual Inventory accounting method, ensuring that every stock movement is logged, atomic, and verifiable.

**Key Features:**
*   **Realtime Dashboard:** Live stock updates via Firestore.
*   **Role-Based Access Control (RBAC):** Strict separation between Admin (Finance Controller) and Employee (Staff/Encoder).
*   **Scanner Optimized:** UI designed for USB Barcode Scanners.
*   **Audit Trail:** Immutable transaction logs for every inventory change.
*   **Race Condition Prevention:** Uses database transactions to prevent overselling.

## The Business Logic
The system enforces the **Perpetual Inventory Formula**:

```
Ending Inventory = Beginning Inventory + Receiving - Return/Pull Out - Issuance/Shipments + Issuance Returns
```

### Transaction Types (Strict Enum)
| Type | Logic | Description |
| :--- | :--- | :--- |
| **RECEIVING** | (+) Stock | New deliveries from publishers/suppliers. |
| **ISSUANCE** | (-) Stock | Standard POS transaction (Sold to Student/Dept). |
| **ISSUANCE_RETURN** | (+) Stock | Item returned by student to shelf (Restocking). |
| **PULL_OUT** | (-) Stock | Damaged/Unsold items returned to vendor. |

## Tech Stack
*   **Frontend:** React (Vite), Tailwind CSS v3, DaisyUI.
*   **Backend:** Firebase v9 (Modular SDK).
*   **Database:** Cloud Firestore (NoSQL).
*   **Auth:** Firebase Auth + EmailJS (Invitation System).
*   **Deployment:** Vercel.

## Security & Roles

### 1. The "Whitelist" Invitation Flow
The system does not allow public sign ups. Access is granted via a strict invitation loop:
1.  Admin inputs Staff Name & Email into the secure Invite Form.
2.  System adds record to authorized_users collection.
3.  EmailJS sends an automated authorization link to the staff member.
4.  Staff creates a password; system verifies their email against the whitelist before granting access.

### 2. User Roles
*   **ADMIN:** Full access. Can manage products, view financial values (Total Assets), invite staff, and delete records.
*   **EMPLOYEE:** Restricted access. Can only process transactions.

## Setup & Installation

### Prerequisites
*   Node.js (v18+)
*   A Firebase Project with Firestore & Auth enabled.

### Installation
1.  Clone the repository:
    ```bash
    git clone https://github.com/roma5840/inventory-management-system.git
    cd inventory-management-system
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