import { useState } from 'react';
import { db } from '../lib/firebase';
import { doc, runTransaction, serverTimestamp, collection } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

export const useInventory = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { currentUser } = useAuth(); // Get current user

  const processTransaction = async (barcode, type, qty) => {
    if (!currentUser) {
      setError("Unauthorized: Please login.");
      return false;
    }
    
    const userId = currentUser.uid; 
    setLoading(true);
    setError(null);

    try {
      await runTransaction(db, async (transaction) => {
        // 1. References
        const productRef = doc(db, "products", barcode);
        const transactionRef = doc(collection(db, "transactions"));
        const statsRef = doc(db, "stats", "summary"); 

        // 2. Reads
        const productDoc = await transaction.get(productRef);
        const statsDoc = await transaction.get(statsRef);

        if (!productDoc.exists()) {
          throw "Product not found! Please register the item first.";
        }

        // 3. Product Math
        const pData = productDoc.data();
        const currentStock = pData.currentStock || 0;
        const price = pData.price || 0;
        let newStock = 0;
        let stockChange = 0; 

        if (type === 'RECEIVING' || type === 'ISSUANCE_RETURN') {
          newStock = currentStock + Number(qty);
          stockChange = Number(qty);
        } else if (type === 'ISSUANCE' || type === 'PULL_OUT') {
          if (currentStock < qty) {
            throw `Insufficient stock! Current: ${currentStock}, Requested: ${qty}`;
          }
          newStock = currentStock - Number(qty);
          stockChange = -Number(qty);
        } else {
          throw "Invalid Transaction Type";
        }

        // 4. Stats Math
        let currentTotalValue = 0;
        let currentTotalItems = 0;
        let currentLowStock = 0;

        if (statsDoc.exists()) {
            const sData = statsDoc.data();
            currentTotalValue = sData.totalInventoryValue || 0;
            currentTotalItems = sData.totalItemsCount || 0;
            currentLowStock = sData.lowStockCount || 0;
        }

        const valueChange = stockChange * price;

        // 5. Writes
        transaction.update(productRef, { currentStock: newStock });
        
        transaction.set(transactionRef, {
          type,
          productId: barcode,
          productName: pData.name,
          qty: Number(qty),
          previousStock: currentStock,
          newStock: newStock,
          timestamp: serverTimestamp(),
          userId
        });

        // Update Global Stats (Preserving lowStockCount)
        transaction.set(statsRef, {
            totalInventoryValue: currentTotalValue + valueChange,
            totalItemsCount: currentTotalItems + stockChange,
            lowStockCount: currentLowStock // Keep existing count
        }, { merge: true });
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