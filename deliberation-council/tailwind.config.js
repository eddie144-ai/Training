/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        obsidian: '#050507',
        charcoal: '#0F0F12',
        slate: { matte: '#18181C', edge: '#27272A' },
        cream: '#F4F4F5',
        muted: '#71717A',
        seat: {
          cyan: '#06B6D4',
          crimson: '#EF4444',
          amber: '#F59E0B',
          emerald: '#10B981',
        },
      },
    },
  },
  plugins: [],
};
