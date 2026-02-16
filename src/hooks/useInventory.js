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
      // Generate a Reference Number Client-Side (System ID)
      const now = new Date();
      const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 12); 
      const random = Math.floor(1000 + Math.random() * 9000);
      const generatedRef = `REF-${timestamp}-${random}`;

      // Attach to headerData
      const finalHeader = { ...headerData, referenceNo: generatedRef };

      const { data: rpcData, error: rpcError } = await supabase.rpc('process_inventory_batch', {
        header_data: finalHeader,
        item_queue: queue,
        p_user_id: currentUser.auth_uid
      });

      if (rpcError) throw rpcError;

      // Return both IDs: BIS (for User), Ref (for System), and Verified Data (from DB)
      return { 
        bis: rpcData?.bis_number || 0,
        ref: generatedRef,
        verifiedName: rpcData?.verified_name,
        verifiedCourse: rpcData?.verified_course,
        verifiedYear: rpcData?.verified_year
      }; 

    } catch (e) {
      console.error("Batch Failed:", e);
      setError(e.message || "Transaction failed");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const voidTransaction = async (refNumber, reason) => {
    if (!currentUser) return { success: false, error: "Unauthorized" };
    if (!reason) return { success: false, error: "Reason is required." };
    
    setLoading(true);
    try {
      const { error } = await supabase.rpc('void_transaction_by_ref', {
        p_reference_number: refNumber,
        p_reason: reason,
        p_user_id: currentUser.auth_uid
      });

      if (error) throw error;
      
      // Broadcast update so other components refresh
      await supabase.channel('app_updates').send({
        type: 'broadcast', event: 'inventory_update', payload: {} 
      });

      return { success: true };
    } catch (e) {
      console.error("Void Failed:", e);
      return { success: false, error: e.message };
    } finally {
      setLoading(false);
    }
  };

  return { processTransaction, voidTransaction, loading, error };
};