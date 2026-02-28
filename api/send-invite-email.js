import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';
import he from 'he';

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

  // SECURITY: Use 'he' to encode all HTML entities securely. 
  // strict: true ensures strict HTML5 encoding.
  const safeName = he.encode(to_name.trim(), { strict: true });

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

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    const htmlTemplate = `
      <div style="background-color: #f1f5f9; padding: 40px 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <div style="background-color: #0f172a; padding: 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: -0.025em; font-weight: 700;">
              Bookstore<span style="color: #3b82f6;">IMS</span>
            </h1>
            <p style="color: #94a3b8; margin: 5px 0 0 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700;">
              Finance & Inventory Portal
            </p>
          </div>

          <div style="padding: 40px 30px;">
            <h2 style="font-size: 20px; color: #0f172a; margin-top: 0;">System Access Authorization</h2>
            <p style="font-size: 15px; line-height: 1.6; color: #475569;">
              Hello <strong>${safeName}</strong>,
            </p>
            <p style="font-size: 15px; line-height: 1.6; color: #475569;">
              ${professionalMessage}
            </p>
            <p style="font-size: 15px; line-height: 1.6; color: #475569;">
              To begin managing resources, please complete your secure account registration by clicking the button below.
            </p>

            <div style="margin: 35px 0; text-align: center;">
              <a href="${invite_link}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 10px rgba(37, 99, 235, 0.2);">
                Complete Registration
              </a>
            </div>

            <div style="background-color: #f8fafc; border-left: 4px solid #cbd5e1; padding: 15px; margin-bottom: 20px;">
              <p style="font-size: 12px; color: #64748b; margin: 0;">
                <strong>Security Note:</strong> This invitation link is intended only for <strong>${cleanEmail}</strong>. Do not forward this email.
              </p>
            </div>
          </div>

          <div style="padding: 20px 30px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
            <p style="font-size: 11px; color: #94a3b8; margin: 5px 0 0 0;">
              If you were not expecting this authorization, please contact the system administrator immediately.
            </p>
          </div>
        </div>
      </div>
    `;

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