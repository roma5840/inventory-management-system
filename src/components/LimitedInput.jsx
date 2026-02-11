import React from 'react';

export default function LimitedInput({ 
    value, 
    onChange, 
    maxLength, 
    showCounter = false, 
    as = "input", 
    type = "text",
    className = "", 
    ...props 
}) {
    const Component = as;
    const isNumber = type === "number";

    // Handler to enforce length on number inputs (which ignore maxLength attribute)
    const handleInput = (e) => {
        if (isNumber && maxLength && e.target.value.length > maxLength) {
            e.target.value = e.target.value.slice(0, maxLength);
            // Trigger onChange manually if necessary, though React usually handles the controlled value
        }
    };

    return (
        <div className="w-full relative">
            <Component
                type={type}
                className={className}
                value={value}
                onChange={onChange}
                maxLength={!isNumber ? maxLength : undefined}
                onInput={handleInput}
                {...props}
            />
            {showCounter && (
                <div className={`text-[10px] text-slate-400 text-right mt-1 font-mono leading-none ${maxLength && String(value).length >= maxLength ? 'text-red-500 font-bold' : ''}`}>
                    {String(value || "").length}/{maxLength}
                </div>
            )}
        </div>
    );
}