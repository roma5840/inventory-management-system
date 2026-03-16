import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  // Safely clear recovery lock across states
  const clearRecoveryMode = useCallback(() => {
    localStorage.removeItem("recoveryMode");
    setIsRecoveryMode(false);
  }, []);

  // Login Function
  async function login(email, password, captchaToken) {
    clearRecoveryMode(); // Safety clear on standard login
    
    // 1. Authenticate with Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: { captchaToken }
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
    clearRecoveryMode();
    return supabase.auth.signOut();
  }

  useEffect(() => {
    // Check active session on load
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Re-hydrate recovery mode safely from localStorage
      if (localStorage.getItem("recoveryMode") === "true") {
        setIsRecoveryMode(true);
      }
      
      await handleSession(session);
      setLoading(false);
    };

    initSession();

    // Listen for cross-tab storage changes to seamlessly sync dashboard redirects
    const handleStorageChange = (e) => {
      if (e.key === "recoveryMode") {
        setIsRecoveryMode(e.newValue === "true");
      }
    };
    window.addEventListener("storage", handleStorageChange);

    // Listen for changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        localStorage.setItem("recoveryMode", "true");
        setIsRecoveryMode(true);
      } else if (event === 'SIGNED_OUT') {
        clearRecoveryMode();
      }

      // SEC-FIX: Prevent network race conditions during background token refreshes
      if (event === 'TOKEN_REFRESHED') {
        if (session?.user) {
           setCurrentUser(prev => prev ? { ...prev, ...session.user } : null);
        }
      } else {
        handleSession(session);
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  // REAL-TIME SECURITY: Listen for status changes while logged in
  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase
      .channel(`security_watch_${currentUser.id}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'authorized_users', 
          filter: `id=eq.${currentUser.id}` 
        },
        async (payload) => {
          if (payload.eventType === 'DELETE' || (payload.eventType === 'UPDATE' && payload.new.status === 'INACTIVE')) {
            alert("Session Terminated: Your access has been deactivated or revoked.");
            await logout();
            setCurrentUser(null);
            setUserRole(null);
            window.location.href = '/login'; 
          } 
          else if (payload.eventType === 'UPDATE' && payload.new.role !== userRole) {
            setUserRole(payload.new.role);
            setCurrentUser(prev => ({ ...prev, role: payload.new.role }));
            alert(`Notice: Your system privileges have been updated to ${payload.new.role.replace('_', ' ')}.`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser, userRole]);

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
            await logout();
            setCurrentUser(null);
            return;
        }

        setCurrentUser({ 
          ...session.user, 
          ...data,
          fullName: data.full_name 
        });
        setUserRole(data.role);

      } else {
        console.warn("User no longer in whitelist. Logging out.");
        await logout();
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
    clearRecoveryMode,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}