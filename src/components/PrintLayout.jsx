import React from 'react';

const TransmittalLayout = ({ data, elementId }) => (
    <div id={elementId} className="w-full max-w-[800px] mx-auto bg-white text-black p-6 font-sans text-[12px] leading-tight flex flex-col min-h-[500px]">
        {/* HEADER */}
        <div className="text-center mb-6">
            <h2 className="font-bold text-[13px] uppercase tracking-wide">PHINMA EDUCATION</h2>
            <h1 className="font-bold text-[15px] uppercase mt-1">University of Pangasinan</h1>
            <div className="mt-6 mb-4">
                <h3 className="font-bold text-[13px] uppercase">BUSINESS CENTER</h3>
                <h3 className="font-bold text-[13px] uppercase">TRANSMITTAL FORM</h3>
            </div>
        </div>

        {/* METADATA GRID */}
        <div className="flex justify-between mb-4">
            <div className="flex flex-col gap-1 w-1/3">
                <div className="flex">
                    <span className="w-12 shrink-0 text-left">Dept:</span>
                    <div className="border-b border-black flex-1 pl-2 font-bold uppercase min-h-[1.2em]">
                        {data.department || ""}
                    </div>
                </div>
                <div className="flex mt-1">
                    <span className="w-12 shrink-0 text-left">Date:</span>
                    <div className="border-b border-black flex-1 pl-2 uppercase min-h-[1.2em]">
                        {data.date ? new Date(data.date).toLocaleDateString() : new Date().toLocaleDateString()}
                    </div>
                </div>
            </div>
            <div className="flex flex-col gap-1 w-1/3">
                <div className="flex items-end">
                    <span className="w-10 shrink-0 text-right pr-2">TR #:</span>
                    <div className="border-b border-black flex-1 pl-2 font-bold uppercase min-h-[1.2em]">
                        {data.transmittalNo || ""}
                    </div>
                </div>
                <div className="flex mt-1 items-end">
                    <span className="w-10 shrink-0 text-right pr-2">IS #</span>
                    <div className="border-b border-black flex-1 pl-2 uppercase min-h-[1.2em]">
                        {/* Intentionally left blank */}
                    </div>
                </div>
            </div>
        </div>

        {/* ITEMS TABLE */}
        <div className="mb-8 flex-1">
            <table className="w-full text-[12px] border-collapse border border-black">
                <thead>
                    <tr>
                        <th className="py-1 px-2 text-center w-16 uppercase font-bold border border-black">UNIT</th>
                        <th className="py-1 px-2 text-left uppercase font-bold border border-black">PARTICULARS</th>
                        <th className="py-1 px-2 text-center w-24 uppercase font-bold border border-black">PRICE</th>
                        <th className="py-1 px-2 text-center w-24 uppercase font-bold border border-black">TOTAL</th>
                    </tr>
                </thead>
                <tbody>
                    {data.items.map((item, idx) => (
                        <tr key={idx} className="align-top h-6">
                            <td className="py-1 px-2 text-center border border-black font-mono">
                                {data.type === 'ISSUANCE_RETURN' ? `(${item.qty})` : item.qty}
                            </td>
                            <td className="py-1 px-2 text-left border border-black uppercase font-medium">
                                {item.itemName}
                            </td>
                            <td className="py-1 px-2 border border-black"></td>
                            <td className="py-1 px-2 border border-black"></td>
                        </tr>
                    ))}
                    {/* Filler Rows to match Excel aesthetic */}
                    {Array.from({ length: Math.max(5, 8 - data.items.length) }).map((_, i) => (
                        <tr key={`filler-${i}`} className="h-6">
                            <td className="py-1 border border-black">&nbsp;</td>
                            <td className="py-1 border border-black">&nbsp;</td>
                            <td className="py-1 border border-black">&nbsp;</td>
                            <td className="py-1 border border-black">&nbsp;</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>

        {/* FOOTER SIGNATURES */}
        <div className="flex flex-col gap-4 text-[11px]">
            <div className="flex items-end">
                <span className="w-24 shrink-0 text-left">Released by:</span>
                <div className="border-b border-black w-72 pl-2 uppercase font-medium">
                    {data.releasedBy || ""}
                </div>
            </div>
            <div className="flex items-end mt-2">
                <span className="w-24 shrink-0 text-left">Requested by:</span>
                <div className="border-b border-black w-72 pl-2 uppercase font-medium">
                    {data.requestedBy || ""}
                </div>
            </div>
            <div className="flex items-end mt-2">
                <span className="w-24 shrink-0 text-left">Received by:</span>
                <div className="flex flex-col items-center w-72">
                    <div className="border-b border-black w-full min-h-[1.5rem]"></div>
                    <span className="text-[9px] mt-0.5">Signature Over Printed Name</span>
                </div>
            </div>
            <div className="flex items-end mt-4">
                <span className="w-24 shrink-0 text-left">Purpose:</span>
                <div className="border-b border-black w-96 pl-2 uppercase font-medium">
                    {data.purpose || ""}
                </div>
            </div>
            <div className="flex items-end mt-2">
                <span className="w-24 shrink-0 text-left">Charge to:</span>
                <div className="border-b border-black w-96 pl-2 uppercase font-medium">
                    {data.chargeTo || ""}
                </div>
            </div>
        </div>
    </div>
);


export default function PrintLayout({ data, elementId }) {
  if (!data) return null;

  if (data.transactionMode === 'TRANSMITTAL') {
      return <TransmittalLayout data={data} elementId={elementId} />;
  }

  const isCostType = ['RECEIVING', 'PULL_OUT'].includes(data.type);

  const getUnitVal = (item) => {
    if (isCostType) {
        return Number(item.unitCost || item.cost || 0);
    }
    
    // Explicit override for Cash mode to automatically use cashPrice
    if (data.transactionMode === 'CASH') {
        const cashValue = item.cashPrice !== undefined ? item.cashPrice : item.cash_price_snapshot;
        if (cashValue !== undefined && cashValue !== null) {
            return Number(cashValue);
        }
    }
    
    return Number(item.priceOverride || item.price || 0);
  };

  const calculateLineTotal = (item) => {
    return (getUnitVal(item) * item.qty);
  };

  const grandTotal = data.items.reduce((acc, item) => acc + calculateLineTotal(item), 0);
  const formatCurrency = (val) => Number(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  const getTitle = () => {
      if (data.type === 'ISSUANCE_RETURN') return 'RETURN SLIP';
      if (data.type === 'PULL_OUT') return 'PULL OUT SLIP';
      if (data.type === 'RECEIVING') return 'RECEIVING SLIP';
      return 'ISSUANCE SLIP';
  };

  // REUSABLE SLIP COMPONENT (Exact original design)
  const Slip = ({ label }) => (
    <div className="bg-white text-black p-4 font-sans text-[11px] leading-tight relative">
      {/* COPY LABEL INDICATOR */}
      <div className="absolute top-1 right-4 text-[8px] font-bold uppercase text-gray-400">
        {label}
      </div>

      {/* HEADER CENTER */}
      <div className="text-center mb-4">
        <h1 className="font-bold text-[12px] uppercase tracking-wide">University of Pangasinan</h1>
        <h2 className="font-bold text-[12px] uppercase">PHINMA Education</h2>
        <h3 className="font-bold text-[12px] mt-0.5 uppercase">
          Bookstore {getTitle()}
        </h3>
        <div className="flex justify-center mt-0.5">
             <p className="text-[9px] font-bold uppercase border-b border-black inline-block pb-0.5">
              UNIFORMS / BOOKS AND OTHER ISSUANCE
            </p>
        </div>
      </div>

      {/* HEADER FIELDS */}
      <div className="flex gap-6 mb-4 uppercase font-medium">
        {isCostType ? (
          <div className="flex-1 flex flex-col gap-1">
              <div className="flex items-start">
                  <span className="w-28 shrink-0 font-bold text-right pr-2">SUPPLIER:</span>
                  <div className="border-b border-black flex-1 pl-1 font-bold break-words min-h-[1.2em]">
                      {data.supplier || ""}
                  </div>
              </div>
              <div className="flex items-start">
                  <span className="w-28 shrink-0 font-bold text-right pr-2">CONTACT INFO:</span>
                  <div className="border-b border-black flex-1 pl-1 break-words min-h-[1.2em]">
                      {data.contactInfo || ""}
                  </div>
              </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-1">
              <div className="flex items-start">
                  <span className="w-28 shrink-0 font-bold text-right pr-2">FULL NAME:</span>
                  <div className="border-b border-black flex-1 pl-1 font-bold break-words min-h-[1.2em]">
                      {data.studentName || ""}
                  </div>
              </div>
              <div className="flex items-start">
                  <span className="w-28 shrink-0 font-bold text-right pr-2">STUDENT #:</span>
                  <div className="border-b border-black flex-1 pl-1 font-mono">
                      {data.studentId || ""}
                  </div>
              </div>
              <div className="flex items-start">
                  <span className="w-28 shrink-0 font-bold text-right pr-2">COURSE/STRAND:</span>
                  <div className="border-b border-black flex-1 pl-1 break-words min-h-[1.2em]">
                      {data.course || ""}
                  </div>
              </div>
              <div className="flex items-start">
                  <span className="w-28 shrink-0 font-bold text-right pr-2">PARENTS NAME:</span>
                  <div className="border-b border-black flex-1 min-h-[1.2em]"></div>
              </div>
          </div>
        )}

        <div className="w-[32%] flex flex-col gap-1">
            <div className="flex items-start">
                <span className="w-16 shrink-0 text-right pr-2 font-bold">DATE:</span>
                <div className="border-b border-black flex-1 pl-1">
                    {data.date ? new Date(data.date).toLocaleDateString() : new Date().toLocaleDateString()}
                </div>
            </div>
            {!isCostType && (
                <div className="flex items-start">
                    <span className="w-16 shrink-0 text-right pr-2 font-bold">YEAR:</span>
                    <div className="border-b border-black flex-1 pl-1 break-words min-h-[1.2em]">
                         {data.yearLevel || ""}
                    </div>
                </div>
            )}
            <div className="flex items-start">
                <span className="w-16 shrink-0 text-right pr-2 font-bold">BIS NO.:</span>
                <div className="border-b border-black flex-1 pl-1">
                    {data.bisNumber || "---"}
                </div>
            </div>
        </div>
      </div>

      {/* ITEMS TABLE */}
      <div className="mb-4 min-h-[140px]">
        <table className="w-full text-[11px] border-collapse">
            <thead>
                <tr className="border-t border-b border-black">
                    <th className="py-1 text-left uppercase font-bold pl-1">DESCRIPTION</th>
                    <th className="py-1 text-center w-10 uppercase font-bold border-l border-black">QTY</th>
                    <th className="py-1 text-right w-20 uppercase font-bold pr-1 border-l border-black">
                        {isCostType ? "UNIT COST" : "UNIT PRICE"}
                    </th>
                    <th className="py-1 text-right w-20 uppercase font-bold pr-1 border-l border-black">TOTAL</th>
                </tr>
            </thead>
            <tbody>
                {data.items.map((item, idx) => (
                    <tr key={idx} className="align-top">
                        <td className="py-0.5 pl-1 uppercase font-medium">{item.itemName}</td>
                        <td className="py-0.5 text-center font-mono border-l border-black">
                             {data.type === 'ISSUANCE_RETURN' ? `(${item.qty})` : item.qty}
                        </td>
                        <td className="py-0.5 text-right font-mono pr-1 border-l border-black">{formatCurrency(getUnitVal(item))}</td>
                        <td className="py-0.5 text-right font-mono pr-1 border-l border-black">{formatCurrency(calculateLineTotal(item))}</td>
                    </tr>
                ))}
                {data.items.length < 5 && Array.from({ length: 5 - data.items.length }).map((_, i) => (
                    <tr key={`filler-${i}`}>
                        <td className="py-1">&nbsp;</td>
                        <td className="py-1 border-l border-black">&nbsp;</td>
                        <td className="py-1 border-l border-black">&nbsp;</td>
                        <td className="py-1 border-l border-black">&nbsp;</td>
                    </tr>
                ))}
                <tr className="border-t border-black font-bold">
                    <td className="pt-1 text-right" colSpan="2"></td>
                    <td className="pt-1 text-right pr-1 border-l border-black text-[12px]">TOTAL:</td>
                    <td className="pt-1 text-right pr-1 border-l border-black text-[12px]">
                        <span className="border-b-4 border-double border-black">{formatCurrency(grandTotal)}</span>
                    </td>
                </tr>
            </tbody>
        </table>
      </div>

      {/* FOOTER */}
      <div className="flex justify-between items-end mt-4">
          <div className="w-[38%]">
              <div className="text-[10px] font-bold mb-6">RELEASED BY:</div>
              <div className="border-b border-black w-full text-center font-bold uppercase min-h-[1.2em] leading-tight text-[11px]">
                  {data.releasedBy || ""}
              </div>
          </div>
          <div className="w-[45%] flex flex-col justify-end">
              <p className="text-[9px] italic mb-6 text-left leading-tight">
                  Acknowledging that I have received all items indicated on this list.
              </p>
              <div className="border-b border-black w-full mb-0.5"></div>
              <p className="text-[9px] font-bold uppercase text-center">Signature over printed name</p>
          </div>
      </div>
    </div>
  );

  return (
    <div id={elementId} className="w-full max-w-[800px] mx-auto bg-white flex flex-col">
      {/* TOP: STUDENT / SUPPLIER COPY */}
      <Slip label={isCostType ? "Supplier Copy" : "Student Copy"} />

      {/* CUTTING DIVIDER */}
      <div className="relative w-full border-t border-dashed border-black my-2">
         <span className="absolute left-1/2 -top-2 -translate-x-1/2 bg-white px-2 text-[8px] font-bold text-gray-400">
           CUT HERE
         </span>
      </div>

      {/* BOTTOM: BOOKSTORE COPY */}
      <Slip label="Bookstore Copy" />
    </div>
  );
}