// frontend/tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './contexts/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1E40AF',
        accent:  '#F59E0B',
        neutral: '#F3F4F6',
        info:    '#2563EB',
        success: '#16A34A',
        danger:  '#DC2626',
      },
      fontFamily: {
        sans:    ['Inter',    'sans‑serif'],
        heading: ['Poppins',  'sans‑serif'],
      },
      spacing: {
        72: '18rem',
        84: '21rem',
        96: '24rem',
      },
      borderRadius: {
        lg: '1rem',
        xl: '1.5rem',
      },
      boxShadow: {
        md: '0 4px 8px rgba(0,0,0,0.04)',
        lg: '0 8px 16px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};
