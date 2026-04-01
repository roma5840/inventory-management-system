import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function QuickStockCheck() {
  const [mode, setMode] = useState('NAME');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCheck = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const safeVal = query.trim().replace(/"/g, '""');
      let q = supabase.from('products').select('name, barcode, current_stock, location');
      
      if (mode === 'BARCODE') {
          q = q.eq('barcode', safeVal);
      } else {
          // Substring match for broader lookup
          q = q.ilike('name', `%${safeVal}%`).limit(5); 
      }
      
      const { data, error } = await q;
      if (!error && data) setResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 relative overflow-hidden">
        <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md bg-amber-100 text-amber-600 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                </svg>
            </div>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">Quick Stock Check</h3>
        </div>
        
        <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
            Scan an item or search its name to instantly check shelf availability.
        </p>

        <div className="flex gap-1 mb-3 bg-slate-100 p-1 rounded-lg">
            <button type="button" onClick={() => setMode('NAME')} className={`flex-1 text-[9px] font-bold uppercase py-1.5 rounded-md transition-all ${mode==='NAME'?'bg-white shadow-sm text-amber-600':'text-slate-500 hover:text-slate-700'}`}>Item Name</button>
            <button type="button" onClick={() => setMode('BARCODE')} className={`flex-1 text-[9px] font-bold uppercase py-1.5 rounded-md transition-all ${mode==='BARCODE'?'bg-white shadow-sm text-amber-600':'text-slate-500 hover:text-slate-700'}`}>Barcode</button>
        </div>

        <div className="flex gap-2 mb-2">
            <input 
              type="text" 
              value={query} 
              onChange={e => setQuery(e.target.value.toUpperCase())} 
              onKeyDown={e => e.key === 'Enter' && handleCheck()} 
              placeholder={mode === 'BARCODE' ? "SCAN BARCODE..." : "SEARCH PART OF NAME..."} 
              className="flex-1 h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-mono font-bold uppercase outline-none focus:border-amber-400 focus:bg-white transition-all w-full min-w-0" 
            />
            <button 
              onClick={handleCheck} 
              disabled={loading} 
              className="h-10 px-4 rounded-lg bg-slate-100 text-slate-600 font-bold text-[10px] uppercase tracking-wider hover:bg-slate-200 transition-colors shrink-0 disabled:opacity-50"
            >
                {loading ? '...' : 'Check'}
            </button>
        </div>

        {result && result.length === 0 && (
            <div className="text-[10px] text-center text-slate-400 font-bold uppercase mt-3">No Items Found</div>
        )}
        {result && result.length > 0 && (
            <div className="mt-3 space-y-2 max-h-32 overflow-y-auto custom-scrollbar pr-1">
                {result.map((r, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="min-w-0 pr-2 flex-1">
                            <div className="text-[10px] font-bold text-slate-700 truncate uppercase" title={r.name}>{r.name}</div>
                            <div className="text-[9px] font-mono text-slate-400">{r.barcode}</div>
                        </div>
                        <div className="text-right shrink-0 pl-2">
                            <div className={`text-sm font-black leading-none ${r.current_stock <= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                                {r.current_stock}
                            </div>
                            <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">Stock</div>
                        </div>
                    </div>
                ))}
            </div>
        )}
    </div>
  );
}