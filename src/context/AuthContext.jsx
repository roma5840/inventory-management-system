import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

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
    // 1. Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (authError) throw authError;

    // 2. Check Whitelist Table
    const { data: userDoc, error: docError } = await supabase
      .from('authorized_users')
      .select('*')
      .eq('email', email)
      .single();

    if (docError || !userDoc) {
      await supabase.auth.signOut();
      throw new Error("Access Denied: You are not authorized.");
    }

    return authData;
  }


  // Logout Function
  function logout() {
    return supabase.auth.signOut();
  }

  useEffect(() => {
    // Check active session on load
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await handleSession(session); // Wait for whitelist check to finish
      setLoading(false); // NOW we are ready
    };

    initSession();

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Helper to sync Auth User with Whitelist Data
  const handleSession = async (session) => {
    if (session?.user) {
      const { data } = await supabase
        .from('authorized_users')
        .select('*')
        .eq('email', session.user.email)
        .single();
      
      if (data) {
        // Update status if first time logging in
        if (data.status === 'PENDING') {
           await supabase.from('authorized_users').update({ 
             status: 'REGISTERED', 
             auth_uid: session.user.id 
           }).eq('email', session.user.email);

           // TRIGGER: Broadcast this update to Admin tabs immediately
           await supabase.channel('app_updates').send({
             type: 'broadcast',
             event: 'staff_update',
             payload: {} 
           });
        }
        
        // Map DB snake_case to Context camelCase
        setCurrentUser({ 
          ...session.user, 
          ...data,
          fullName: data.full_name 
        });
        setUserRole(data.role);
      } else {
        // Valid login but removed from whitelist
        await supabase.auth.signOut();
        setCurrentUser(null);
      }
    } else {
      setCurrentUser(null);
      setUserRole(null);
    }
  };


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