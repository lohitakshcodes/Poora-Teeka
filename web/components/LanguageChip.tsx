'use client';

import React from 'react';

export type SupportedLanguage = 'en' | 'hi' | 'mr';

interface LanguageChipProps {
  activeLang: SupportedLanguage;
  onChangeLang: (lang: SupportedLanguage) => void;
  className?: string;
}

export function LanguageChip({
  activeLang,
  onChangeLang,
  className = '',
}: LanguageChipProps) {
  const languages: { id: SupportedLanguage; label: string; script: string }[] = [
    { id: 'en', label: 'English', script: 'EN' },
    { id: 'hi', label: 'हिन्दी', script: 'HI' },
    { id: 'mr', label: 'मराठी', script: 'MR' },
  ];

  return (
    <div
      className={`inline-flex items-center p-1 bg-surface border border-border rounded-full shadow-xs gap-1 ${className}`}
      role="radiogroup"
      aria-label="Language selection"
    >
      {languages.map((lang) => {
        const isActive = activeLang === lang.id;
        return (
          <button
            key={lang.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChangeLang(lang.id)}
            className={`px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer ${
              isActive
                ? 'bg-brand text-white shadow-xs font-bold'
                : 'text-ink-muted hover:text-ink hover:bg-surfaceSunken'
            }`}
          >
            <span>{lang.label}</span>
          </button>
        );
      })}
    </div>
  );
}
