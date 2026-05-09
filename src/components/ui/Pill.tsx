import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../utils/i18n';

// ────────────────────────────
// 計算式のシンタックスハイライト
// ────────────────────────────
export function SyntaxHighlightedFormula({ formula }: { formula: string }) {
  if (!formula) return null;

  const paramLabel = t('nav.datasources');
  const tokenRegex = new RegExp(`(".*?"|'.*?'|\\[${paramLabel}\\]\\.\\[[^\\]]+\\]|\\[[^\\]]+\\]|\\b(?:IF|THEN|ELSE|ELSEIF|END|CASE|WHEN|AND|OR|NOT)\\b|\\b[A-Z_]+\\b(?=\\s*\\())`, 'gi');
  const lines = formula.split('\n');

  return (
    <div className="font-mono text-[11px] leading-relaxed text-left bg-slate-50 rounded-lg border border-slate-200 overflow-hidden shadow-inner">
      <table className="border-collapse w-full">
        <tbody>
          {lines.map((line, lineIdx) => {
            const parts = line.split(tokenRegex);
            return (
              <tr key={lineIdx} className="hover:bg-slate-100/50 transition-colors">
                <td className="w-8 select-none text-right pr-3 text-slate-300 border-r border-slate-100 bg-slate-50/50 py-0.5 text-[10px]">
                  {lineIdx + 1}
                </td>
                <td className="pl-3 pr-10 py-1 whitespace-pre-wrap break-all text-[11px]">
                  {parts.map((part, i) => {
                    if (!part) return null;
                    if (part.startsWith('"') || part.startsWith("'")) return <span key={i} className="text-slate-400">{part}</span>;
                    if (part.startsWith(`[${paramLabel}].`)) return <span key={i} className="text-purple-500">{part}</span>;
                    if (part.startsWith('[')) return <span key={i} className="text-orange-400 font-semibold">{part}</span>;
                    if (/^(IF|THEN|ELSE|ELSEIF|END|CASE|WHEN|AND|OR|NOT)$/i.test(part)) return <span key={i} className="font-bold text-slate-800">{part.toUpperCase()}</span>;
                    if (/^[A-Z_]+$/i.test(part)) return <span key={i} className="text-blue-600">{part.toUpperCase()}</span>;
                    return <span key={i} className="text-slate-600">{part}</span>;
                  })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ────────────────────────────
// ポータルツールチップ (見切れ防止用)
// ────────────────────────────
interface PortalTooltipProps {
  anchorRect: DOMRect;
  title: string;
  formula?: string;
  physicalName: string;
}

function PortalTooltip({ anchorRect, title, formula, physicalName }: PortalTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, isBelow: false });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!tooltipRef.current) return;
    
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    
    let top = anchorRect.top - tooltipRect.height - 8;
    let isBelow = false;
    
    if (top < 10) {
      top = anchorRect.bottom + 8;
      isBelow = true;
    }
    
    if (isBelow && top + tooltipRect.height > viewportHeight - 10) {
      top = viewportHeight - tooltipRect.height - 10;
    }

    let left = anchorRect.left;
    if (left + tooltipRect.width > viewportWidth - 20) {
      left = viewportWidth - tooltipRect.width - 20;
    }
    if (left < 10) left = 10;

    setPosition({ top, left, isBelow });
    setReady(true);
  }, [anchorRect]);

  return createPortal(
    <div 
      ref={tooltipRef}
      style={{ 
        top: position.top, 
        left: position.left,
        opacity: ready ? 1 : 0,
        visibility: ready ? 'visible' : 'hidden',
        transition: 'opacity 0.15s ease-out'
      }}
      className="fixed z-[9999] pointer-events-none"
    >
      <div className={`w-max max-w-lg p-4 bg-white border border-slate-200 shadow-2xl rounded-xl text-slate-800 ring-1 ring-black/5`}>
        <p className="text-[10px] font-bold text-slate-400 mb-2 border-b border-slate-100 pb-1 uppercase tracking-wider">
          {title}
        </p>
        {formula ? (
          <SyntaxHighlightedFormula formula={formula} />
        ) : (
          <div className="px-3 py-2 bg-slate-900 text-white rounded-lg text-[10px] font-mono">
            {t('detail.physical_name')}: {physicalName}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ────────────────────────────
// ピル部品
// ────────────────────────────
interface PillProps {
  name: string;
  caption?: string;
  isCalc?: boolean;
  isContinuous?: boolean;
  dataType?: string;
  formula?: string;
  isActive?: boolean;
  onClick?: () => void;
}

export function Pill({ name, caption, isCalc, isContinuous, dataType, formula, isActive, onClick }: PillProps) {
  const [hovered, setHovered] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const handleMouseEnter = (e: React.MouseEvent) => {
    setAnchorRect(e.currentTarget.getBoundingClientRect());
    setHovered(true);
  };

  const handleMouseLeave = () => {
    setHovered(false);
  };

  return (
    <div 
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={`pill-container relative inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold shadow-sm text-white transition-all z-0 
        ${onClick ? 'cursor-pointer hover:brightness-110 active:scale-95' : 'cursor-default'}
        ${isActive ? 'ring-4 ring-offset-2 ring-yellow-400 scale-105 shadow-xl animate-pulse brightness-110' : ''}
      `} 
      style={{ backgroundColor: isContinuous ? '#10b981' : '#0284c7' }}
    >
      <div className="flex items-center gap-0.5 opacity-80 font-mono text-[9px] leading-none shrink-0">
        {isCalc && <span className="font-bold text-[11px] mr-0.5">=</span>}
        {(() => {
          const type = dataType?.toLowerCase();
          if (type === 'string') return <span>Abc</span>;
          if (type === 'integer' || type === 'real') return <span>#</span>;
          if (type === 'date' || type === 'datetime') {
            return (
              <svg size={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
            );
          }
          if (type === 'boolean') return <span className="font-bold">T|F</span>;
          if (type === 'spatial') {
            return (
              <svg size={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
            );
          }
          return isContinuous ? <span>#</span> : <span>Abc</span>;
        })()}
      </div>
      <span className="truncate max-w-[180px] leading-tight">{caption || name}</span>

      {hovered && anchorRect && (
        <PortalTooltip 
          anchorRect={anchorRect}
          title={caption || name}
          formula={formula}
          physicalName={name}
        />
      )}
    </div>
  );
}
