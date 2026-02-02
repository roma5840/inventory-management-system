import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 1. Security: Validate Auth Token and Permissions
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing Authorization header' });
  
  const token = authHeader.replace('Bearer ', '');
  
  // Use Service Role Key for backend admin verification
  const supabase = createClient(
    process.env.SUPABASE_URL, 
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // A. Verify Token is valid
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid or expired token' });

  // B. Verify Caller is Admin/Super Admin
  const { data: callerProfile } = await supabase
    .from('authorized_users')
    .select('role')
    .eq('email', user.email)
    .single();

  if (!callerProfile || !['ADMIN', 'SUPER_ADMIN'].includes(callerProfile.role)) {
    return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
  }

  // 2. Proceed with Cloudflare Logic
  const { email, action } = req.body;
  
  if (!email || !action) return res.status(400).json({ error: 'Missing email or action' });

  const CLOUDFLARE_API = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/access/groups/${process.env.CLOUDFLARE_GROUP_ID}`;

  try {
    const getResponse = await fetch(CLOUDFLARE_API, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    if (!getResponse.ok) throw new Error('Failed to fetch Cloudflare group');
    const groupData = await getResponse.json();
    let currentIncludes = groupData.result.include || [];

    // Cloudflare structure: { "email": { "email": "user@example.com" } }
    const emailObj = { email: { email: email } };

    let newIncludes = [...currentIncludes];

    if (action === 'add') {
      const exists = newIncludes.some(i => i.email?.email === email);
      if (!exists) newIncludes.push(emailObj);
    } else if (action === 'remove') {
      newIncludes = newIncludes.filter(i => i.email?.email !== email);
    }

    const updateResponse = await fetch(CLOUDFLARE_API, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: groupData.result.name,
        include: newIncludes,
        exclude: groupData.result.exclude || [],
        require: groupData.result.require || []
      }),
    });

    if (!updateResponse.ok) {
      const err = await updateResponse.json();
      throw new Error(err.errors?.[0]?.message || 'Failed to update Cloudflare');
    }

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Cloudflare Sync Error:', error);
    return res.status(500).json({ error: error.message });
  }
}