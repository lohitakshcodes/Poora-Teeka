import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        'ink-muted': 'var(--ink-muted)',
        inkMuted: 'var(--ink-muted)',
        surface: 'var(--surface)',
        'surface-sunken': 'var(--surface-sunken)',
        surfaceSunken: 'var(--surface-sunken)',
        border: 'var(--border)',

        brand: 'var(--brand)',
        'brand-soft': 'var(--brand-soft)',
        brandSoft: 'var(--brand-soft)',

        statusScheduled: 'var(--status-scheduled)',
        'status-scheduled': 'var(--status-scheduled)',
        statusDue: 'var(--status-due)',
        'status-due': 'var(--status-due)',
        statusGiven: 'var(--status-given)',
        'status-given': 'var(--status-given)',
        statusMissed: 'var(--status-missed)',
        'status-missed': 'var(--status-missed)',
        statusRecovered: 'var(--status-recovered)',
        'status-recovered': 'var(--status-recovered)',

        urgent: 'var(--urgent)',
        urgentBg: 'var(--urgent-bg)',
        'urgent-bg': 'var(--urgent-bg)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
