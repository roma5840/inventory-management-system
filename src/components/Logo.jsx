export function Logo({ className = "w-12 h-12" }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 200 200" 
      className={className}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="circleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{stopColor:'#1e3a8a', stopOpacity:1}} />
          <stop offset="100%" style={{stopColor:'#1e40af', stopOpacity:1}} />
        </linearGradient>
      </defs>
      
      {/* Outer circle */}
      <circle cx="100" cy="100" r="90" fill="url(#circleGrad)"/>
      <circle cx="100" cy="100" r="87" fill="none" stroke="#3b82f6" strokeWidth="1" opacity="0.5"/>
      
      {/* Inner circle (white background for icon) */}
      <circle cx="100" cy="100" r="70" fill="white"/>
      <circle cx="100" cy="100" r="68" fill="none" stroke="#e5e7eb" strokeWidth="2"/>
      
      {/* Book icon (center) */}
      <rect x="80" y="80" width="40" height="50" fill="#1e40af" rx="2"/>
      <rect x="82" y="82" width="36" height="46" fill="#3b82f6" rx="1"/>
      <line x1="100" y1="80" x2="100" y2="130" stroke="#1e40af" strokeWidth="2.5"/>
      
      {/* Book pages detail */}
      <line x1="87" y1="92" x2="113" y2="92" stroke="#dbeafe" strokeWidth="1" opacity="0.7"/>
      <line x1="87" y1="100" x2="110" y2="100" stroke="#dbeafe" strokeWidth="1" opacity="0.7"/>
      <line x1="87" y1="108" x2="113" y2="108" stroke="#dbeafe" strokeWidth="1" opacity="0.7"/>
      <line x1="87" y1="116" x2="108" y2="116" stroke="#dbeafe" strokeWidth="1" opacity="0.7"/>
      
      {/* Rising graph overlay (top right of book) */}
      <polyline points="105,95 110,90 115,85 120,78" 
                fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="105" cy="95" r="2.5" fill="#10b981"/>
      <circle cx="110" cy="90" r="2.5" fill="#10b981"/>
      <circle cx="115" cy="85" r="2.5" fill="#10b981"/>
      <circle cx="120" cy="78" r="3" fill="#10b981"/>
      
      {/* Text around circle (top) */}
      <path id="topArc" d="M 40 100 A 60 60 0 0 1 160 100" fill="none"/>
      <text fontFamily="Arial, sans-serif" fontSize="14" fontWeight="bold" fill="#3b82f6" letterSpacing="2">
        <textPath href="#topArc" startOffset="50%" textAnchor="middle">
          INVENTORY SYSTEM
        </textPath>
      </text>
      
      {/* Decorative elements (bottom arc) */}
      <circle cx="65" cy="125" r="3.5" fill="#fbbf24"/>
      <circle cx="75" cy="130" r="3.5" fill="#fbbf24"/>
      <circle cx="85" cy="133" r="3.5" fill="#fbbf24"/>
      <circle cx="115" cy="133" r="3.5" fill="#fbbf24"/>
      <circle cx="125" cy="130" r="3.5" fill="#fbbf24"/>
      <circle cx="135" cy="125" r="3.5" fill="#fbbf24"/>
    </svg>
  );
}