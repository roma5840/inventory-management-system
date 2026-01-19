import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";

// Components moved here
import Navbar from "../components/Navbar";
import Stats from "../components/Stats";
import TransactionForm from "../components/TransactionForm";
import AdminInvite from "../components/AdminInvite";
import Dashboard from "../components/Dashboard";
import TransactionHistory from "../components/TransactionHistory";

export default function DashboardPage() {
  const { userRole } = useAuth();

  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <Navbar />
      
      <main className="container mx-auto px-4">
        <Stats />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
               <TransactionForm />
               
               <div className="card w-full bg-base-200 shadow-xl mt-6 p-6">
                 <h3 className="card-title text-gray-700 mb-2">Instructions</h3>
                 <ul className="text-sm list-disc list-inside text-gray-600 space-y-2">
                   <li><strong>Receiving:</strong> Stock In. Fills Name/Price if item is new.</li>
                   <li><strong>Issuance:</strong> Stock Out to Student/Dept.</li>
                   <li><strong>Return:</strong> Student returns item to shelf.</li>
                   <li><strong>Pull Out:</strong> Defective item sent back to supplier.</li>
                 </ul>
               </div>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="lg:col-span-2 flex flex-col gap-8">
            <TransactionHistory /> 
            <Dashboard />
          </div>

        </div>
      </main>
    </div>
  );
}