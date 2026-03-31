import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Gate 1: Transport Auth
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });
  const token = authHeader.replace('Bearer ', '');

  // DB Client (Pristine, retains pure Service Role privileges to bypass RLS)
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid or expired token' });

  // Gate 2: Verify Administrative Privileges
  const { data: callerProfile } = await supabaseAdmin
    .from('authorized_users')
    .select('id, full_name, role, status')
    .eq('auth_uid', user.id)
    .single();

  if (!callerProfile || callerProfile.status !== 'REGISTERED' || !['ADMIN', 'SUPER_ADMIN'].includes(callerProfile.role)) {
    return res.status(403).json({ error: 'Forbidden: Insufficient privileges.' });
  }

  // Helper: Audit Logger
  const logAudit = async (actionType, entityId, entityName, oldValues = null, newValues = null) => {
    await supabaseAdmin.from('audit_logs').insert({
      actor_id: user.id,
      actor_name: callerProfile.full_name || user.email,
      action_type: actionType,
      entity_type: 'SUPPLIERS',
      entity_id: entityId,
      entity_name: entityName,
      old_values: oldValues,
      new_values: newValues
    });
  };

  const { action } = req.body;

  try {
    if (action === 'CREATE') {
      const { payload } = req.body;
      const sanitizedName = payload.name.trim().toUpperCase();
      const sanitizedContact = payload.contact_info ? payload.contact_info.trim() : null;

      const newSupplier = {
          name: sanitizedName,
          contact_info: sanitizedContact
      };

      const { data: insertedSupplier, error } = await supabaseAdmin.from('suppliers').insert(newSupplier).select().single();
      if (error) {
          if (error.code === '23505') throw new Error("Supplier name already exists.");
          throw error;
      }

      await logAudit('CREATE', insertedSupplier.id, insertedSupplier.name, null, newSupplier);
      return res.status(200).json({ success: true });
    }
    
    else if (action === 'UPDATE') {
      const { id, payload } = req.body;
      
      const { data: oldSupplier, error: fetchErr } = await supabaseAdmin.from('suppliers').select('*').eq('id', id).single();
      if (fetchErr || !oldSupplier) throw new Error("Supplier not found.");

      const sanitizedName = payload.name.trim().toUpperCase();
      const sanitizedContact = payload.contact_info ? payload.contact_info.trim() : null;

      const updates = {
          name: sanitizedName,
          contact_info: sanitizedContact
      };

      const { error: updErr } = await supabaseAdmin.from('suppliers').update(updates).eq('id', id);

      if (updErr) {
          if (updErr.code === '23505') throw new Error("Supplier name already exists.");
          throw updErr;
      }
      
      await logAudit('UPDATE', id, sanitizedName, oldSupplier, updates);
      return res.status(200).json({ success: true });
    }
    
    else if (action === 'DELETE') {
      const { id } = req.body;
      
      const { data: oldSupplier, error: fetchErr } = await supabaseAdmin.from('suppliers').select('*').eq('id', id).single();
      if (fetchErr || !oldSupplier) throw new Error("Supplier not found.");

      const { error: delErr } = await supabaseAdmin.from('suppliers').delete().eq('id', id);
      if (delErr) {
          if (delErr.code === '23503') throw new Error("Cannot delete supplier with active transaction history.");
          throw delErr;
      }

      await logAudit('DELETE', id, oldSupplier.name, oldSupplier, null);
      return res.status(200).json({ success: true });
    }
    
    else if (action === 'IMPORT') {
      const { rows, batch_id } = req.body;
      if (!batch_id) throw new Error("Missing batch_id for batch import.");
      
      let insertedCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;
      const processErrors = [];

      const batchNames = rows.map(r => r.name).filter(Boolean);
      let existingRecords = [];

      // FIX: Fetch existing records in smaller chunks to avoid 414 URI Too Long limits
      if (batchNames.length > 0) {
          const FETCH_CHUNK = 100;
          for (let i = 0; i < batchNames.length; i += FETCH_CHUNK) {
              const chunkNames = batchNames.slice(i, i + FETCH_CHUNK);
              const { data, error } = await supabaseAdmin
                  .from('suppliers')
                  .select('*')
                  .in('name', chunkNames);
              
              if (error) throw new Error(`Fetch error: ${error.message}`);
              if (data) existingRecords.push(...data);
          }
      }

      const existingByName = new Map(existingRecords.map(i => [i.name.toUpperCase(), i]));

      const toInsert = [];
      const toUpdate = [];
      const updateDetails = [];

      rows.forEach((row) => {
          const rowNameUpper = row.name.toUpperCase();
          const existing = existingByName.get(rowNameUpper);

          if (existing) {
              let needsUpdate = false;
              const updatePayload = { ...existing };

              if (row.contact_info && existing.contact_info !== row.contact_info) { 
                  needsUpdate = true; 
                  updatePayload.contact_info = row.contact_info; 
              }

              if (needsUpdate) {
                  toUpdate.push(updatePayload);
                  updateDetails.push({ old: existing, new: updatePayload });
              }
              else unchangedCount++;
          } else {
              toInsert.push({
                  name: rowNameUpper,
                  contact_info: row.contact_info || null
              });
          }
      });

      if (toInsert.length > 0) {
          // FIX: Use upsert with ignoreDuplicates to avoid bulk failure on sneaky duplicates
          const { error } = await supabaseAdmin.from('suppliers').upsert(toInsert, { onConflict: 'name', ignoreDuplicates: true });
          if (!error) {
              insertedCount = toInsert.length;
          } else {
              processErrors.push(`Bulk insert fallback triggered: ${error.message}`);
              for (const item of toInsert) {
                  const { error: e } = await supabaseAdmin.from('suppliers').upsert(item, { onConflict: 'name', ignoreDuplicates: true });
                  if (!e) insertedCount++;
                  else processErrors.push(`Insert failed for ${item.name}: ${e.message}`);
              }
          }
      }

      if (toUpdate.length > 0) {
          const { error } = await supabaseAdmin.from('suppliers').upsert(toUpdate, { onConflict: 'id' });
          if (!error) updatedCount = toUpdate.length;
          else processErrors.push(`Bulk update failed: ${error.message}`);
      }

      const importStats = { 
          inserted: insertedCount, 
          updated: updatedCount, 
          unchanged: unchangedCount, 
          errors: processErrors,
          insertedItems: toInsert,
          updatedItems: updateDetails
      };

      const { error: rpcError } = await supabaseAdmin.rpc('append_import_log', {
          p_batch_id: batch_id,
          p_actor_id: user.id,
          p_actor_name: callerProfile.full_name || user.email,
          p_entity_type: 'SUPPLIERS',
          p_entity_name: `Supplier CSV Bulk Import`,
          p_inserted: insertedCount,
          p_updated: updatedCount,
          p_unchanged: unchangedCount,
          p_errors: processErrors,
          p_inserted_items: toInsert,
          p_updated_items: updateDetails
      });

      if (rpcError) console.error("Audit Log Append Error:", rpcError);

      return res.status(200).json({ success: true, importResult: importStats });
    }
    
    return res.status(400).json({ error: 'Invalid action payload.' });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}