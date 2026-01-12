import { useState } from "react";
import { db } from "../lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import emailjs from '@emailjs/browser'; 

export default function AdminInvite() {
  const { currentUser } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("EMPLOYEE");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const handleInvite = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMsg("");

    try {
      // 1. Add to Database Whitelist
      // We use the email as the Document ID for easy lookup later
      await setDoc(doc(db, "authorized_users", email), {
        email: email,
        fullName: name,
        role: role,
        status: "PENDING",
        invitedBy: currentUser.uid,
        invitedAt: serverTimestamp()
      });

      // 2. Send Email via EmailJS
      // REPLACE THE STRINGS BELOW WITH YOUR COPIED KEYS FROM PHASE 3
      const templateParams = {
        to_name: name,
        to_email: email,
        invite_link: window.location.origin, // Gets your current URL (e.g., localhost:5173)
        message: "You have been authorized to access the Bookstore IMS."
      };

      await emailjs.send(
        'service_vgbev8k',    // e.g., "service_x29s"
        'template_qhp0o09',   // e.g., "template_v83k"
        templateParams, 
        'TiKR5JvOcEky675Gx'     // e.g., "A9S_dks83j..."
      );
      
      setMsg(`Success: Invite sent to ${name}`);
      setEmail("");
      setName("");
    } catch (error) {
      console.error(error);
      setMsg("Error sending invite. Check console.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card bg-white shadow p-4 mt-6">
      <h3 className="font-bold text-gray-700 mb-2">Invite New Staff</h3>
      <form onSubmit={handleInvite} className="flex flex-col gap-2">
        <input 
          type="email" placeholder="Staff Email" className="input input-bordered input-sm" 
          value={email} onChange={e => setEmail(e.target.value)} required 
        />
        <input 
          type="text" placeholder="Full Name" className="input input-bordered input-sm" 
          value={name} onChange={e => setName(e.target.value)} required 
        />
        <select 
          className="select select-bordered select-sm"
          value={role} onChange={e => setRole(e.target.value)}
        >
          <option value="EMPLOYEE">Employee</option>
          <option value="ADMIN">Admin</option>
        </select>

        <button disabled={loading} type="submit" className="btn btn-sm btn-outline btn-primary mt-2">
          {loading ? "Sending..." : "Authorize & Send Email"}
        </button>
        
        {msg && <span className={`text-xs ${msg.includes('Error') ? 'text-red-500' : 'text-green-600'}`}>{msg}</span>}
      </form>
    </div>
  );
}