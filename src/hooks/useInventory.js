import { useState } from 'react';
import { db } from '../lib/firebase';
import { doc, runTransaction, serverTimestamp, collection } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

export const useInventory = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { currentUser } = useAuth(); // Get current user

  const processTransaction = async (barcode, type, qty) => {
    // Check if user is logged in
    if (!currentUser) {
      setError("Unauthorized: Please login.");
      return false;
    }
    
    // Pass currentUser.uid instead of hardcoded 'admin'
    const userId = currentUser.uid; 

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
        
        // Formula Logic...
        if (type === 'RECEIVING' || type === 'ISSUANCE_RETURN') {
          newStock = currentStock + Number(qty);
        } else if (type === 'ISSUANCE' || type === 'PULL_OUT') {
          if (currentStock < qty) {
            throw `Insufficient stock! Current: ${currentStock}, Requested: ${qty}`;
          }
          newStock = currentStock - Number(qty);
        } else {
          throw "Invalid Transaction Type";
        }

        transaction.update(productRef, { currentStock: newStock });

        transaction.set(transactionRef, {
          type,
          productId: barcode,
          productName,
          qty: Number(qty),
          previousStock: currentStock,
          newStock: newStock,
          timestamp: serverTimestamp(),
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