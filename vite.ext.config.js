import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// Builds ONLY the extension's poster page into extension/dist.
// The web app build (vite.config.js) is untouched.
export default defineConfig({
	base: './',
	publicDir: false,
	esbuild: {
		target: 'esnext',
	},
	build: {
		target: 'esnext',
		outDir: 'extension/dist',
		emptyOutDir: true,
		rollupOptions: {
			input: resolve(__dirname, 'poster.html'),
		},
	},
	css: {
		postcss: {
			plugins: [
				tailwindcss({
					content: [
						"./poster.html",
						"./src/**/*.{js,ts,jsx,tsx}",
					],
					theme: {
						extend: {
							colors: {
								background: '#f8f9fa',
								sidebar: '#ffffff',
							},
							fontFamily: {
								sans: ['Outfit', 'sans-serif'],
								serif: ['"Playfair Display"', 'serif'],
								mono: ['"Fira Code"', 'monospace'],
								poster: ['Outfit', 'sans-serif'],
							}
						}
					},
				}),
				autoprefixer(),
			],
		},
	}
});
