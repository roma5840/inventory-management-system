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
      entity_type: 'INVENTORY',
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
      const sanitizedId = payload.id.toUpperCase();
      const sanitizedAccPac = payload.accpacCode ? payload.accpacCode.toUpperCase() : null;
      const sanitizedName = payload.name.toUpperCase();
      const sanitizedLocation = payload.location ? payload.location.toUpperCase() : "";

      const { data: existing } = await supabaseAdmin
          .from('products')
          .select('barcode, accpac_code')
          .or(`barcode.eq.${sanitizedId},accpac_code.eq.${sanitizedAccPac}`)
          .maybeSingle();
          
      if (existing) {
          if (existing.barcode === sanitizedId) throw new Error("Barcode already exists.");
          if (existing.accpac_code === sanitizedAccPac) throw new Error("AccPac Code already exists.");
      }

      const newProduct = {
          barcode: sanitizedId, 
          accpac_code: sanitizedAccPac,
          name: sanitizedName,
          price: Number(payload.price) || 0,
          cash_price: Number(payload.cashPrice) || 0,
          unit_cost: Number(payload.unitCost || 0),
          min_stock_level: Number(payload.minStockLevel) || 0,
          current_stock: Number(payload.initialStock) || 0, 
          location: sanitizedLocation,
          last_updated: new Date()
      };

      const { data: insertedProduct, error } = await supabaseAdmin.from('products').insert(newProduct).select().single();
      if (error) throw error;

      await logAudit('CREATE', insertedProduct.internal_id, insertedProduct.name, null, newProduct);
      return res.status(200).json({ success: true });
    }
    
    else if (action === 'UPDATE') {
      const { internal_id, payload } = req.body;
      
      const { data: oldProduct, error: fetchErr } = await supabaseAdmin.from('products').select('*').eq('internal_id', internal_id).single();
      if (fetchErr || !oldProduct) throw new Error("Product not found.");

      const sanitizedBarcode = payload.barcode.trim().toUpperCase();
      const sanitizedName = payload.name.toUpperCase();
      const sanitizedLocation = payload.location ? payload.location.toUpperCase() : "";
      const sanitizedAccPac = payload.accpacCode ? payload.accpacCode.toUpperCase() : null;

      const updates = {
          barcode: sanitizedBarcode, 
          name: sanitizedName,
          price: Number(payload.price) || 0,
          cash_price: Number(payload.cashPrice) || 0,
          unit_cost: Number(payload.unitCost) || 0,
          min_stock_level: Number(payload.minStockLevel) || 0,
          location: sanitizedLocation,
          accpac_code: sanitizedAccPac,
          last_updated: new Date()
      };

      const { error: updErr } = await supabaseAdmin.from('products').update(updates).eq('internal_id', internal_id);

      if (updErr) {
          if (updErr.message.includes("products_barcode_key")) throw new Error("Barcode already in use.");
          if (updErr.message.includes("products_accpac_code_key")) throw new Error("AccPac Code already in use.");
          throw updErr;
      }
      
      await logAudit('UPDATE', internal_id, sanitizedName, oldProduct, updates);
      return res.status(200).json({ success: true });
    }
    
    else if (action === 'DELETE') {
      const { internal_id } = req.body;
      
      const { data: oldProduct, error: fetchErr } = await supabaseAdmin.from('products').select('*').eq('internal_id', internal_id).single();
      if (fetchErr || !oldProduct) throw new Error("Product not found.");

      if (oldProduct.current_stock > 0) throw new Error("Stock must be 0 to delete item.");

      const { error: delErr } = await supabaseAdmin.from('products').delete().eq('internal_id', internal_id);
      if (delErr) {
          if (delErr.code === '23503') throw new Error("Item has existing transaction history.");
          throw delErr;
      }

      await logAudit('DELETE', internal_id, oldProduct.name, oldProduct, null);
      return res.status(200).json({ success: true });
    }
    
    else if (action === 'IMPORT') {
      const { rows } = req.body;
      let insertedCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;
      const processErrors = [];

      const generateClientBarcode = () => `SYS-${crypto.randomUUID().split('-')[0].toUpperCase()}`;

      const batchBarcodes = rows.map(r => r.barcode).filter(Boolean);
      const batchAccPacs = rows.map(r => r.accpac).filter(Boolean);
      const batchNames = rows.filter(r => !r.barcode && !r.accpac).map(r => r.name).filter(Boolean);

      // Parallel Fetching for massive speed boost
      const [resB, resA, resN] = await Promise.all([
          batchBarcodes.length > 0 ? supabaseAdmin.from('products').select('*').in('barcode', batchBarcodes) : { data: [] },
          batchAccPacs.length > 0 ? supabaseAdmin.from('products').select('*').in('accpac_code', batchAccPacs) : { data: [] },
          batchNames.length > 0 ? supabaseAdmin.from('products').select('*').in('name', batchNames) : { data: [] }
      ]);

      const existingItems = [...(resB.data || []), ...(resA.data || []), ...(resN.data || [])];

      const existingByBarcode = new Map(existingItems.filter(i => i.barcode).map(i => [i.barcode.toUpperCase(), i]));
      const existingByAccPac = new Map(existingItems.filter(i => i.accpac_code).map(i => [i.accpac_code.toUpperCase(), i]));
      const existingByName = new Map(existingItems.filter(i => i.name).map(i => [i.name.toUpperCase(), i]));

      const toInsert = [];
      const toUpdate = [];

      rows.forEach((row) => {
          let existing = null;
          let conflictMsg = null;

          if (row.barcode && existingByBarcode.has(row.barcode.toUpperCase())) {
              existing = existingByBarcode.get(row.barcode.toUpperCase());
          } else if (row.accpac && existingByAccPac.has(row.accpac.toUpperCase())) {
              const matched = existingByAccPac.get(row.accpac.toUpperCase());
              if (row.barcode && matched.barcode && matched.barcode !== row.barcode.toUpperCase()) {
                  conflictMsg = `[${row.barcode}] AccPac '${row.accpac}' already linked to '${matched.barcode}'. Skipped.`;
              } else {
                  existing = matched;
              }
          } else if (!row.barcode && !row.accpac && existingByName.has(row.name.toUpperCase())) {
              existing = existingByName.get(row.name.toUpperCase());
          }

          if (conflictMsg) {
              processErrors.push(conflictMsg);
              return;
          }

          if (existing) {
              let needsUpdate = false;
              // CRITICAL: We spread `existing` to provide all NOT NULL columns for Postgres Upsert
              const updatePayload = { ...existing, last_updated: new Date() };

              if (row.name && existing.name !== row.name.toUpperCase()) { needsUpdate = true; updatePayload.name = row.name.toUpperCase(); }
              if (row.barcode && existing.barcode !== row.barcode.toUpperCase()) { needsUpdate = true; updatePayload.barcode = row.barcode.toUpperCase(); }
              if (row.accpac && existing.accpac_code !== (row.accpac ? row.accpac.toUpperCase() : null)) { needsUpdate = true; updatePayload.accpac_code = row.accpac ? row.accpac.toUpperCase() : null; }
              if (row.price !== undefined && Number(row.price) !== Number(existing.price)) { needsUpdate = true; updatePayload.price = Number(row.price); }
              if (row.cash !== undefined && Number(row.cash) !== Number(existing.cash_price)) { needsUpdate = true; updatePayload.cash_price = Number(row.cash); }
              if (row.location !== undefined && row.location.toUpperCase() !== (existing.location || '')) { needsUpdate = true; updatePayload.location = row.location.toUpperCase(); }
              if (row.minStockLevel !== undefined && Number(row.minStockLevel) !== Number(existing.min_stock_level)) { needsUpdate = true; updatePayload.min_stock_level = Number(row.minStockLevel); }

              if (needsUpdate) toUpdate.push(updatePayload);
              else unchangedCount++;
          } else {
              toInsert.push({
                  barcode: row.barcode?.toUpperCase() || generateClientBarcode(),
                  accpac_code: row.accpac?.toUpperCase() || null,
                  name: row.name?.toUpperCase(),
                  price: Number(row.price) || 0,
                  cash_price: Number(row.cash) || 0,
                  unit_cost: Number(row.cost) || 0,
                  min_stock_level: Number(row.minStockLevel) || 10,
                  current_stock: Number(row.initialStock) || 0,
                  location: row.location?.toUpperCase() || 'N/A',
                  last_updated: new Date()
              });
          }
      });

      if (toInsert.length > 0) {
          const { error } = await supabaseAdmin.from('products').insert(toInsert);
          if (!error) insertedCount = toInsert.length;
          else {
              for (const item of toInsert) {
                  const { error: e } = await supabaseAdmin.from('products').insert(item);
                  if (!e) insertedCount++;
                  else processErrors.push(`Insert failed for ${item.name}: ${e.message}`);
              }
          }
      }

      if (toUpdate.length > 0) {
          const { error } = await supabaseAdmin.from('products').upsert(toUpdate, { onConflict: 'internal_id' });
          if (!error) updatedCount = toUpdate.length;
          else processErrors.push(`Bulk update failed: ${error.message}`);
      }

      const importStats = { inserted: insertedCount, updated: updatedCount, unchanged: unchangedCount, errors: processErrors };
      await logAudit('IMPORT', 'BATCH_IMPORT', `CSV Chunk (${rows.length} items)`, null, importStats);

      return res.status(200).json({ success: true, importResult: importStats });
    }
    
    return res.status(400).json({ error: 'Invalid action payload.' });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}