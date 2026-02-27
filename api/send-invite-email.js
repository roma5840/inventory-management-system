import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = authHeader.split(' ')[1];

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid or expired token' });

  const { data: callerProfile, error: profileError } = await supabase
    .from('authorized_users')
    .select('role, status')
    .eq('email', user.email)
    .single();

  if (profileError || !callerProfile || callerProfile.status !== 'REGISTERED' || !['ADMIN', 'SUPER_ADMIN'].includes(callerProfile.role)) {
    return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
  }

  const { to_name, to_email, invite_link } = req.body;
  if (!to_name || typeof to_name !== 'string' || to_name.length > 150) return res.status(400).json({ error: 'Invalid name' });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!to_email || typeof to_email !== 'string' || !emailRegex.test(to_email)) {
    return res.status(400).json({ error: 'Invalid email address format' });
  }
  
  const cleanEmail = to_email.trim().toLowerCase();

  const { data: targetProfile, error: targetError } = await supabase
    .from('authorized_users')
    .select('status, role')
    .eq('email', cleanEmail)
    .single();

  if (targetError || !targetProfile || targetProfile.status !== 'PENDING') {
    return res.status(403).json({ error: 'Forbidden: Target user is not pending.' });
  }

  try {
    const professionalMessage = targetProfile.role === 'ADMIN' || targetProfile.role === 'SUPER_ADMIN' 
      ? "You have been granted elevated Administrative privileges to manage the system and personnel."
      : "You have been assigned the Employee role with access to process transactions and manage inventory.";

    // Configure Nodemailer with Gmail
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    const htmlTemplate = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; padding: 20px; color: #333;">
        <h2 style="color: #1e3a8a;">System Access Authorization</h2>
        <p>Hello <strong>${to_name}</strong>,</p>
        <p>${professionalMessage}</p>
        <p>Please click the link below to register your credentials.</p>
        <div style="margin: 30px 0;">
          <a href="${invite_link}" style="background-color: #2563eb; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Complete Registration
          </a>
        </div>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
        <p style="font-size: 12px; color: #6b7280;">If you are not expecting this authorization, please ignore this email.</p>
      </div>
    `;

    // Send the email
    await transporter.sendMail({
      from: `"University Bookstore System" <${process.env.GMAIL_USER}>`,
      to: cleanEmail,
      subject: "Required: Account Registration & Authorization",
      html: htmlTemplate
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Nodemailer Error:', error);
    return res.status(500).json({ error: 'Internal server error dispatching email.' });
  }
}