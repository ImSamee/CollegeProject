/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                'nl-dark': '#0f172a',
                'nl-panel': '#1e293b',
                'nl-accent': '#38bdf8',
                'nl-success': '#10b981',
            }
        },
    },
    plugins: [],
}