# Real-Time Perpetual Inventory Management System

**Client:** Finance Department / Bookstore  
**Developers:** Ryan Oliver Aquino & Jancesar Taguiang

## Project Overview
This is a Real-Time Inventory Management System designed to replace legacy manual tracking. The primary focus is **Financial Integrity** and **Auditability**. The system adheres to the Perpetual Inventory accounting method, ensuring that every stock movement is logged, atomic, and verifiable using PostgreSQL Stored Procedures.

**Key Features:**
*   **Realtime Dashboard:** Live stock updates across all devices via Supabase Realtime (WebSockets).
*   **Role-Based Access Control (RBAC):** Strict hierarchy: Super Admin, Admin, and Employee.
*   **Scanner Optimized:** UI designed for USB Barcode Scanners with "Intelligent Focus" logic.
*   **Atomic Transactions:** Uses RPC (Remote Procedure Calls) to ensure inventory counts are accurate, preventing race conditions during simultaneous scans.
*   **Smart Search:** Fuzzy search capabilities for product names and partial barcode matching.

## The Business Logic
The system enforces the **Perpetual Inventory Formula**:

```
Ending Inventory = Beginning Inventory + Receiving - Return/Pull Out - Issuance/Shipments + Issuance Returns
```

### Transaction Types (Strict Enum)
| Type | Logic | Description |
| :--- | :--- | :--- |
| **RECEIVING** | (+) Stock | New deliveries from publishers/suppliers. Updates Price/Location. |
| **ISSUANCE** | (-) Stock | Standard POS transaction (Sold to Student/Dept). |
| **ISSUANCE_RETURN** | (+) Stock | Item returned by student to shelf (Restocking). |
| **PULL_OUT** | (-) Stock | Damaged/Unsold items returned to vendor. |

## Tech Stack
*   **Frontend:** React (Vite), Tailwind CSS v3, DaisyUI.
*   **Backend:** Supabase (PostgreSQL).
*   **Auth:** Supabase Auth + Custom Whitelist Table.
*   **Services:** EmailJS (Invitation System).
*   **Deployment:** Vercel.

## Security & Roles

### 1. The "Whitelist" Invitation Flow
The system does not allow public sign-ups. Access is granted via a strict invitation loop:
1.  Admin/Super Admin inputs Staff Name & Email into the secure Invite Form.
2.  System adds a record to the `authorized_users` SQL table with `PENDING` status.
3.  EmailJS sends an automated authorization link to the staff member.
4.  Staff creates a password; Supabase triggers a hook to verify their email against the whitelist table before granting access.

### 2. User Roles
*   **SUPER ADMIN:** Full system control. Can invite staff, manage inventory, recalculate stats, and **change user roles** (promote/demote).
*   **ADMIN:** Management access. Can invite Employees, edit/delete inventory, and rename staff, but **cannot** change user roles.
*   **EMPLOYEE:** Restricted access. Can only process inventory transactions (In/Out). No access to the "Manage Staff" panel.

## Setup & Installation

### Prerequisites
*   Node.js (v18+)
*   A Supabase Project.

### Database Schema
You must run the SQL setup script in your Supabase SQL Editor to create the following:
*   Tables: `products`, `transactions`, `authorized_users`.
*   Functions (RPC): `process_inventory_batch`, `delete_staff_account`.

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
    *   Update `src/lib/supabase.js` with your Supabase Project URL and Anon Key.
    *   (Optional) Configure EmailJS service ID in `src/components/AdminInvite.jsx`.
4.  Run the development server:
    ```bash
    npm run dev
    ```