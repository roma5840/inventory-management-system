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
import SupplierPage from "./pages/SupplierPage";
import InventoryPage from "./pages/InventoryPage";
import { useIdleTimer } from "react-idle-timer";


// Helper for Protected Routes with Real-time Status Check
const ProtectedRoute = ({ children }) => {
  const { currentUser, isRecoveryMode } = useAuth();
  if (!currentUser) return <Navigate to="/login" replace />;
  // Lock recovery sessions to the update-password page — on any tab, any route
  if (isRecoveryMode) return <Navigate to="/update-password" replace />;
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
  if (isRecoveryMode) return children;
  if (currentUser) return <Navigate to="/" replace />;
  return <Navigate to="/login" replace />;
};

const SessionGuard = () => {
  const { currentUser, logout } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [remaining, setRemaining] = useState(0);

  const onPrompt = () => setShowModal(true);
  const onIdle = () => {
    setShowModal(false);
    logout().finally(() => window.location.replace('/login'));
  };
  const onActive = () => setShowModal(false);

  const { getRemainingTime, activate } = useIdleTimer({
    onPrompt,
    onIdle,
    onActive,
    timeout: 600000,          // 10 minutes
    promptBeforeIdle: 30000,  // 30 seconds warning
    crossTab: true,
    leaderElection: true,
    syncTimers: 200,
    disabled: !currentUser,
  });

  // Track remaining time for UI AND save a heartbeat for closed-browser scenarios
  useEffect(() => {
    if (!currentUser) return;
    
    const interval = setInterval(() => {
      // 1. Update UI Countdown
      if (showModal) {
        setRemaining(Math.max(0, Math.ceil(getRemainingTime() / 1000)));
      }
      // 2. Heartbeat: Save activity timestamp for next-morning checks
      if (!showModal) {
        localStorage.setItem('app_last_active', Date.now().toString());
      }
    }, 1000); 

    return () => clearInterval(interval);
  }, [showModal, getRemainingTime, currentUser]);

  if (!showModal || !currentUser) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center pointer-events-auto">
      <div className="bg-white p-6 rounded-lg shadow-2xl max-w-sm w-full text-center">
        <h2 className="text-2xl font-bold text-red-600 mb-2">Security Timeout</h2>
        <p className="text-slate-600 mb-6">
          System is idle. Logging out in{' '}
          <strong className="text-red-600 text-xl">{remaining}s</strong>.
        </p>
        <button
          onClick={() => {
            activate(); 
            setShowModal(false);
          }}
          className="w-full bg-slate-800 text-white font-semibold py-3 px-4 rounded-lg hover:bg-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-900/20 transition-all"
        >
          Resume Session
        </button>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <>
    <SessionGuard />
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

      {/* Product Inventory Route */}
      <Route 
        path="/inventory" 
        element={
          <ProtectedRoute>
            <InventoryPage />
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

      {/* Protected Suppliers Route */}
      <Route 
        path="/suppliers" 
        element={
          <ProtectedRoute>
            <SupplierPage />
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
  </>
  );
}