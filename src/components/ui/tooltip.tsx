"use client";

import { useState, ReactNode } from "react";
import { Info } from "lucide-react";

interface TooltipProps {
  content: string;
  children?: ReactNode;
  icon?: boolean;
  className?: string;
}

export function Tooltip({ content, children, icon = false, className = "" }: TooltipProps) {
  const [show, setShow] = useState(false);

  return (
    <span
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {icon && <Info className="ml-1 h-3 w-3 text-slate-400" />}
      {show && (
        <span className="no-print absolute bottom-full left-1/2 z-50 mb-1.5 w-56 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-600 shadow-lg">
          {content}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-200" />
        </span>
      )}
    </span>
  );
}
