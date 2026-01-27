import Navbar from "../components/Navbar";
import TransactionsManager from "../components/TransactionsManager";

export default function TransactionsPage() {
  return (
    <div className="min-h-screen bg-slate-100 pb-10">
      <Navbar />
      <main className="container mx-auto px-4">
        <TransactionsManager />
      </main>
    </div>
  );
}