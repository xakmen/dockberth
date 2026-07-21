// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://dockberth.dev',
	integrations: [
		starlight({
			title: 'Dockberth',
			description:
				'Local dev environments on Windows. Pick a preset, press Start, open myapp.test.',
			logo: { src: './src/assets/icon.svg', alt: 'Dockberth' },
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/xakmen/dockberth' },
			],
			customCss: [
				'@fontsource/inter/400.css',
				'@fontsource/inter/500.css',
				'@fontsource/inter/600.css',
				'@fontsource/inter/700.css',
				'@fontsource/jetbrains-mono/400.css',
				'@fontsource/jetbrains-mono/600.css',
				'./src/styles/brand.css',
				'./src/styles/starlight.css',
			],
			components: {
				// The site is dark-only to match the app; both overrides live in src/components/.
				ThemeProvider: './src/components/ThemeProvider.astro',
				ThemeSelect: './src/components/ThemeSelect.astro',
			},
			sidebar: [
				{ label: 'Getting Started', items: [{ autogenerate: { directory: 'getting-started' } }] },
				{ label: 'Guides', items: [{ autogenerate: { directory: 'guides' } }] },
				{ label: 'Reference', items: [{ autogenerate: { directory: 'reference' } }] },
				{ label: 'Changelog', link: '/changelog/' },
			],
			editLink: { baseUrl: 'https://github.com/xakmen/dockberth/edit/main/site/' },
		}),
	],
});
