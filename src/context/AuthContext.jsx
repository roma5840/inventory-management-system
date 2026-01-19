import { createContext, useContext, useEffect, useState } from "react";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  // Login Function
  function login(email, password) {
    return signInWithEmailAndPassword(auth, email, password);
  }

  // Logout Function
  function logout() {
    return signOut(auth);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // PROOF OF JWT
        const token = await user.getIdToken(); 
        // console.log("JWT Token:", token); // Optional debug

        // CHECK WHITELIST (Authorization)
        const docRef = doc(db, "authorized_users", user.email);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          // User is authorized
          const userData = docSnap.data();
          
          // PATCH: If a user logs in but status is still PENDING (e.g. re-invited), update it.
          if (userData.status === "PENDING") {
             const { updateDoc } = await import("firebase/firestore"); // Dynamic import or use existing
             await updateDoc(docRef, { 
               status: "REGISTERED",
               uid: user.uid, // Ensure UID is synced
               lastLogin: new Date()
             });
          }

          setCurrentUser({ ...user, ...userData }); 
          setUserRole(userData.role); 
        } else {
          // User registered but NOT in whitelist (or Revoked)
          alert("Access Denied: You are not in the authorized personnel list.");
          await signOut(auth);
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    userRole,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}