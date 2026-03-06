import React from 'react';

interface InstantTooltipProps {
  text: string;
  children: React.ReactNode;
}

/**
 * CSS-only 인스턴트 툴팁 (75ms 전환, 브라우저 기본 500-1000ms 대비 빠름)
 * 모바일에서는 라벨이 항상 표시되므로 툴팁 불필요
 */
const InstantTooltip: React.FC<InstantTooltipProps> = ({ text, children }) => (
  <div className="relative group/tip inline-flex">
    {children}
    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-[10px] font-medium text-white bg-gray-950 border border-gray-700 rounded-md whitespace-nowrap opacity-0 pointer-events-none group-hover/tip:opacity-100 transition-opacity duration-75 z-50">
      {text}
    </span>
  </div>
);

export default InstantTooltip;
