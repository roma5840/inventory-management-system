import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { db, auth } from "../lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";

export default function Register() {
  const { currentUser } = useAuth(); // Get currentUser to check auth state
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ email: "", password: "", confirmPass: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // If manually navigating to /register while logged in
  useEffect(() => {
    if (currentUser) navigate("/");
  }, [currentUser, navigate]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { email, password, confirmPass } = formData;

    if (password !== confirmPass) {
      setError("Passwords do not match.");
      setLoading(false);
      return;
    }

    try {
      const userRef = doc(db, "authorized_users", email);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        throw new Error("ACCESS DENIED: This email has not been invited by Admin.");
      }

      const userData = userSnap.data();
      if (userData.status === "REGISTERED") {
        throw new Error("This account is already registered. Please Login.");
      }

      // This line automatically logs the user in upon success
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateDoc(userRef, {
        status: "REGISTERED",
        uid: user.uid,
        registeredAt: serverTimestamp()
      });

      alert("Registration Successful! Welcome to the Finance System.");
      // Navigate not strictly needed as useeffect will catch the auth change, 
      // but kept for clarity.
      navigate("/"); 

    } catch (err) {
      console.error(err);
      if(err.code === 'auth/email-already-in-use') {
        setError("Account already exists. Please login.");
      } else {
        setError(err.message);
      }
      setLoading(false);
    }
  };

  // RENDER GUARD
  if (currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-200">
        <div className="flex flex-col items-center gap-4">
          <span className="loading loading-spinner loading-lg text-primary"></span>
          <p className="text-gray-500 animate-pulse">Setting up your dashboard...</p>
        </div>
      </div>
    );
  }

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
          <Link to="/login" className="btn btn-link btn-sm">
            Already registered? Login here
          </Link>
        </div>
      </div>
    </div>
  );
}