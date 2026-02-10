import TransactionsManager from "../components/TransactionsManager";
import Sidebar from "../components/Sidebar";

export default function TransactionsPage() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex">
      <Sidebar />
      
      <main className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <div className="p-8 space-y-8 max-w-[1600px] mx-auto w-full">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Transaction Ledger</h1>
                <p className="text-sm text-slate-500">Complete audit log of all financial and stock movements.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <TransactionsManager />
            </div>
        </div>
      </main>
    </div>
  );
}