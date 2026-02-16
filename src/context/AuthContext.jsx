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
  // NEW: Track if the user arrived via a recovery link
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

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

    // 3. Check for Inactive Status
    if (userDoc.status === 'INACTIVE') {
      await supabase.auth.signOut();
      throw new Error("Your account has been deactivated. Contact Super Admin.");
    }

    return authData;
  }


  // Logout Function
  function logout() {
    setIsRecoveryMode(false); // Reset mode on logout
    return supabase.auth.signOut();
  }

  useEffect(() => {
    // Check active session on load
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      await handleSession(session);
      setLoading(false);
    };

    initSession();

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // NEW: Catch the Password Recovery Event
      if (event === 'PASSWORD_RECOVERY') {
        setIsRecoveryMode(true);
      }
      handleSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // REAL-TIME SECURITY: Listen for status changes while logged in
  useEffect(() => {
    if (!currentUser) return;

    // Listen to changes on 'authorized_users' table for this specific user ID
    const channel = supabase
      .channel(`security_watch_${currentUser.id}`)
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'authorized_users', 
          filter: `id=eq.${currentUser.id}` // Monitoring own row
        },
        async (payload) => {
          if (payload.new.status === 'INACTIVE') {
            alert("Session Terminated: Your account has been deactivated.");
            await supabase.auth.signOut();
            setCurrentUser(null);
            window.location.href = '/login'; // Hard redirect to clear state
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  // Helper to sync Auth User with Whitelist Data
  const handleSession = async (session) => {
    if (session?.user) {
      
      const { data, error } = await supabase
        .from('authorized_users')
        .select('*')
        .eq('email', session.user.email)
        .single();
      
      if (error) {
        if (error.code !== 'PGRST116') {
            console.warn("Network/DB glitch during session check. Keeping session alive.", error);
            return; 
        }
      }

      if (data) {
        if (data.status === 'INACTIVE') {
            await supabase.auth.signOut();
            setCurrentUser(null);
            return;
        }

        // --- UPDATED LOGIC START ---
        // We removed the client-side UPDATE here.
        // The SQL Trigger 'on_auth_user_created' now handles the 
        // PENDING -> REGISTERED switch automatically upon sign-up.
        
        // Just set the user state based on what the DB says
        setCurrentUser({ 
          ...session.user, 
          ...data,
          fullName: data.full_name 
        });
        setUserRole(data.role);
        // --- UPDATED LOGIC END ---

      } else {
        console.warn("User no longer in whitelist. Logging out.");
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
    isRecoveryMode,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}