import React from 'react';
import { ScriptAiModel } from '../../types';

interface AiModelLogoProps {
  model: ScriptAiModel;
  size?: number;
  className?: string;
}

/** Google Gemini 4-color star logo */
const GeminiLogo: React.FC<{ size: number; className?: string }> = ({ size, className }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" className={className}>
    <path
      d="M14 0C14 7.732 7.732 14 0 14c7.732 0 14 6.268 14 14 0-7.732 6.268-14 14-14-7.732 0-14-6.268-14-14Z"
      fill="url(#gemini-grad)"
    />
    <defs>
      <linearGradient id="gemini-grad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
        <stop stopColor="#4285F4" />
        <stop offset="0.33" stopColor="#9B72CB" />
        <stop offset="0.66" stopColor="#D96570" />
        <stop offset="1" stopColor="#D96570" />
      </linearGradient>
    </defs>
  </svg>
);

/** Anthropic Claude logo — simplified mark */
const ClaudeLogo: React.FC<{ size: number; className?: string; variant?: 'sonnet' | 'opus' }> = ({ size, className, variant = 'sonnet' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path
      d="M15.312 3.752L8.384 20.248H12.096L19.024 3.752H15.312Z"
      fill={variant === 'opus' ? '#E8915A' : '#D4A27F'}
    />
    <path
      d="M4.976 20.248H8.688L15.616 3.752H11.904L4.976 20.248Z"
      fill={variant === 'opus' ? '#E8915A' : '#D4A27F'}
    />
  </svg>
);

const AiModelLogo: React.FC<AiModelLogoProps> = ({ model, size = 20, className }) => {
  switch (model) {
    case ScriptAiModel.GEMINI_PRO:
      return <GeminiLogo size={size} className={className} />;
    case ScriptAiModel.CLAUDE_SONNET:
      return <ClaudeLogo size={size} className={className} variant="sonnet" />;
    case ScriptAiModel.CLAUDE_OPUS:
      return <ClaudeLogo size={size} className={className} variant="opus" />;
    default:
      return <span className="text-base">🤖</span>;
  }
};

export default AiModelLogo;
