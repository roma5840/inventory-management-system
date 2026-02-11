import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import emailjs from '@emailjs/browser';
import LimitedInput from "./LimitedInput";

export default function AdminInvite({ onSuccess }) {
  const { currentUser, userRole } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  // Helper: Handles API calls with Token Refresh
  const callCloudflareSync = async (email, action) => {
    let { data: { session } } = await supabase.auth.getSession();
    
    const makeRequest = (token) => fetch('/api/cf-sync', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ email, action })
    });

    let response = await makeRequest(session?.access_token);

    // If 401, refresh and retry once
    if (response.status === 401) {
        const { data: refreshData } = await supabase.auth.refreshSession();
        if (refreshData.session) {
            response = await makeRequest(refreshData.session.access_token);
        }
    }

    if (!response.ok) throw new Error("Cloudflare Sync Failed");
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");

    try {
      const { data: existing } = await supabase
        .from('authorized_users')
        .select('status')
        .eq('email', email)
        .maybeSingle();

      if (existing) {
        setMsg(`Error: This email is already ${existing.status}.`);
        setLoading(false);
        return; 
      }

      const { error } = await supabase.from('authorized_users').insert({
        email: email,
        full_name: name,
        role: role, 
        status: "PENDING"
      });

      if(error) throw error;

      // --- UPDATED SECURE SYNC ---
      await callCloudflareSync(email, 'add');
      // ---------------------------

      await supabase.channel('app_updates').send({
        type: 'broadcast',
        event: 'staff_update',
        payload: {} 
      });

      const templateParams = {
        to_name: name,
        to_email: email,
        invite_link: window.location.origin, 
        message: "You have been authorized to access the Bookstore IMS."
      };

      await emailjs.send(
        'service_vgbev8k',    
        'template_qhp0o09',   
        templateParams, 
        'TiKR5JvOcEky675Gx'     
      );

      if (onSuccess) onSuccess();
      
      setMsg(`Invite sent to ${name}`);
      setEmail("");
      setName("");
      setRole("EMPLOYEE");
    } catch (error) {
      console.error(error);
      // Determine if it was the DB or the Sync that failed
      if (error.message === "Cloudflare Sync Failed") {
          setMsg("User saved to DB, but Cloudflare Sync failed. Check logs.");
      } else {
          setMsg("Error sending invite.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={handleInvite} className="space-y-4">
        <div className="space-y-4">
          {/* Email Field */}
          <div className="form-control w-full">
            <label className="label py-1">
              <span className="label-text text-[10px] font-bold text-slate-400 uppercase tracking-widest">Email Address</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1 1 0 00.918 0L19 7.161V6a2 2 0 00-2-2H3z" />
                  <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
                </svg>
              </div>
              <LimitedInput 
                type="email" 
                maxLength={300}
                placeholder="e.g. staff@institution.edu" 
                className="input input-bordered w-full pl-10 bg-slate-50 border-slate-200 focus:bg-white text-sm" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                required 
              />
            </div>
          </div>

          {/* Name Field */}
          <div className="form-control w-full">
            <label className="label py-1">
              <span className="label-text text-[10px] font-bold text-slate-400 uppercase tracking-widest">Full Name</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.230 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1a1.23 1.23 0 00.41-1.412 6.533 6.533 0 00-13.076 0z" />
                </svg>
              </div>
              <LimitedInput 
                type="text" 
                maxLength={150}
                placeholder="Enter formal name" 
                className="input input-bordered w-full pl-10 bg-slate-50 border-slate-200 focus:bg-white text-sm" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                required 
              />
            </div>
          </div>
          
          {/* Role Selection (Super Admin Only) */}
          {userRole === 'SUPER_ADMIN' && (
            <div className="form-control w-full">
              <label className="label py-1">
                <span className="label-text text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Role</span>
              </label>
              <select 
                className="select select-bordered w-full bg-slate-50 border-slate-200 font-bold text-xs text-slate-600 h-11"
                value={role} 
                onChange={e => setRole(e.target.value)}
              >
                <option value="EMPLOYEE">Employee</option>
                <option value="ADMIN">Administrator</option>
                <option value="SUPER_ADMIN">Super Administrator</option>
              </select>
            </div>
          )}
        </div>

        <button 
          disabled={loading} 
          type="submit" 
          className="btn btn-primary w-full h-12 shadow-lg shadow-blue-900/10 border-none font-bold normal-case tracking-tight"
        >
          {loading ? (
            <span className="loading loading-spinner loading-sm"></span>
          ) : (
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" />
              </svg>
              Send Authorization
            </div>
          )}
        </button>
        
        {msg && (
          <div className={`p-3 rounded-lg text-[11px] font-bold text-center border animate-in fade-in slide-in-from-top-2 ${
            msg.includes('Error') 
              ? 'bg-rose-50 border-rose-100 text-rose-600' 
              : 'bg-emerald-50 border-emerald-100 text-emerald-600'
          }`}>
            {msg}
          </div>
        )}
      </form>
    </div>
  );
}