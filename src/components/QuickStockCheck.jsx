import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

export default function QuickStockCheck() {
  const [mode, setMode] = useState('NAME');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // Dropdown state
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef(null);

  // Auto-clear when switching modes
  const handleSwitchMode = (newMode) => {
      setMode(newMode);
      setQuery('');
      setResult(null);
      setSuggestions([]);
      setShowDropdown(false);
      setActiveIndex(-1);
      if (inputRef.current) inputRef.current.focus();
  };

  // Debounced search for partial name matching
  useEffect(() => {
      if (mode !== 'NAME' || !query.trim()) {
          setSuggestions([]);
          return;
      }

      // Don't search if the query perfectly matches an existing result name
      if (result && result.length > 0 && result[0].name.toUpperCase() === query.trim().toUpperCase()) {
          return;
      }

      const timer = setTimeout(async () => {
          const safeVal = query.trim().replace(/"/g, '""');
          const { data } = await supabase.from('products')
              .select('name, barcode, current_stock, location')
              .ilike('name', `%${safeVal}%`)
              .order('name')
              .limit(30);
          
          if (data) setSuggestions(data);
      }, 250);

      return () => clearTimeout(timer);
  }, [query, mode, result]);

  const selectSuggestion = (prod) => {
      setQuery(prod.name);
      setShowDropdown(false);
      setResult([prod]); // Instantly show result without a secondary network call
  };

  const handleCheck = async () => {
    if (!query.trim()) return;
    
    // If user hit enter while highlighting a dropdown item
    if (showDropdown && activeIndex >= 0 && suggestions[activeIndex]) {
        selectSuggestion(suggestions[activeIndex]);
        return;
    }

    setLoading(true);
    setResult(null);
    setShowDropdown(false);

    try {
      const safeVal = query.trim().replace(/"/g, '""');
      let q = supabase.from('products').select('name, barcode, current_stock, location');
      
      if (mode === 'BARCODE') {
          q = q.eq('barcode', safeVal);
      } else {
          // Fallback if they click "Check" without selecting from dropdown
          q = q.ilike('name', `%${safeVal}%`); 
      }
      
      const { data, error } = await q.limit(1); // Just show the top exact match
      if (!error && data) setResult(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
      if (mode === 'NAME' && showDropdown && suggestions.length > 0) {
          if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
          } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex(prev => (prev > 0 ? prev - 1 : 0));
          } else if (e.key === 'Enter') {
              e.preventDefault();
              handleCheck();
          } else if (e.key === 'Escape') {
              setShowDropdown(false);
          }
      } else if (e.key === 'Enter') {
          e.preventDefault();
          handleCheck();
      }
  };

  // Auto-scroll dropdown
  useEffect(() => {
      if (showDropdown && activeIndex >= 0) {
          const activeEl = document.getElementById(`qs-option-${activeIndex}`);
          if (activeEl) activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
  }, [activeIndex, showDropdown]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 relative overflow-visible">
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
            <button type="button" onClick={() => handleSwitchMode('NAME')} className={`flex-1 text-[9px] font-bold uppercase py-1.5 rounded-md transition-all ${mode==='NAME'?'bg-white shadow-sm text-amber-600':'text-slate-500 hover:text-slate-700'}`}>Item Name</button>
            <button type="button" onClick={() => handleSwitchMode('BARCODE')} className={`flex-1 text-[9px] font-bold uppercase py-1.5 rounded-md transition-all ${mode==='BARCODE'?'bg-white shadow-sm text-amber-600':'text-slate-500 hover:text-slate-700'}`}>Barcode</button>
        </div>

        <div className="flex gap-2 mb-2 relative">
            <input 
              ref={inputRef}
              type="text" 
              value={query} 
              onChange={e => {
                  setQuery(e.target.value.toUpperCase());
                  if (mode === 'NAME') {
                      setShowDropdown(true);
                      setActiveIndex(0);
                  }
              }} 
              onKeyDown={handleKeyDown}
              onFocus={() => { if(mode === 'NAME' && query) setShowDropdown(true); }}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
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

            {/* Autocomplete Dropdown */}
            {mode === 'NAME' && showDropdown && suggestions.length > 0 && (
                <ul className="absolute z-[100] top-[calc(100%+4px)] left-0 right-16 bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto ring-1 ring-black/5 custom-scrollbar">
                    {suggestions.map((prod, index) => (
                        <li key={index} 
                            id={`qs-option-${index}`}
                            className={`px-3 py-2 cursor-pointer border-b border-slate-50 last:border-0 hover:bg-amber-50 transition-colors flex flex-col
                                ${index === activeIndex ? 'bg-amber-50' : ''}`}
                            onMouseDown={() => selectSuggestion(prod)}
                        >
                            <span className={`text-[10px] font-bold truncate ${index === activeIndex ? 'text-amber-700' : 'text-slate-700'}`} title={prod.name}>
                                {prod.name || "UNNAMED ITEM"}
                            </span>
                            <span className={`font-mono text-[9px] font-semibold ${index === activeIndex ? 'text-amber-500' : 'text-slate-400'}`}>
                                {prod.barcode}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
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