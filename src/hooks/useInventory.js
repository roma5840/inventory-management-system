import { useState } from 'react';
import { db } from '../lib/firebase';
import { doc, runTransaction, serverTimestamp, collection } from 'firebase/firestore';

export const useInventory = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Processes an inventory movement.
   * @param {string} barcode - Scanned barcode (acts as Doc ID)
   * @param {string} type - 'IN' | 'OUT' | 'RETURN'
   * @param {number} qty - Quantity to move
   * @param {string} userId - Who performed the action
   */
  const processTransaction = async (barcode, type, qty, userId = 'admin') => {
    setLoading(true);
    setError(null);

    try {
      await runTransaction(db, async (transaction) => {
        const productRef = doc(db, "products", barcode);
        const transactionRef = doc(collection(db, "transactions"));

        const productDoc = await transaction.get(productRef);
        if (!productDoc.exists()) {
          throw "Product not found! Please register the item first.";
        }

        const currentStock = productDoc.data().currentStock || 0;
        const productName = productDoc.data().name;
        let newStock = 0;
        
        // Formula: Beginning + Receiving - Return/Pull Out - Issuance + Issuance Returns
        
        // ADDITIONS (Stock In)
        if (type === 'RECEIVING' || type === 'ISSUANCE_RETURN') {
          newStock = currentStock + Number(qty);
        } 
        // SUBTRACTIONS (Stock Out)
        else if (type === 'ISSUANCE' || type === 'PULL_OUT') {
          if (currentStock < qty) {
            throw `Insufficient stock! Current: ${currentStock}, Requested: ${qty}`;
          }
          newStock = currentStock - Number(qty);
        } else {
          throw "Invalid Transaction Type";
        }

        // WRITE: Update Product (Atomic Step 1)
        transaction.update(productRef, {
          currentStock: newStock
        });

        // WRITE: Create Audit Log (Atomic Step 2)
        transaction.set(transactionRef, {
          type,
          productId: barcode,
          productName, // Denormalize name for easier reading in logs
          qty: Number(qty),
          previousStock: currentStock,
          newStock: newStock,
          timestamp: serverTimestamp(), // Server-side time is source of truth
          userId
        });
      });

      console.log("Transaction Committed Successfully!");
      return true;
    } catch (e) {
      console.error("Transaction Failed: ", e);
      setError(e.toString());
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { processTransaction, loading, error };
};