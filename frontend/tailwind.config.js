// frontend/tailwind.config.js - COM CSS VARIABLES DINÂMICAS
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
        // ✅ CORES DINÂMICAS USANDO CSS VARIABLES
        accent: 'var(--color-primary, #f59e0b)', // Fallback para âmbar
        'accent-hover': 'var(--color-primary-hover, #e08c07)',
        'accent-light': 'var(--color-primary-light, #fbbf24)',
        'accent-dark': 'var(--color-primary-dark, #d97706)',
        // Cores estáticas mantidas
        neutral: '#F3F4F6',
        info: '#2563EB',
        success: '#16A34A',
        danger: '#DC2626',
      },
      fontFamily: {
        sans: ['Inter', 'sans‑serif'],
        heading: ['Poppins', 'sans‑serif'],
      },
      spacing: {
        72: '18rem',
        84: '21rem',
        96: '24rem',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '1rem',
      },
      boxShadow: {
        md: '0 4px 8px rgba(0,0,0,0.04)',
        lg: '0 8px 16px rgba(0,0,0,0.06)',
      },
      // ✅ ANIMAÇÕES PARA TRANSIÇÕES SUAVES
      animation: {
        'fadeIn': 'fadeIn 0.2s ease-in-out',
        'slideIn': 'slideIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateX(-8px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
  ],
};