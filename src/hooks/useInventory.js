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
      // NOTE: Reference string (generatedRef) is now explicitly handled server-side to prevent client spoofing & ensure atomic race safety
      const { data: rpcData, error: rpcError } = await supabase.rpc('process_inventory_batch', {
        header_data: headerData,
        item_queue: queue
      });

      if (rpcError) throw rpcError;

      return { 
        bis: rpcData?.bis_number || 0,
        ref: rpcData?.reference_number, // Pulled straight from DB authoritative generation
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
        p_reason: reason
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