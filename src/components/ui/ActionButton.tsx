import React from 'react';
import InstantTooltip from './InstantTooltip';

// 액션별 컬러 맵
const COLOR_MAP: Record<string, { bg: string; text: string; border: string; hover: string }> = {
  orange:  { bg: 'bg-orange-600/15', text: 'text-orange-300', border: 'border-orange-500/30', hover: 'hover:bg-orange-600/30' },
  violet:  { bg: 'bg-violet-600/15', text: 'text-violet-300', border: 'border-violet-500/30', hover: 'hover:bg-violet-600/30' },
  pink:    { bg: 'bg-pink-600/15',   text: 'text-pink-300',   border: 'border-pink-500/30',   hover: 'hover:bg-pink-600/30' },
  blue:    { bg: 'bg-blue-600/15',   text: 'text-blue-300',   border: 'border-blue-500/30',   hover: 'hover:bg-blue-600/30' },
  green:   { bg: 'bg-green-600/15',  text: 'text-green-300',  border: 'border-green-500/30',  hover: 'hover:bg-green-600/30' },
  gray:    { bg: 'bg-gray-700/40',   text: 'text-gray-300',   border: 'border-gray-600/50',   hover: 'hover:bg-gray-700/60' },
  red:     { bg: 'bg-red-600/15',    text: 'text-red-300',    border: 'border-red-500/30',    hover: 'hover:bg-red-600/30' },
  fuchsia: { bg: 'bg-fuchsia-600/15', text: 'text-fuchsia-300', border: 'border-fuchsia-500/30', hover: 'hover:bg-fuchsia-600/30' },
};

interface ActionButtonProps {
  label: string;
  tooltip?: string;
  color: keyof typeof COLOR_MAP;
  icon?: React.ReactNode;
  disabled?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  compact?: boolean; // true: 그리드용 작은 사이즈
  className?: string;
}

/**
 * 아이콘+라벨+컬러 표준 액션 버튼
 * compact 모드: h-6 px-1.5 text-[10px] (그리드 카드용)
 * standard 모드: h-7 px-2.5 text-xs (리스트 카드용)
 */
const ActionButton: React.FC<ActionButtonProps> = ({
  label, tooltip, color, icon, disabled, onClick, compact, className = '',
}) => {
  const c = COLOR_MAP[color] || COLOR_MAP.gray;
  const sizeClass = compact
    ? 'h-6 px-1.5 rounded-md text-[10px]'
    : 'h-7 px-2.5 rounded-lg text-xs';

  const btn = (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1 font-bold border whitespace-nowrap ${c.bg} ${c.text} ${c.border} ${c.hover} disabled:opacity-30 disabled:cursor-not-allowed transition-all ${sizeClass} ${className}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  if (tooltip) {
    return <InstantTooltip text={tooltip}>{btn}</InstantTooltip>;
  }

  return btn;
};

export default ActionButton;
