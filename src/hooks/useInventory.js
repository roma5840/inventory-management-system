import { useState } from 'react';
import { supabase } from '../lib/supabase';
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
    
    setLoading(true);
    setError(null);

    try {
      // Call the Database Function we created in Step 2 of the guide
      const { error: rpcError } = await supabase.rpc('process_inventory_batch', {
        header_data: headerData,
        item_queue: queue,
        p_user_id: currentUser.auth_uid // Passing the Auth ID
      });

      if (rpcError) throw rpcError;

      console.log("Batch Transaction Committed via RPC!");
      return true;

    } catch (e) {
      console.error("Batch Failed:", e);
      setError(e.message || "Transaction failed");
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { processTransaction, loading, error };
};