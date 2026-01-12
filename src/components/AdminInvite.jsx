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
      await setDoc(doc(db, "authorized_users", email), {
        email: email,
        fullName: name,
        role: role,
        status: "PENDING",
        invitedBy: currentUser.uid,
        invitedAt: serverTimestamp()
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
      
      setMsg(`Invite sent to ${name}`);
      setEmail("");
      setName("");
    } catch (error) {
      console.error(error);
      setMsg("Error sending invite.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card w-full bg-base-200 shadow-xl mt-6 p-6">
      <h3 className="card-title mb-4 text-gray-700">Invite Staff</h3>
      <form onSubmit={handleInvite} className="flex flex-col gap-3">
        <div className="form-control">
          <input 
            type="email" placeholder="Staff Email Address" className="input input-bordered w-full" 
            value={email} onChange={e => setEmail(e.target.value)} required 
          />
        </div>
        <div className="form-control">
          <input 
            type="text" placeholder="Full Name" className="input input-bordered w-full" 
            value={name} onChange={e => setName(e.target.value)} required 
          />
        </div>
        <div className="form-control">
          <select 
            className="select select-bordered w-full"
            value={role} onChange={e => setRole(e.target.value)}
          >
            <option value="EMPLOYEE">Role: Employee</option>
            <option value="ADMIN">Role: Admin</option>
          </select>
        </div>

        <button 
          disabled={loading} 
          type="submit" 
          className={`btn btn-primary w-full mt-2 shadow-sm ${loading ? 'loading' : ''}`}
        >
          {loading ? "Sending..." : "Send Authorization Email"}
        </button>
        
        {msg && <div className={`text-sm text-center mt-2 ${msg.includes('Error') ? 'text-error' : 'text-success'}`}>{msg}</div>}
      </form>
    </div>
  );
}