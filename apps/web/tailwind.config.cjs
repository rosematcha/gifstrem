module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Style Guide Color Palette
        charcoal: '#0F0F13',
        graphite: '#191923',
        slate: '#262632',
        coolGray: '#A8A8B3',
        dimGray: '#5E5E69',
        violet: '#8B5CF6',
        softViolet: '#A78BFA',
        deepViolet: '#7C3AED',
        coral: '#EF4444',
        emerald: '#22C55E',
        cyan: '#22D3EE',
      },
      fontFamily: {
        sans: ['Open Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'sans-serif'],
        display: ['Fugaz One', 'sans-serif'],
      },
      spacing: {
        'xs': '4px',
        's': '8px',
        'm': '16px',
        'l': '24px',
        'xl': '40px',
        '2xl': '64px',
      },
      borderRadius: {
        'btn': '6px',
        'card': '10px',
        'modal': '12px',
      },
      boxShadow: {
        'low': '0 2px 4px rgba(0, 0, 0, 0.4)',
        'medium': '0 8px 16px rgba(0, 0, 0, 0.5)',
        'high': '0 12px 24px rgba(0, 0, 0, 0.65)',
      },
    },
  },
  plugins: [],
};
