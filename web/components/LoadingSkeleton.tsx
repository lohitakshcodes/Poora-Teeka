import React from 'react';

interface LoadingSkeletonProps {
  variant?: 'dose-card' | 'vial-card' | 'metric-card' | 'row' | 'plan-slot' | 'text';
  count?: number;
  className?: string;
}

export function LoadingSkeleton({
  variant = 'dose-card',
  count = 1,
  className = '',
}: LoadingSkeletonProps) {
  const items = Array.from({ length: count });

  return (
    <div className={`space-y-3 ${className}`} aria-busy="true" aria-label="Loading content">
      {items.map((_, idx) => {
        if (variant === 'dose-card') {
          return (
            <div
              key={idx}
              className="bg-surface border border-border rounded-xl p-5 shadow-xs animate-pulse flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-2.5 flex-1">
                <div className="flex items-center gap-3">
                  <div className="h-5 w-40 bg-slate-200 rounded" />
                  <div className="h-5 w-20 bg-slate-200 rounded-full" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3.5 w-24 bg-slate-150 bg-slate-200 rounded" />
                  <div className="h-3.5 w-32 bg-slate-200 rounded" />
                  <div className="h-3.5 w-28 bg-slate-200 rounded" />
                </div>
              </div>
              <div className="h-9 w-28 bg-slate-200 rounded-lg shrink-0 self-end sm:self-center" />
            </div>
          );
        }

        if (variant === 'vial-card') {
          return (
            <div
              key={idx}
              className="bg-surface border border-border rounded-xl p-5 shadow-xs animate-pulse space-y-4"
            >
              <div className="flex justify-between items-center pb-3 border-b border-border">
                <div className="space-y-1.5">
                  <div className="h-5 w-32 bg-slate-200 rounded" />
                  <div className="h-3 w-48 bg-slate-200 rounded" />
                </div>
                <div className="h-7 w-24 bg-slate-200 rounded" />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <div className="h-3 w-28 bg-slate-200 rounded" />
                  <div className="h-3 w-20 bg-slate-200 rounded" />
                </div>
                <div className="h-4 w-full bg-slate-200 rounded-sm" />
              </div>
            </div>
          );
        }

        if (variant === 'metric-card') {
          return (
            <div
              key={idx}
              className="bg-surface border border-border rounded-xl p-5 shadow-xs animate-pulse space-y-3"
            >
              <div className="h-3.5 w-28 bg-slate-200 rounded" />
              <div className="h-8 w-20 bg-slate-200 rounded" />
              <div className="h-3 w-36 bg-slate-200 rounded" />
            </div>
          );
        }

        if (variant === 'plan-slot') {
          return (
            <div
              key={idx}
              className="bg-surface border border-border rounded-xl p-5 shadow-xs animate-pulse space-y-3"
            >
              <div className="flex justify-between items-center pb-2.5 border-b border-border">
                <div className="h-5 w-32 bg-slate-200 rounded" />
                <div className="h-4 w-20 bg-slate-200 rounded" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="h-12 bg-slate-200 rounded-lg" />
                <div className="h-12 bg-slate-200 rounded-lg" />
                <div className="h-12 bg-slate-200 rounded-lg" />
              </div>
            </div>
          );
        }

        if (variant === 'row') {
          return (
            <div
              key={idx}
              className="h-12 w-full bg-slate-200 rounded-lg animate-pulse"
            />
          );
        }

        // Default 'text'
        return (
          <div key={idx} className="space-y-2 animate-pulse">
            <div className="h-4 w-3/4 bg-slate-200 rounded" />
            <div className="h-4 w-1/2 bg-slate-200 rounded" />
          </div>
        );
      })}
    </div>
  );
}
