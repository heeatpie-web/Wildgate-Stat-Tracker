/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-mode="dark"]', '[data-mode="twilight"]'],
  theme: {
    fontFamily: {
      sans: ['Inter', 'sans-serif'],
    },
    extend: {
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out forwards',
        'slide-up': 'slideUp 0.3s cubic-bezier(0.2, 0.0, 0, 1.0) forwards',
        'scale-in': 'scaleIn 0.2s ease-out forwards',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { transform: 'translateY(20px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        scaleIn: { '0%': { transform: 'scale(0.9)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
      },
      colors: {
        md: {
          sys: {
            primary: 'var(--md-sys-color-primary)',
            onPrimary: 'var(--md-sys-color-on-primary)',
            primaryContainer: 'var(--md-sys-color-primary-container)',
            onPrimaryContainer: 'var(--md-sys-color-on-primary-container)',
            surface: 'var(--md-sys-color-surface)',
            onSurface: 'var(--md-sys-color-on-surface)',
            surface1: 'var(--md-sys-color-surface-container-low)',
            surface2: 'var(--md-sys-color-surface-container)',
            surface3: 'var(--md-sys-color-surface-container-high)',
            outline: 'var(--md-sys-color-outline)',
            outlineVariant: 'var(--md-sys-color-outline-variant)',
            background: 'var(--md-sys-color-background)',
            onBackground: 'var(--md-sys-color-on-background)',
            error: 'var(--md-sys-color-error)',
            onError: 'var(--md-sys-color-on-error)',
            errorContainer: 'var(--md-sys-color-error-container)',
            onErrorContainer: 'var(--md-sys-color-on-error-container)',
          }
        }
      }
    }
  },
  plugins: [],
}
