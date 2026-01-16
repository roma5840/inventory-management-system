import { useState } from 'react';
import { db } from '../lib/firebase';
import { doc, runTransaction, serverTimestamp, collection } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';

export const useInventory = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { currentUser } = useAuth(); // Get current user

  const processTransaction = async (headerData, queue) => {
    if (!currentUser) {
      setError("Unauthorized: Please login.");
      return false;
    }
    if (!queue || queue.length === 0) {
      setError("Queue is empty. Scan items first.");
      return false;
    }

    const { type, studentId, studentName, transactionMode, supplier, remarks, reason, referenceNo } = headerData;
    const userId = currentUser.uid;
    
    setLoading(true);
    setError(null);

    try {
      await runTransaction(db, async (transaction) => {
        // 1. PRE-READ: Get Global Stats & All Products in Queue
        const statsRef = doc(db, "stats", "summary");
        const statsDoc = await transaction.get(statsRef);
        
        // Read all product docs from the queue to get latest stock/price
        const productReads = await Promise.all(
          queue.map(item => transaction.get(doc(db, "products", item.barcode)))
        );

        // Map reads to an easy lookup object
        const productMap = {};
        productReads.forEach(docSnap => {
          if (docSnap.exists()) productMap[docSnap.id] = docSnap.data();
        });

        // 2. CALCULATE: Stats Accumulators
        let totalValueChange = 0;
        let totalStockChange = 0;

        // 3. PROCESS: Loop through Queue items
        queue.forEach((item) => {
          const productRef = doc(db, "products", item.barcode);
          const pData = productMap[item.barcode];

          // --- Logic: New Item vs Existing ---
          let currentStock = 0;
          let currentPrice = 0;
          let productName = item.itemName || "Unknown Item";

          if (!pData) {
            // If Receiving & New Item -> Create it
            if (type === 'RECEIVING') {
               currentPrice = Number(item.priceOverride);
               transaction.set(productRef, {
                 name: item.itemName,
                 price: currentPrice,
                 currentStock: 0, 
                 minStockLevel: 10,
                 category: item.category || "TEXTBOOK",
                 location: item.location || "Unassigned",
                 searchKeywords: item.itemName.toLowerCase().split(' ')
               });
            } else {
               throw `Error: Item '${item.barcode}' not found in database.`;
            }
          } else {
            // Existing Item
            currentStock = pData.currentStock || 0;
            currentPrice = pData.price; // Use DB price unless updated
            productName = pData.name;
            
            // If Receiving, we might update price/location
            if (type === 'RECEIVING') {
               const updates = {};
               if (item.priceOverride) {
                 currentPrice = Number(item.priceOverride);
                 updates.price = currentPrice;
               }
               if (item.location) updates.location = item.location;
               if (Object.keys(updates).length > 0) transaction.update(productRef, updates);
            }
          }

          // --- Logic: Stock Math ---
          let newStock = 0;
          let qty = Number(item.qty);
          let itemStockChange = 0;

          if (type === 'RECEIVING' || type === 'ISSUANCE_RETURN') {
            newStock = currentStock + qty;
            itemStockChange = qty;
          } else if (type === 'ISSUANCE' || type === 'PULL_OUT') {
            if (currentStock < qty) throw `Insufficient stock for ${productName}! Has: ${currentStock}, Need: ${qty}`;
            newStock = currentStock - qty;
            itemStockChange = -qty;
          }

          // Update Product Stock
          transaction.update(productRef, { 
            currentStock: newStock,
            lastUpdated: serverTimestamp() 
          });

          // Create Transaction Log
          const transactionRef = doc(collection(db, "transactions"));
          transaction.set(transactionRef, {
            type,
            productId: item.barcode,
            productName: productName,
            qty: qty,
            previousStock: currentStock,
            newStock: newStock,
            timestamp: serverTimestamp(),
            userId,
            studentId: studentId || null,
            studentName: studentName || null,
            transactionMode: type === 'ISSUANCE' ? transactionMode : null,
            supplier: type === 'RECEIVING' ? supplier : null,
            reason: reason || null,
            referenceNo: referenceNo || null,
            remarks: remarks || null,
            priceAtTime: currentPrice
          });

          // Add to Global Totals
          totalStockChange += itemStockChange;
          totalValueChange += (itemStockChange * currentPrice);
        });

        // 4. WRITE: Update Global Stats
        const sData = statsDoc.exists() ? statsDoc.data() : { totalInventoryValue: 0, totalItemsCount: 0, lowStockCount: 0 };
        transaction.set(statsRef, {
            totalInventoryValue: (sData.totalInventoryValue || 0) + totalValueChange,
            totalItemsCount: (sData.totalItemsCount || 0) + totalStockChange,
            lowStockCount: sData.lowStockCount // Low stock count technically needs complex recalcs, skipping for speed
        }, { merge: true });

      });

      console.log("Batch Transaction Committed!");
      return true;

    } catch (e) {
      console.error("Batch Failed:", e);
      setError(typeof e === 'string' ? e : e.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { processTransaction, loading, error };
};