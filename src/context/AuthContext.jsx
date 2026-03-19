import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

// 1. KEPT PREVIOUS DEV'S CODE: Decodes JWT safely
const decodeJWT = (token) => {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); }
  catch { return null; }
};

// 2. KEPT PREVIOUS DEV'S CODE: Cryptographically checks if user used a magic link
const isRecoverySession = (session) => {
  if (!session?.access_token) return false;
  const amr = decodeJWT(session.access_token)?.amr ?? [];
  return amr.some(a => a.method === 'otp') && !amr.some(a => a.method === 'password');
};

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  // 3. NEW: Safely unlock recovery mode across all tabs
  const clearRecoveryMode = useCallback(() => {
    // We set an "unlocked" flag so new tabs know the password was successfully changed
    // even if the Supabase JWT still temporarily says "otp"
    localStorage.setItem("recovery_unlocked", "true");
    setIsRecoveryMode(false);
  }, []);

  async function login(email, password, captchaToken) {
    localStorage.removeItem("recovery_unlocked"); // Safety clear
    
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email, password, options: { captchaToken }
    });
    if (authError) throw authError;

    const { data: userDoc, error: docError } = await supabase
      .from('authorized_users')
      .select('*')
      .eq('email', email)
      .single();

    if (docError || !userDoc) {
      await supabase.auth.signOut();
      throw new Error("Access Denied: You are not authorized.");
    }

    if (userDoc.status === 'INACTIVE') {
      await supabase.auth.signOut();
      throw new Error("Your account has been deactivated. Contact Super Admin.");
    }

    return authData;
  }

  function logout() {
    localStorage.removeItem("recovery_unlocked");
    return supabase.auth.signOut();
  }

  // Helper to evaluate recovery state based on BOTH the JWT and the unlock flag
  const evaluateRecoveryState = useCallback((session) => {
    const isOtpSession = isRecoverySession(session);
    const isUnlocked = localStorage.getItem("recovery_unlocked") === "true";

    // If it's an OTP session AND they haven't unlocked it yet, lock them in recovery mode
    if (isOtpSession && !isUnlocked) {
      setIsRecoveryMode(true);
    } else {
      setIsRecoveryMode(false);
    }
  }, []);

  useEffect(() => {
    const initSession = async () => {
      // --- NEW: Next Morning / Closed-Browser Check ---
      const lastActive = localStorage.getItem('app_last_active');
      const now = Date.now();
      
      // If they were gone for more than 10 mins (600,000 ms), destroy the session immediately
      if (lastActive && (now - parseInt(lastActive, 10)) > 600000) {
        localStorage.removeItem('app_last_active');
        await supabase.auth.signOut();
      }
      // ------------------------------------------------

      const { data: { session } } = await supabase.auth.getSession();
      evaluateRecoveryState(session);
      await handleSession(session);
      setLoading(false);
    };

    initSession();

    // Listen for cross-tab storage changes to seamlessly sync dashboard redirects
    const handleStorageChange = (e) => {
      if (e.key === "recovery_unlocked" && e.newValue === "true") {
        setIsRecoveryMode(false);
      }
    };
    window.addEventListener("storage", handleStorageChange);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        localStorage.removeItem("recovery_unlocked");
        setIsRecoveryMode(true);
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem("recovery_unlocked");
        localStorage.removeItem('app_last_active'); // Clean up heartbeat on logout
        setIsRecoveryMode(false);
      }

      if (event === 'TOKEN_REFRESHED') {
        if (session?.user) {
           setCurrentUser(prev => prev ? { ...prev, ...session.user, role: prev.role } : null);
        }
      } else {
        evaluateRecoveryState(session);
        handleSession(session);
      }
    });

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [evaluateRecoveryState]);

  // REAL-TIME SECURITY: Listen for status changes
  useEffect(() => {
    if (!currentUser) return;

    const channel = supabase.channel(`security_watch_${currentUser.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'authorized_users', filter: `id=eq.${currentUser.id}` },
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
      ).subscribe();

    return () => supabase.removeChannel(channel);
  }, [currentUser, userRole]);

  const handleSession = async (session) => {
    if (session?.user) {
      const { data, error } = await supabase.from('authorized_users').select('*').eq('email', session.user.email).single();
      
      if (error && error.code !== 'PGRST116') return; 

      if (data) {
        if (data.status === 'INACTIVE') {
            await logout();
            setCurrentUser(null);
            return;
        }
        setCurrentUser({ ...session.user, ...data, fullName: data.full_name });
        setUserRole(data.role);
      } else {
        await logout();
        setCurrentUser(null);
      }
    } else {
      setCurrentUser(null);
      setUserRole(null);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, userRole, isRecoveryMode, clearRecoveryMode, login, logout }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}