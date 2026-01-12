import { useState } from "react";
import { useAuth } from "../context/AuthContext"; // We need to add signup to context
import { db, auth } from "../lib/firebase"; // Direct auth import needed for creation
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";

export default function Register({ onSwitchToLogin }) {
  const [formData, setFormData] = useState({ email: "", password: "", confirmPass: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { email, password, confirmPass } = formData;

    // 1. Basic Validation
    if (password !== confirmPass) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      // 2. THE SECURITY CHECK (Whitelist Verification)
      // We check if this email exists in 'authorized_users' BEFORE creating account
      const userRef = doc(db, "authorized_users", email);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        throw new Error("ACCESS DENIED: This email has not been invited by Admin.");
      }

      const userData = userSnap.data();

      if (userData.status === "REGISTERED") {
        throw new Error("This account is already registered. Please Login.");
      }

      // 3. Create Firebase Auth Account (Only happens if Step 2 passes)
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 4. Update the Firestore Whitelist Status
      // We link the new Firebase UID to the existing email record
      await updateDoc(userRef, {
        status: "REGISTERED",
        uid: user.uid, // Important: Link the Auth UID to this doc
        registeredAt: serverTimestamp()
      });

      // 5. Create the public user profile (Optional, but good practice)
      // You can also just rely on 'authorized_users' for roles
      
      alert("Registration Successful! Welcome to the Finance System.");
      // The AuthContext will automatically detect login and redirect to Dashboard

    } catch (err) {
      console.error(err);
      // Clean up Firebase error messages for the user
      if(err.code === 'auth/email-already-in-use') {
        setError("Account already exists. Please login.");
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-200">
      <div className="card w-96 bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title justify-center text-blue-800">Staff Registration</h2>
          
          {error && <div className="alert alert-error text-xs">{error}</div>}

          <form onSubmit={handleRegister} className="flex flex-col gap-3">
            <div className="form-control">
              <label className="label"><span className="label-text">Email (Must match Invite)</span></label>
              <input 
                type="email" required className="input input-bordered" 
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Create Password</span></label>
              <input 
                type="password" required className="input input-bordered" 
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
              />
            </div>
            <div className="form-control">
              <label className="label"><span className="label-text">Confirm Password</span></label>
              <input 
                type="password" required className="input input-bordered" 
                value={formData.confirmPass}
                onChange={(e) => setFormData({...formData, confirmPass: e.target.value})}
              />
            </div>
            
            <button disabled={loading} className="btn btn-primary mt-4">
              {loading ? "Verifying Invite..." : "Complete Registration"}
            </button>
          </form>

          <div className="divider">OR</div>
          <button onClick={onSwitchToLogin} className="btn btn-link btn-sm">
            Already registered? Login here
          </button>
        </div>
      </div>
    </div>
  );
}