export default function Stats({ products }) {
  // Simple calculation for the dashboard header
  const totalItems = products.reduce((acc, curr) => acc + (curr.currentStock || 0), 0);
  const totalValue = products.reduce((acc, curr) => acc + ((curr.currentStock || 0) * (curr.price || 0)), 0);
  const lowStockCount = products.filter(p => p.currentStock <= p.minStockLevel).length;

  return (
    <div className="stats shadow w-full mb-6 bg-white">
      <div className="stat">
        <div className="stat-figure text-primary">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        </div>
        <div className="stat-title">Total Inventory Value</div>
        <div className="stat-value text-primary">${totalValue.toLocaleString()}</div>
        <div className="stat-desc">Current Assets on Hand</div>
      </div>
      
      <div className="stat">
        <div className="stat-figure text-secondary">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
        </div>
        <div className="stat-title">Total Units</div>
        <div className="stat-value text-secondary">{totalItems}</div>
        <div className="stat-desc">Individual books/items</div>
      </div>

      <div className="stat">
        <div className="stat-figure text-error">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-8 h-8 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        </div>
        <div className="stat-title">Low Stock Alerts</div>
        <div className="stat-value text-error">{lowStockCount}</div>
        <div className="stat-desc text-error font-bold">Requires Attention</div>
      </div>
    </div>
  );
}