import React from 'react';

export default function PrintLayout({ data, elementId }) {
  if (!data) return null;

  const isCostType = ['RECEIVING', 'PULL_OUT'].includes(data.type);

  // Helper to calculate line amount (Unit * Qty)
  // Handles both TransactionForm (priceOverride/unitCost) and ReceiptLookup (price/cost snapshots)
  const calculateLineTotal = (item) => {
    const unitVal = isCostType 
        ? Number(item.unitCost || item.cost || 0) 
        : Number(item.priceOverride || item.price || 0);
    return (unitVal * item.qty);
  };

  const grandTotal = data.items.reduce((acc, item) => acc + calculateLineTotal(item), 0);

  // Formatting
  const formatCurrency = (val) => Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  // Dynamic Title
  const getTitle = () => {
      if (data.type === 'ISSUANCE_RETURN') return 'RETURN SLIP';
      if (data.type === 'PULL_OUT') return 'PULL OUT SLIP';
      if (data.type === 'RECEIVING') return 'RECEIVING SLIP';
      return 'ISSUANCE SLIP';
  };

  return (
    <div id={elementId} className="bg-white text-black p-6 font-sans text-xs max-w-[800px] mx-auto leading-normal">
      
      {/* HEADER CENTER */}
      <div className="text-center mb-6">
        <h1 className="font-bold text-sm uppercase tracking-wide">University of Pangasinan</h1>
        <h2 className="font-bold text-sm uppercase">PHINMA Education</h2>
        <h3 className="font-bold text-sm mt-1 uppercase">
          Bookstore {getTitle()}
        </h3>
        <div className="flex justify-center mt-1">
             <p className="text-[10px] font-bold uppercase border-b border-black inline-block pb-0.5">
              UNIFORMS / BOOKS AND OTHER ISSUANCE
            </p>
        </div>
      </div>

      {/* HEADER FIELDS - 2 COLUMN LAYOUT */}
      <div className="flex gap-8 mb-6 uppercase font-medium">
        
        {/* LEFT COLUMN */}
        <div className="flex-1 flex flex-col gap-1">
            <div className="flex items-start">
                <span className="w-32 shrink-0 font-bold text-right pr-2">FULL NAME:</span>
                <div className="border-b border-black flex-1 pl-2 font-bold break-words min-h-[1.2em]">
                    {data.studentName || data.supplier || ""}
                </div>
            </div>
            <div className="flex items-start">
                <span className="w-32 shrink-0 font-bold text-right pr-2">STUDENT #:</span>
                <div className="border-b border-black flex-1 pl-2 font-mono">
                    {data.studentId || ""}
                </div>
            </div>
            <div className="flex items-start">
                <span className="w-32 shrink-0 font-bold text-right pr-2">COURSE/STRAND:</span>
                <div className="border-b border-black flex-1 pl-2 break-words min-h-[1.2em]">
                    {data.course || ""}
                </div>
            </div>
            <div className="flex items-start">
                <span className="w-32 shrink-0 font-bold text-right pr-2">PARENTS NAME:</span>
                <div className="border-b border-black flex-1 min-h-[1.2em]">
                    {/* Intentionally Blank */}
                </div>
            </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="w-[35%] flex flex-col gap-1">
            <div className="flex items-start">
                <span className="w-20 shrink-0 text-right pr-2 font-bold">DATE:</span>
                <div className="border-b border-black flex-1 pl-2">
                    {data.date ? new Date(data.date).toLocaleDateString() : new Date().toLocaleDateString()}
                </div>
            </div>
            <div className="flex items-start">
                <span className="w-20 shrink-0 text-right pr-2 font-bold">YEAR LEVEL:</span>
                <div className="border-b border-black flex-1 pl-2 break-words min-h-[1.2em]">
                     {data.yearLevel || ""}
                </div>
            </div>
            <div className="flex items-start">
                <span className="w-20 shrink-0 text-right pr-2 font-bold">BIS NO.:</span>
                <div className="border-b border-black flex-1 pl-2 min-h-[1.2em]">
                    {/* Intentionally Blank */}
                </div>
            </div>
            {/* REF # explicitly below BIS NO */}
            <div className="flex items-start mt-0.5">
                <span className="w-20 shrink-0"></span>
                <div className="flex-1 text-[9px] text-gray-500 font-mono">
                    REF: {data.refNumber}
                </div>
            </div>
        </div>
      </div>

      {/* ITEMS TABLE */}
      <div className="mb-8 min-h-[250px]">
        <table className="w-full text-xs border-collapse">
            <thead>
                <tr className="border-t border-b border-black">
                    <th className="py-2 text-left uppercase font-bold pl-2">DESCRIPTION</th>
                    <th className="py-2 text-center w-16 uppercase font-bold border-l border-black">QTY</th>
                    <th className="py-2 text-right w-24 uppercase font-bold pr-2 border-l border-black">
                        {isCostType ? "COST" : "PRICE"}
                    </th>
                </tr>
            </thead>
            <tbody>
                {data.items.map((item, idx) => (
                    <tr key={idx} className="align-top">
                        <td className="py-1 pl-2 uppercase font-medium">
                            {item.itemName}
                        </td>
                        <td className="py-1 text-center font-mono border-l border-black">
                             {data.type === 'ISSUANCE_RETURN' ? `(${item.qty})` : item.qty}
                        </td>
                        <td className="py-1 text-right font-mono pr-2 border-l border-black">
                            {formatCurrency(calculateLineTotal(item))}
                        </td>
                    </tr>
                ))}
                
                {/* FILLER ROWS TO MAINTAIN VISUAL HEIGHT IF FEW ITEMS (Optional) */}
                {data.items.length < 5 && Array.from({ length: 5 - data.items.length }).map((_, i) => (
                    <tr key={`filler-${i}`}>
                        <td className="py-2">&nbsp;</td>
                        <td className="py-2 border-l border-black">&nbsp;</td>
                        <td className="py-2 border-l border-black">&nbsp;</td>
                    </tr>
                ))}

                {/* TOTAL ROW */}
                <tr className="border-t border-black font-bold text-sm">
                    <td className="pt-2 text-right"></td>
                    <td className="pt-2 text-right pr-2 border-l border-black">TOTAL:</td>
                    <td className="pt-2 text-right pr-2 border-l border-black">
                        <span className="border-b-4 border-double border-black">
                            {formatCurrency(grandTotal)}
                        </span>
                    </td>
                </tr>
            </tbody>
        </table>
      </div>

      {/* FOOTER SIGNATURE SECTION */}
      <div className="flex justify-between items-end mt-auto pt-4">
          
          {/* Released By */}
          <div className="w-[40%]">
              <div className="text-xs font-bold mb-8">RELEASED BY:</div>
              <div className="border-b border-black w-full"></div>
          </div>

          {/* Received By */}
          <div className="w-[45%] flex flex-col justify-end">
              <p className="text-[10px] italic mb-8 text-left leading-tight">
                  Acknowledging that I have received all items indicated on this list.
              </p>
              <div className="border-b border-black w-full mb-1"></div>
              <p className="text-[10px] font-bold uppercase text-center">Signature over printed name</p>
          </div>
      </div>
      
      {/* TIMESTAMP FOOTER
      <div className="mt-4 text-[8px] text-gray-400 text-right">
        Gen: {new Date().toLocaleString()} | {data.staffName || "System"}
      </div> */}

    </div>
  );
}