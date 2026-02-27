import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Strict HTTP Method Enforcement
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 2. Authentication: Validate Bearer Token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.split(' ')[1];

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 3. Authenticate Caller securely via Supabase Auth Server
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
  }

  // 4. Authorization: Ensure Caller is Active Admin/Super Admin
  const { data: callerProfile, error: profileError } = await supabase
    .from('authorized_users')
    .select('role, status')
    .eq('email', user.email)
    .single();

  if (
    profileError || 
    !callerProfile || 
    callerProfile.status !== 'REGISTERED' || 
    !['ADMIN', 'SUPER_ADMIN'].includes(callerProfile.role)
  ) {
    return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
  }

  // 5. Input Sanitization
  const { to_name, to_email, invite_link } = req.body;
  
  if (!to_name || typeof to_name !== 'string' || to_name.length > 150) {
    return res.status(400).json({ error: 'Invalid name provided' });
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!to_email || typeof to_email !== 'string' || !emailRegex.test(to_email)) {
    return res.status(400).json({ error: 'Invalid email address format' });
  }

  const cleanEmail = to_email.trim().toLowerCase();

  // 6. DB STATE VERIFICATION (CRITICAL SECURITY CHECK)
  // Ensures the email is ONLY sent if the user was successfully added to the database as PENDING.
  // This prevents attackers from using your API as an open email relay.
  const { data: targetProfile, error: targetError } = await supabase
    .from('authorized_users')
    .select('status, role')
    .eq('email', cleanEmail)
    .single();

  if (targetError || !targetProfile || targetProfile.status !== 'PENDING') {
    return res.status(403).json({ error: 'Forbidden: Target user is not in a pending invitation state.' });
  }

  // 7. Execution: Forward to EmailJS Securely
  try {
    const professionalMessage = targetProfile.role === 'ADMIN' || targetProfile.role === 'SUPER_ADMIN' 
      ? "You have been granted elevated Administrative privileges to manage the system and personnel."
      : "You have been assigned the Employee role with access to process transactions and manage inventory.";

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        service_id: process.env.EMAILJS_SERVICE_ID,
        template_id: process.env.EMAILJS_TEMPLATE_ID,
        user_id: process.env.EMAILJS_PUBLIC_KEY,
        accessToken: process.env.EMAILJS_PRIVATE_KEY, // Enforces the Private Key requirement
        template_params: {
          to_name: to_name.trim(),
          to_email: cleanEmail,
          invite_link: invite_link || '',
          message: professionalMessage
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('EmailJS Upstream Error:', errorText);
      throw new Error('Email provider rejected the request.');
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Email dispatch failed:', error.message);
    return res.status(500).json({ error: 'Internal server error while dispatching email.' });
  }
}