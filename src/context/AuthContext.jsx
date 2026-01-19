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
  async function login(email, password) {

    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const docRef = doc(db, "authorized_users", user.email);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
       // Valid Password, but NOT in Whitelist
       await signOut(auth); // Kill session immediately
       throw new Error("Access Denied: You are not authorized.");
    }
    
    return userCredential;
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
          
          // If a user logs in but status is still PENDING (eg. reinvited), update it.
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