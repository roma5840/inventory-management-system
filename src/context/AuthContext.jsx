import { createContext, useContext, useEffect, useState } from "react";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
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
        console.log("JWT Token:", token);

        // CHECK WHITELIST (Authorization)
        // check if this email exists in authorized_users collection
        const docRef = doc(db, "authorized_users", user.email);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          // User is authorized
          const userData = docSnap.data();
          setCurrentUser({ ...user, ...userData }); // Merge Auth data with Firestore Role
          setUserRole(userData.role); 
        } else {
          // User registered but NOT in whitelist
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