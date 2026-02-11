export default function DeleteModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = "Delete Item", 
  itemName, 
  itemIdentifier, 
  warningText, 
  isLoading 
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div 
        className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm transition-opacity" 
        onClick={() => !isLoading && onClose()}
      ></div>

      <div className={`relative bg-white w-full max-w-md rounded-xl shadow-2xl border border-slate-200 overflow-hidden transition-all ${isLoading ? 'opacity-75 pointer-events-none' : 'scale-100'}`}>
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-1.5 bg-rose-500/20 rounded text-rose-400">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 013.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 00-6 0v-.113c0-.794.609-1.428 1.364-1.452zm-.355 5.945a.75.75 0 10-1.5 0l.5 8.5a.75.75 0 101.5 0l-.5-8.5zm4.33.25a.75.75 0 00-1.5 0l.5 8.5a.75.75 0 001.5 0l-.5-8.5z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="font-bold text-white tracking-tight">{title}</h3>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6">
          <p className="text-sm text-slate-600 mb-2 leading-relaxed">Are you sure you want to permanently delete:</p>
          <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg mb-6">
            <div className="font-bold text-slate-900 uppercase break-words">{itemName}</div>
            {itemIdentifier && <div className="font-mono text-[10px] text-slate-400 mt-1">{itemIdentifier}</div>}
          </div>
          
          {warningText && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg text-amber-800 text-xs mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 shrink-0">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <p>{warningText}</p>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button className="btn btn-ghost btn-sm text-slate-500 normal-case" onClick={onClose} disabled={isLoading}>
              Cancel
            </button>
            <button className="btn btn-sm bg-rose-600 hover:bg-rose-700 text-white border-none px-6 normal-case" onClick={onConfirm} disabled={isLoading}>
              {isLoading ? <span className="loading loading-spinner loading-xs"></span> : 'Delete Permanently'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}