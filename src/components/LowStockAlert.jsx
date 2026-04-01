import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import Pagination from "./Pagination";
import { useAuth } from "../context/AuthContext";

export default function LowStockAlert({ refreshTrigger }) {
    const { userRole } = useAuth();
    if (!['ADMIN', 'SUPER_ADMIN'].includes(userRole)) return null;
    const LOW_STOCK_PER_PAGE = 30;

    // Card state
    const [previewItems, setPreviewItems] = useState([]);
    const [lowStockCount, setLowStockCount] = useState(0);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [modalData, setModalData] = useState([]);
    const [modalLoading, setModalLoading] = useState(false);
    const [modalPage, setModalPage] = useState(1);

    // 1. Fetch total count & top 3 for the preview card
    useEffect(() => {
        const fetchInitialData = async () => {
            // Get Total Count
            const { data: countData } = await supabase.rpc('get_low_stock_count');
            if (typeof countData === 'number') setLowStockCount(countData);

            // Get Top 3 Preview
            const { data: previewData } = await supabase.rpc('get_low_stock_list', { limit_val: 3, offset_val: 0 });
            if (previewData) setPreviewItems(previewData);
        };
        fetchInitialData();
    }, [refreshTrigger]);

    // 2. Fetch full paginated list when modal is open
    useEffect(() => {
        if (!showModal) return;

        const fetchDetailedLowStock = async () => {
            setModalLoading(true);
            const { data, error } = await supabase.rpc('get_low_stock_list', {
                limit_val: LOW_STOCK_PER_PAGE,
                offset_val: (modalPage - 1) * LOW_STOCK_PER_PAGE
            });

            if (!error && data) {
                setModalData(data);
            } else {
                setModalData([]);
            }
            setModalLoading(false);
        };

        fetchDetailedLowStock();
    }, [showModal, modalPage, refreshTrigger]);

    if (previewItems.length === 0) return null;

    return (
        <>
            {/* ALERT CARD */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-1 max-h-[350px]">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-rose-50/50 rounded-t-2xl">
                    <div className="flex items-center gap-2">
                        <div className="relative w-2 h-2">
                            <div className="absolute inset-0 bg-rose-500 rounded-full animate-ping opacity-75"></div>
                            <div className="relative w-2 h-2 bg-rose-500 rounded-full"></div>
                        </div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-rose-800">Critical Stock</h3>
                    </div>
                    {lowStockCount > 3 && (
                        <button onClick={() => { setModalPage(1); setShowModal(true); }} className="text-[10px] font-bold text-rose-600 uppercase tracking-wider hover:underline transition-all">
                            See All ({lowStockCount})
                        </button>
                    )}
                </div>
                
                <div className="flex flex-col flex-1 overflow-y-auto custom-scrollbar p-2">
                    {previewItems.map((item, idx) => (
                        <div key={item.internal_id || idx}>
                            <div className="p-3 hover:bg-slate-50 rounded-xl transition-colors group flex justify-between items-center border border-transparent hover:border-slate-100">
                                <div className="flex-1 min-w-0 pr-3">
                                    <div className="text-[11px] font-bold text-slate-700 uppercase truncate" title={item.name}>{item.name}</div>
                                    <div className="text-[9px] font-mono text-slate-400 mt-0.5">{item.barcode}</div>
                                </div>
                                <div className="text-right shrink-0">
                                    <span className="text-xs font-black text-rose-600">{item.current_stock}</span>
                                    <div className="text-[8px] font-bold uppercase tracking-wider text-slate-400 mt-0.5">In Stock</div>
                                </div>
                            </div>
                            {idx < previewItems.length - 1 && <div className="h-px w-full bg-slate-50 my-0.5"></div>}
                        </div>
                    ))}
                </div>
            </div>

            {/* FULL LIST MODAL */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setShowModal(false)} />
                    
                    <div className="relative bg-white w-full max-w-5xl max-h-[90vh] rounded-2xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className="font-bold text-xl text-slate-900">Critical Stock Report</h3>
                                </div>
                                <p className="text-sm text-slate-500 font-medium">Inventory items at or below minimum alert levels</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        <div className="flex-1 overflow-auto custom-scrollbar">
                            <table className="table table-md w-full border-separate border-spacing-0">
                                <thead className="sticky top-0 z-20">
                                    <tr className="bg-slate-50 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
                                        <th className="bg-slate-50 text-[10px] uppercase tracking-widest font-black text-slate-500 py-4 pl-6">Barcode</th>
                                        <th className="bg-slate-50 text-[10px] uppercase tracking-widest font-black text-slate-500 py-4">Product Name</th>
                                        <th className="bg-slate-50 text-[10px] uppercase tracking-widest font-black text-slate-500 py-4">Location</th>
                                        <th className="bg-slate-50 text-[10px] uppercase tracking-widest font-black text-slate-500 py-4 text-center">Min</th>
                                        <th className="bg-slate-50 text-[10px] uppercase tracking-widest font-black text-slate-500 py-4 text-center">Current</th>
                                        <th className="bg-slate-50 text-[10px] uppercase tracking-widest font-black text-slate-500 py-4 text-center pr-6">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {modalLoading ? (
                                        <tr>
                                            <td colSpan="6" className="py-20">
                                                <div className="flex flex-col items-center justify-center gap-3">
                                                    <span className="loading loading-spinner loading-lg text-slate-300"></span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : modalData.length === 0 ? (
                                        <tr><td colSpan="6" className="text-center py-20 text-slate-400 font-medium">No critical items found.</td></tr>
                                    ) : (
                                        modalData.map(item => (
                                            <tr key={item.internal_id} className="hover:bg-blue-50/30 transition-colors group">
                                                <td className="pl-6 py-4">
                                                    <code className="text-[10px] font-bold bg-slate-100 px-2 py-1 rounded text-slate-600 group-hover:bg-white transition-colors uppercase tracking-tighter">
                                                        {item.barcode}
                                                    </code>
                                                </td>
                                                <td className="py-4">
                                                    <div className="font-bold text-sm text-slate-800 leading-tight">{item.name}</div>
                                                </td>
                                                <td className="py-4">
                                                    <span className="text-xs font-semibold text-slate-500">{item.location || '—'}</span>
                                                </td>
                                                <td className="py-4 text-center font-mono text-xs text-slate-400 font-bold">{item.min_stock_level}</td>
                                                <td className="py-4 text-center">
                                                    <span className="text-sm font-black text-rose-600 tabular-nums">{item.current_stock}</span>
                                                </td>
                                                <td className="py-4 pr-6 text-center">
                                                {item.current_stock <= 0 ? (
                                                    <span className="text-[10px] font-bold uppercase text-slate-300 tracking-tight">Out of Stock</span>
                                                ) : (
                                                    <span className="text-[10px] font-extrabold uppercase text-slate-500 tracking-tight">Critical Level</span>
                                                )}
                                            </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-slate-50 border-t border-slate-100 p-4">
                            <Pagination 
                                totalCount={lowStockCount}
                                itemsPerPage={LOW_STOCK_PER_PAGE}
                                currentPage={modalPage}
                                onPageChange={(p) => setModalPage(p)}
                                loading={modalLoading}
                            />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}