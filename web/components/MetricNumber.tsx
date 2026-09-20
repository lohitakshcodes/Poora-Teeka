'use client';

import React, { useEffect, useState, useRef } from 'react';

interface MetricNumberProps {
  value: number;
  durationMs?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function MetricNumber({
  value,
  durationMs = 600,
  prefix = '',
  suffix = '',
  decimals = 0,
  className = '',
  style,
}: MetricNumberProps) {
  const [displayValue, setDisplayValue] = useState<number>(0);
  const startTimestampRef = useRef<number | null>(null);
  const startValRef = useRef<number>(0);
  const targetValRef = useRef<number>(value);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    targetValRef.current = value;
    startValRef.current = displayValue;
    startTimestampRef.current = null;

    const step = (timestamp: number) => {
      if (startTimestampRef.current === null) {
        startTimestampRef.current = timestamp;
      }

      const elapsed = timestamp - startTimestampRef.current;
      const rawProgress = Math.min(elapsed / durationMs, 1);
      // Cubic ease-out: starts fast, lands smoothly
      const progress = 1 - Math.pow(1 - rawProgress, 3);

      const current = startValRef.current + (targetValRef.current - startValRef.current) * progress;
      setDisplayValue(current);

      if (rawProgress < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
      } else {
        setDisplayValue(targetValRef.current);
      }
    };

    animationFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [value, durationMs]);

  const formatted = decimals > 0 ? displayValue.toFixed(decimals) : Math.round(displayValue).toString();

  return (
    <span className={className ? className : 'font-mono font-bold tracking-tight'} style={style}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
