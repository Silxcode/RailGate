/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./admin.html",
        "./js/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: {
                    DEFAULT: '#6366f1', // Indigo 500
                    dark: '#4f46e5',    // Indigo 600
                },
                secondary: '#8b5cf6', // Violet 500
                glass: {
                    100: 'rgba(255, 255, 255, 0.1)',
                    200: 'rgba(255, 255, 255, 0.2)',
                    300: 'rgba(255, 255, 255, 0.3)',
                    900: 'rgba(15, 23, 42, 0.8)', // Slate 900 with opacity
                }
            },
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
            },
            backdropBlur: {
                xs: '2px',
            },
            animation: {
                'wiggle': 'wiggle 200ms ease-in-out',
                'float': 'float 6s ease-in-out infinite',
            },
            keyframes: {
                wiggle: {
                    '0%, 100%': { transform: 'rotate(-3deg)' },
                    '50%': { transform: 'rotate(3deg)' },
                },
                float: {
                    '0%, 100%': { transform: 'translateY(0)' },
                    '50%': { transform: 'translateY(-10px)' },
                }
            }
        },
    },
    plugins: [],
}
