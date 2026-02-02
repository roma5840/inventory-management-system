import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./components/Login";
import Register from "./components/Register";
import DashboardPage from "./pages/DashboardPage";
import StaffPage from "./pages/StaffPage";
import StudentPage from "./pages/StudentPage"; 
import TransactionsPage from "./pages/TransactionsPage";
import ProductDetailsPage from "./pages/ProductDetailsPage"; 
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import ForgotPassword from "./components/ForgotPassword";
import UpdatePassword from "./components/UpdatePassword";

// Helper for Protected Routes with Real-time Status Check
const ProtectedRoute = ({ children }) => {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (!currentUser) return;

    // 1. Check status immediately on mount
    const checkStatus = async () => {
      const { data } = await supabase
        .from('authorized_users')
        .select('status')
        .eq('id', currentUser.id)
        .single();
      
      if (data?.status === 'INACTIVE') {
        alert("Your access has been revoked by an administrator.");
        await supabase.auth.signOut();
      }
    };
    checkStatus();

    // 2. Listen for real-time changes to MY status
    const channel = supabase
      .channel(`status_check_${currentUser.id}`)
      .on(
        'postgres_changes', 
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'authorized_users', 
          filter: `id=eq.${currentUser.id}` 
        }, 
        async (payload) => {
          if (payload.new.status === 'INACTIVE') {
            alert("Your session has been terminated.");
            await supabase.auth.signOut();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser]);

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

// Helper for Guest-Only Routes (redirect logged-in users)
const GuestRoute = ({ children }) => {
  const { currentUser } = useAuth();
  if (currentUser) return <Navigate to="/" replace />;
  return children;
};

// Helper for Password Recovery
// Allows access IF: 
// 1. A recovery event was detected (clicked email link)
// 2. OR The URL has the recovery hash (failsafe)
const RecoveryRoute = ({ children }) => {
  const { currentUser, isRecoveryMode } = useAuth();
  
  // 1. Check if Supabase told us this is a recovery session
  if (isRecoveryMode) {
    return children;
  }

  // 2. Failsafe: Check URL Hash just in case context missed it
  if (window.location.hash.includes('type=recovery')) {
     return children;
  }

  // 3. If standard logged-in user tries to access manually -> Dashboard
  if (currentUser) {
    return <Navigate to="/" replace />;
  }

  // 4. If not logged in -> Login
  return <Navigate to="/login" replace />;
};

export default function App() {
  return (
    <Routes>
      <Route 
        path="/login" 
        element={
          <GuestRoute>
            <Login />
          </GuestRoute>
        } 
      />
      <Route 
        path="/register" 
        element={
          <GuestRoute>
            <Register />
          </GuestRoute>
        } 
      />
      <Route 
        path="/forgot-password" 
        element={
          <GuestRoute>
            <ForgotPassword />
          </GuestRoute>
        } 
      />
      
      <Route 
        path="/update-password" 
        element={
          <RecoveryRoute>
            <UpdatePassword />
          </RecoveryRoute>
        } 
      />
      
      {/* Protected Dashboard Route */}
      <Route 
        path="/" 
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        } 
      />

      {/* Product Audit Route */}
      <Route 
        path="/product/:id" 
        element={
          <ProtectedRoute>
            <ProductDetailsPage />
          </ProtectedRoute>
        } 
      />

      {/* Protected Student Route */}
      <Route 
        path="/students" 
        element={
          <ProtectedRoute>
            <StudentPage />
          </ProtectedRoute>
        } 
      />

      {/* Transactions Route */}
      <Route 
        path="/transactions" 
        element={
          <ProtectedRoute>
            <TransactionsPage />
          </ProtectedRoute>
        } 
      />
      
      {/* Protected Staff Route */}
      <Route 
        path="/staff" 
        element={
          <ProtectedRoute>
            <StaffPage />
          </ProtectedRoute>
        } 
      />
    </Routes>
  );
}