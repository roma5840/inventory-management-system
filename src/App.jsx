import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Login from "./components/Login";
import Register from "./components/Register";
import DashboardPage from "./pages/DashboardPage";
import StaffPage from "./pages/StaffPage";
import StudentPage from "./pages/StudentPage"; 
import TransactionsPage from "./pages/TransactionsPage";
import ProductDetailsPage from "./pages/ProductDetailsPage"; 

// Helper for Protected Routes
const ProtectedRoute = ({ children }) => {
  const { currentUser } = useAuth();
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      
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