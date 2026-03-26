import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Gate 1: Transport Auth
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });
  const token = authHeader.replace('Bearer ', '');

  // 1. DB Client (Pristine, retains pure Service Role privileges to bypass RLS)
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  // 2. Auth Client (Sacrificial client used ONLY to verify password without polluting the DB client)
  const supabaseAuthCheck = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid or expired token' });

  const { action, password, targetId, targetEmail, targetName, newRole } = req.body;

  if (!password) return res.status(400).json({ error: 'Password re-authentication is strictly required.' });

  // Gate 2: Re-authentication
  const { error: signInError } = await supabaseAuthCheck.auth.signInWithPassword({
    email: user.email,
    password: password
  });

  if (signInError) return res.status(403).json({ error: 'Authentication failed. Incorrect password.' });

  // Gate 3: Role & Status Authorization (Now fetching full_name for audit logs)
  const { data: callerProfile } = await supabaseAdmin
    .from('authorized_users')
    .select('id, full_name, role, status')
    .eq('auth_uid', user.id)
    .single();

  if (!callerProfile || callerProfile.status !== 'REGISTERED' || !['ADMIN', 'SUPER_ADMIN'].includes(callerProfile.role)) {
    return res.status(403).json({ error: 'Forbidden: Insufficient privileges or inactive account.' });
  }

  // Gate 4: Target Validation
  let targetProfile = null;
  if (action !== 'INVITE') {
    if (!targetId) return res.status(400).json({ error: 'Target ID is required.' });

    const { data } = await supabaseAdmin.from('authorized_users').select('*').eq('id', targetId).single();
    targetProfile = data;

    if (!targetProfile) return res.status(404).json({ error: 'Target user not found.' });
    if (targetProfile.auth_uid === user.id) return res.status(403).json({ error: 'Self-modification is blocked.' });

    if (callerProfile.role === 'ADMIN' && targetProfile.role !== 'EMPLOYEE') {
      return res.status(403).json({ error: 'Permission Denied: Administrators can only modify Employees.' });
    }
  } else {
    if (callerProfile.role === 'ADMIN' && newRole !== 'EMPLOYEE') {
      return res.status(403).json({ error: 'Permission Denied: Administrators can only invite Employees.' });
    }
  }

  // Helper: Cloudflare Synchronization
  const syncCF = async (email, cfAction) => {
    const CLOUDFLARE_API = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/access/groups/${process.env.CLOUDFLARE_GROUP_ID}`;
    const getRes = await fetch(CLOUDFLARE_API, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
    });
    
    if (!getRes.ok) throw new Error('Failed to fetch Cloudflare group configuration');
    const groupData = await getRes.json();
    
    let newIncludes = [...(groupData.result.include || [])];
    const emailObj = { email: { email: email } };

    if (cfAction === 'add') {
      if (!newIncludes.some(i => i.email?.email === email)) newIncludes.push(emailObj);
    } else {
      newIncludes = newIncludes.filter(i => i.email?.email !== email);
    }

    const putRes = await fetch(CLOUDFLARE_API, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: groupData.result.name,
        include: newIncludes,
        exclude: groupData.result.exclude || [],
        require: groupData.result.require || []
      }),
    });
    
    if (!putRes.ok) throw new Error('Failed to synchronize Cloudflare group');
  };

  // Helper: Audit Logger
  const logAudit = async (actionType, entityId, entityName, oldValues = null, newValues = null, metadata = null) => {
    await supabaseAdmin.from('audit_logs').insert({
      actor_id: user.id,
      actor_name: callerProfile.full_name || user.email,
      action_type: actionType,
      entity_type: 'STAFF',
      entity_id: entityId,
      entity_name: entityName,
      old_values: oldValues,
      new_values: newValues,
      metadata: metadata
    });
  };

  // Execution Layer with Safe Fallbacks
  try {
    if (action === 'INVITE') {
      const { data: existing } = await supabaseAdmin.from('authorized_users').select('id').eq('email', targetEmail).maybeSingle();
      if (existing) throw new Error("This email is already active in the system.");

      const { data: newUser, error: insertErr } = await supabaseAdmin.from('authorized_users').insert({
        email: targetEmail,
        full_name: targetName,
        role: newRole,
        status: 'PENDING'
      }).select().single();

      if (insertErr) throw new Error("Database insertion failed: " + insertErr.message);

      try {
        await syncCF(targetEmail, 'add');
      } catch (cfErr) {
        await supabaseAdmin.from('authorized_users').delete().eq('id', newUser.id);
        throw new Error("Cloudflare sync failed, rolled back invitation. " + cfErr.message);
      }

      await logAudit('INVITE', newUser.id, targetName, null, { email: targetEmail, role: newRole });
    }
    
    else if (action === 'REVOKE') {
      try {
        await syncCF(targetProfile.email, 'remove');
      } catch (cfErr) {
        throw new Error("Cloudflare sync failed, aborted database deletion. " + cfErr.message);
      }

      const { error: delErr } = await supabaseAdmin.from('authorized_users').delete().eq('id', targetProfile.id);
      if (delErr) {
        await syncCF(targetProfile.email, 'add'); 
        throw new Error("Database deletion failed, Cloudflare rolled back. " + delErr.message);
      }

      // 1. Write the log immediately after DB confirmation so we don't lose it if Auth fails
      await logAudit('REVOKE', targetProfile.id, targetProfile.full_name, { email: targetProfile.email, role: targetProfile.role }, null);

      // 2. Perform the volatile Auth deletion last
      if (targetProfile.auth_uid) {
        const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(targetProfile.auth_uid);
        if (authErr) console.error("Auth User Deletion Failed, but DB record was removed:", authErr);
      }
    }
    
    else if (action === 'TOGGLE_STATUS') {
      if (targetProfile.status === 'PENDING') {
        throw new Error("Pending invitations cannot be suspended. Use REVOKE to cancel the invite entirely.");
      }

      const newStatus = targetProfile.status === 'INACTIVE' ? 'REGISTERED' : 'INACTIVE';

      if (newStatus === 'INACTIVE') {
        try { await syncCF(targetProfile.email, 'remove'); }
        catch (cfErr) { throw new Error("Cloudflare sync failed, aborted DB update. " + cfErr.message); }

        const { error: updErr } = await supabaseAdmin.from('authorized_users').update({ status: newStatus }).eq('id', targetProfile.id);
        if (updErr) {
          await syncCF(targetProfile.email, 'add'); 
          throw new Error("Database update failed, Cloudflare rolled back. " + updErr.message);
        }
      } else {
        const { error: updErr } = await supabaseAdmin.from('authorized_users').update({ status: newStatus }).eq('id', targetProfile.id);
        if (updErr) throw new Error("Database update failed: " + updErr.message);

        try { await syncCF(targetProfile.email, 'add'); }
        catch (cfErr) {
          await supabaseAdmin.from('authorized_users').update({ status: 'INACTIVE' }).eq('id', targetProfile.id);
          throw new Error("Cloudflare sync failed, DB rolled back. " + cfErr.message);
        }
      }

      await logAudit(
        newStatus === 'INACTIVE' ? 'DEACTIVATE' : 'REACTIVATE', 
        targetProfile.id, 
        targetProfile.full_name, 
        { status: targetProfile.status }, 
        { status: newStatus }
      );
    }
    
    else if (action === 'CHANGE_ROLE') {
      if (callerProfile.role !== 'SUPER_ADMIN') throw new Error("Only Super Admins can execute role changes.");
      
      const { error: updErr } = await supabaseAdmin
        .from('authorized_users')
        .update({ role: newRole })
        .eq('id', targetProfile.id);
        
      if (updErr) throw new Error("Database update failed: " + updErr.message);

      await logAudit('CHANGE_ROLE', targetProfile.id, targetProfile.full_name, { role: targetProfile.role }, { role: newRole });
    }
    
    else {
      return res.status(400).json({ error: 'Invalid action payload.' });
    }

    return res.status(200).json({ 
      success: true, 
      newStatus: action === 'TOGGLE_STATUS' ? (targetProfile.status === 'INACTIVE' ? 'REGISTERED' : 'INACTIVE') : null 
    });
    
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}