import { useState } from 'react';
import { db } from '../lib/firebase';
import { doc, runTransaction, serverTimestamp, collection } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

export const useInventory = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { currentUser } = useAuth(); // Get current user

  const processTransaction = async (data) => {
    // Destructure ALL new fields
    const { 
      barcode, type, qty, 
      studentId, studentName, transactionMode, 
      supplier, remarks, priceOverride,
      reason, referenceNo,
      itemName, category, location 
    } = data;

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

        let pData;
        let currentStock = 0;
        let price = 0;

        // === LOGIC: PRODUCT EXISTENCE ===
        if (!productDoc.exists()) {
          // If item doesn't exist...
          if (type === 'RECEIVING') {
             // ...AND we are Receiving: CREATE NEW ITEM ON THE FLY
             if (!itemName || !priceOverride) {
               throw "New Item Detected: Name and Price are required to register it.";
             }
             pData = {
               name: itemName,
               price: Number(priceOverride),
               currentStock: 0, // Will be added below
               minStockLevel: 10,
               category: category || "TEXTBOOK",
               location: location || "Unassigned",
               searchKeywords: itemName.toLowerCase().split(' ')
             };
             // We use SET for new docs
             transaction.set(productRef, pData);
             price = pData.price;
          } else {
             // ...AND we are NOT Receiving: ERROR
             throw "Product not found! You must use 'RECEIVING' to register new items.";
          }
        } else {
          // Item Exists: Load Data
          pData = productDoc.data();
          currentStock = pData.currentStock || 0;
          price = pData.price || 0;

          // Optional: Update Price/Location if provided during Receiving
          if (type === 'RECEIVING') {
             const updates = {};
             if (priceOverride && Number(priceOverride) > 0) {
               price = Number(priceOverride);
               updates.price = price;
             }
             if (location) updates.location = location;
             
             if (Object.keys(updates).length > 0) {
               transaction.update(productRef, updates);
             }
          }
        }

        // 3. Stock Math
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
        // Note: If product was just created (pData), currentStock was 0.
        // We always update the final stock count here.
        transaction.update(productRef, { 
          currentStock: newStock,
          lastUpdated: serverTimestamp() 
        });
        
        transaction.set(transactionRef, {
          type,
          productId: barcode,
          productName: pData.name || itemName, // Fallback
          qty: Number(qty),
          previousStock: currentStock,
          newStock: newStock,
          timestamp: serverTimestamp(),
          userId,
          // Finance Fields
          studentId: studentId || null,
          studentName: studentName || null,
          transactionMode: type === 'ISSUANCE' ? transactionMode : null,
          supplier: type === 'RECEIVING' ? supplier : null,
          reason: reason || null,
          referenceNo: referenceNo || null,
          remarks: remarks || null,
          priceAtTime: price
        });

        // Update Global Stats
        transaction.set(statsRef, {
            totalInventoryValue: currentTotalValue + valueChange,
            totalItemsCount: currentTotalItems + stockChange,
            lowStockCount: currentLowStock 
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