/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['class', '[data-mode="dark"]', '[data-mode="twilight"]'],
  theme: {
    fontFamily: {
      sans: ['Inter', 'Roboto', 'sans-serif'],
    },
    extend: {
      fontSize: {
        'label-xs': ['9px', { lineHeight: '12px', letterSpacing: '0.02em', fontWeight: '600' }],
        'label-sm': ['11px', { lineHeight: '16px', letterSpacing: '0.01em', fontWeight: '600' }],
        'body':     ['13px', { lineHeight: '18px', letterSpacing: '0',      fontWeight: '400' }],
        'title':    ['15px', { lineHeight: '20px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'heading':  ['20px', { lineHeight: '26px', letterSpacing: '-0.02em', fontWeight: '800' }],
      },
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
      borderRadius: {
        modal: 'var(--md-sys-shape-corner-large)',    // 16px – modals/dialogs
        card: 'var(--md-sys-shape-corner-medium)',     // 12px – cards/sections
        control: 'var(--md-sys-shape-corner-small)',   // 8px  – buttons/inputs
        pill: 'var(--md-sys-shape-corner-full)',       // 9999px – badges/pills
      },
      colors: {
        status: {
          success: 'var(--color-success)',
          warning: 'var(--color-warning)',
          danger: 'var(--color-danger)',
          info: 'var(--color-info)',
          accent: 'var(--color-accent)',
        },
        md: {
          sys: {
            primary: 'var(--md-sys-color-primary)',
            onPrimary: 'var(--md-sys-color-on-primary)',
            primaryContainer: 'var(--md-sys-color-primary-container)',
            onPrimaryContainer: 'var(--md-sys-color-on-primary-container)',
            secondary: 'var(--md-sys-color-secondary)',
            onSecondary: 'var(--md-sys-color-on-secondary)',
            secondaryContainer: 'var(--md-sys-color-secondary-container)',
            onSecondaryContainer: 'var(--md-sys-color-on-secondary-container)',
            tertiary: 'var(--md-sys-color-tertiary)',
            onTertiary: 'var(--md-sys-color-on-tertiary)',
            tertiaryContainer: 'var(--md-sys-color-tertiary-container)',
            onTertiaryContainer: 'var(--md-sys-color-on-tertiary-container)',
            surface: 'var(--md-sys-color-surface)',
            onSurface: 'var(--md-sys-color-on-surface)',
            surfaceVariant: 'var(--md-sys-color-surface-variant)',
            onSurfaceVariant: 'var(--md-sys-color-on-surface-variant)',
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
