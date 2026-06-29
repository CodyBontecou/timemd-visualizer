export type TimeMdColorScheme =
	| 'theme'
	| 'time-md'
	| 'monochrome'
	| 'warm-console'
	| 'graphite-violet'
	| 'system'
	| 'editor-dark'
	| 'midnight'
	| 'daybreak';

export interface TimeMdThemePreset {
	id: TimeMdColorScheme;
	label: string;
	description: string;
	light: TimeMdThemeTokens;
	dark: TimeMdThemeTokens;
}

interface TimeMdThemeTokens {
	background: string;
	surface: string;
	surfaceAlt: string;
	neutralSurface: string;
	border: string;
	borderStrong: string;
	accent: string;
	accentHover: string;
	accentMuted: string;
	textPrimary: string;
	textSecondary: string;
	textTertiary: string;
	danger: string;
	warning: string;
	positive: string;
	appColors: string[];
	heatmapGradient: string[];
}

type Pair = [string, string];

interface PresetPairs {
	id: Exclude<TimeMdColorScheme, 'theme'>;
	label: string;
	description: string;
	background: Pair;
	surface: Pair;
	surfaceAlt: Pair;
	neutralSurface: Pair;
	border: Pair;
	borderStrong: Pair;
	accent: Pair;
	accentHover: Pair;
	accentMuted: Pair;
	textPrimary: Pair;
	textSecondary: Pair;
	textTertiary: Pair;
	danger: Pair;
	warning: Pair;
	positive: Pair;
	appColors: Pair[];
	heatmapGradient: Pair[];
}

function pair(light: string, dark: string): Pair {
	return [light, dark];
}

function tokens(source: PresetPairs, index: 0 | 1): TimeMdThemeTokens {
	return {
		background: source.background[index],
		surface: source.surface[index],
		surfaceAlt: source.surfaceAlt[index],
		neutralSurface: source.neutralSurface[index],
		border: source.border[index],
		borderStrong: source.borderStrong[index],
		accent: source.accent[index],
		accentHover: source.accentHover[index],
		accentMuted: source.accentMuted[index],
		textPrimary: source.textPrimary[index],
		textSecondary: source.textSecondary[index],
		textTertiary: source.textTertiary[index],
		danger: source.danger[index],
		warning: source.warning[index],
		positive: source.positive[index],
		appColors: source.appColors.map((item) => item[index]),
		heatmapGradient: source.heatmapGradient.map((item) => item[index]),
	};
}

const PRESET_PAIRS: PresetPairs[] = [
	{
		id: 'time-md',
		label: 'time.md',
		description: 'The original Geist-inspired blue system from the macOS app.',
		background: pair('#ffffff', '#000000'),
		surface: pair('#ffffff', '#000000'),
		surfaceAlt: pair('#fafafa', '#1a1a1a'),
		neutralSurface: pair('#f2f2f2', '#1a1a1a'),
		border: pair('#00000014', '#ffffff24'),
		borderStrong: pair('#00000036', '#ffffff3d'),
		accent: pair('#006bff', '#006efe'),
		accentHover: pair('#0059ec', '#005be7'),
		accentMuted: pair('#e9f4ff', '#06193a'),
		textPrimary: pair('#171717', '#ededed'),
		textSecondary: pair('#4d4d4d', '#a0a0a0'),
		textTertiary: pair('#8f8f8f', '#8f8f8f'),
		danger: pair('#ea001d', '#e2162a'),
		warning: pair('#ff9300', '#ff9300'),
		positive: pair('#28a948', '#00ac3a'),
		appColors: [
			pair('#006bff', '#47a8ff'), pair('#28a948', '#00ca50'), pair('#00ac96', '#00cfb7'),
			pair('#ffae00', '#ffae00'), pair('#a000f8', '#c472fb'), pair('#f22782', '#ff4d8d'),
			pair('#fc0035', '#ff565f'), pair('#0059ec', '#0090ff'), pair('#279141', '#009432'),
			pair('#00927f', '#00927f'), pair('#aa4d00', '#ed9a00'), pair('#8500d1', '#9440d5'),
		],
		heatmapGradient: [pair('#f2f2f2', '#1a1a1a'), pair('#e9f4ff', '#022248'), pair('#cae7ff', '#003674'), pair('#94ccff', '#00418b'), pair('#48aeff', '#0090ff'), pair('#006bff', '#006efe'), pair('#002359', '#eaf6ff')],
	},
	{
		id: 'monochrome',
		label: 'Monochrome',
		description: 'Strict black, white, and graphite neutrals.',
		background: pair('#ffffff', '#050505'), surface: pair('#ffffff', '#0b0b0b'), surfaceAlt: pair('#f6f6f6', '#151515'), neutralSurface: pair('#eeeeee', '#1f1f1f'), border: pair('#00000018', '#ffffff1f'), borderStrong: pair('#00000044', '#ffffff45'), accent: pair('#111111', '#5f5f5f'), accentHover: pair('#333333', '#777777'), accentMuted: pair('#ededed', '#222222'), textPrimary: pair('#111111', '#f2f2f2'), textSecondary: pair('#444444', '#b8b8b8'), textTertiary: pair('#777777', '#838383'), danger: pair('#5f0000', '#ff6b6b'), warning: pair('#686000', '#d7cd7b'), positive: pair('#176a2f', '#86d49a'),
		appColors: [pair('#111111', '#f5f5f5'), pair('#3a3a3a', '#d8d8d8'), pair('#5a5a5a', '#bfbfbf'), pair('#777777', '#a8a8a8'), pair('#2a2a2a', '#e7e7e7'), pair('#4b4b4b', '#cfcfcf'), pair('#666666', '#b5b5b5'), pair('#858585', '#969696'), pair('#242424', '#eeeeee'), pair('#545454', '#c5c5c5'), pair('#707070', '#adadad'), pair('#999999', '#7c7c7c')],
		heatmapGradient: [pair('#f2f2f2', '#161616'), pair('#e0e0e0', '#2c2c2c'), pair('#c7c7c7', '#484848'), pair('#9e9e9e', '#6b6b6b'), pair('#747474', '#9b9b9b'), pair('#454545', '#c7c7c7'), pair('#111111', '#f5f5f5')],
	},
	{
		id: 'warm-console',
		label: 'Warm Console',
		description: 'Warm industrial panels with red-orange controls.',
		background: pair('#f3f0e7', '#f3f0e7'), surface: pair('#fbf8ef', '#fbf8ef'), surfaceAlt: pair('#ebe5d6', '#ebe5d6'), neutralSurface: pair('#e4dcc8', '#e4dcc8'), border: pair('#1414142e', '#1414142e'), borderStrong: pair('#14141466', '#14141466'), accent: pair('#e64218', '#e64218'), accentHover: pair('#bf3311', '#bf3311'), accentMuted: pair('#ffe0d2', '#ffe0d2'), textPrimary: pair('#171410', '#171410'), textSecondary: pair('#4d473e', '#4d473e'), textTertiary: pair('#7f7768', '#7f7768'), danger: pair('#d21d00', '#d21d00'), warning: pair('#f0a000', '#f0a000'), positive: pair('#1f8d50', '#1f8d50'),
		appColors: [pair('#e64218', '#e64218'), pair('#f0a000', '#f0a000'), pair('#1f8d50', '#1f8d50'), pair('#007f8f', '#007f8f'), pair('#2359a3', '#2359a3'), pair('#8d3f7f', '#8d3f7f'), pair('#151515', '#151515'), pair('#b86100', '#b86100'), pair('#62805f', '#62805f'), pair('#5b6f8f', '#5b6f8f'), pair('#a33b24', '#a33b24'), pair('#77705f', '#77705f')],
		heatmapGradient: [pair('#ebe5d6', '#ebe5d6'), pair('#fff0bd', '#fff0bd'), pair('#ffd17d', '#ffd17d'), pair('#ffab55', '#ffab55'), pair('#f47643', '#f47643'), pair('#e64218', '#e64218'), pair('#5c1b0c', '#5c1b0c')],
	},
	{
		id: 'graphite-violet',
		label: 'Graphite Violet',
		description: 'Charcoal notes-app surfaces with violet highlights.',
		background: pair('#19191f', '#19191f'), surface: pair('#202027', '#202027'), surfaceAlt: pair('#262631', '#262631'), neutralSurface: pair('#2d2d39', '#2d2d39'), border: pair('#ffffff1c', '#ffffff1c'), borderStrong: pair('#ffffff38', '#ffffff38'), accent: pair('#8f6df6', '#8f6df6'), accentHover: pair('#a98cff', '#a98cff'), accentMuted: pair('#2f234f', '#2f234f'), textPrimary: pair('#e8e3f0', '#e8e3f0'), textSecondary: pair('#b9b0c7', '#b9b0c7'), textTertiary: pair('#8f879b', '#8f879b'), danger: pair('#ff5f78', '#ff5f78'), warning: pair('#d9a441', '#d9a441'), positive: pair('#74c48f', '#74c48f'),
		appColors: [pair('#8f6df6', '#8f6df6'), pair('#5eb6f7', '#5eb6f7'), pair('#74c48f', '#74c48f'), pair('#d9a441', '#d9a441'), pair('#ff7ac6', '#ff7ac6'), pair('#ff5f78', '#ff5f78'), pair('#55d6be', '#55d6be'), pair('#c49bff', '#c49bff'), pair('#7aa2f7', '#7aa2f7'), pair('#9ece6a', '#9ece6a'), pair('#e0af68', '#e0af68'), pair('#bb9af7', '#bb9af7')],
		heatmapGradient: [pair('#252530', '#252530'), pair('#2f234f', '#2f234f'), pair('#3d2d66', '#3d2d66'), pair('#553b8f', '#553b8f'), pair('#7450c5', '#7450c5'), pair('#8f6df6', '#8f6df6'), pair('#e8e3f0', '#e8e3f0')],
	},
	{
		id: 'system',
		label: 'System',
		description: 'Polished platform grays with blue emphasis.',
		background: pair('#f5f5f7', '#1c1c1e'), surface: pair('#ffffff', '#2c2c2e'), surfaceAlt: pair('#f2f2f7', '#3a3a3c'), neutralSurface: pair('#e9e9ee', '#3a3a3c'), border: pair('#00000016', '#ffffff22'), borderStrong: pair('#00000030', '#ffffff3a'), accent: pair('#007aff', '#0a84ff'), accentHover: pair('#0067d8', '#409cff'), accentMuted: pair('#e5f1ff', '#0b2945'), textPrimary: pair('#1d1d1f', '#f5f5f7'), textSecondary: pair('#515154', '#c7c7cc'), textTertiary: pair('#86868b', '#8e8e93'), danger: pair('#ff3b30', '#ff453a'), warning: pair('#ff9500', '#ff9f0a'), positive: pair('#34c759', '#30d158'),
		appColors: [pair('#007aff', '#0a84ff'), pair('#34c759', '#30d158'), pair('#5ac8fa', '#64d2ff'), pair('#ff9500', '#ff9f0a'), pair('#af52de', '#bf5af2'), pair('#ff2d55', '#ff375f'), pair('#ff3b30', '#ff453a'), pair('#5856d6', '#5e5ce6'), pair('#00c7be', '#66d4cf'), pair('#ffcc00', '#ffd60a'), pair('#a2845e', '#ac8e68'), pair('#8e8e93', '#8e8e93')],
		heatmapGradient: [pair('#e9e9ee', '#2c2c2e'), pair('#e5f1ff', '#0b2945'), pair('#c9e4ff', '#123d66'), pair('#94caff', '#185a91'), pair('#4aa3ff', '#0a84ff'), pair('#007aff', '#409cff'), pair('#003e83', '#d8ecff')],
	},
	{
		id: 'editor-dark',
		label: 'Editor Dark',
		description: 'Dark code-editor chrome with blue focus.',
		background: pair('#1e1e1e', '#1e1e1e'), surface: pair('#252526', '#252526'), surfaceAlt: pair('#2d2d30', '#2d2d30'), neutralSurface: pair('#333333', '#333333'), border: pair('#ffffff18', '#ffffff18'), borderStrong: pair('#ffffff33', '#ffffff33'), accent: pair('#007acc', '#007acc'), accentHover: pair('#0e8fe3', '#0e8fe3'), accentMuted: pair('#0d2f4f', '#0d2f4f'), textPrimary: pair('#d4d4d4', '#d4d4d4'), textSecondary: pair('#b5b5b5', '#b5b5b5'), textTertiary: pair('#858585', '#858585'), danger: pair('#f14c4c', '#f14c4c'), warning: pair('#cca700', '#cca700'), positive: pair('#89d185', '#89d185'),
		appColors: [pair('#4fc1ff', '#4fc1ff'), pair('#89d185', '#89d185'), pair('#4ec9b0', '#4ec9b0'), pair('#dcdcaa', '#dcdcaa'), pair('#c586c0', '#c586c0'), pair('#ce9178', '#ce9178'), pair('#f14c4c', '#f14c4c'), pair('#569cd6', '#569cd6'), pair('#b5cea8', '#b5cea8'), pair('#9cdcfe', '#9cdcfe'), pair('#d7ba7d', '#d7ba7d'), pair('#c8c8c8', '#c8c8c8')],
		heatmapGradient: [pair('#2d2d30', '#2d2d30'), pair('#0d2f4f', '#0d2f4f'), pair('#123f5a', '#123f5a'), pair('#0e5f8f', '#0e5f8f'), pair('#007acc', '#007acc'), pair('#4fc1ff', '#4fc1ff'), pair('#d4d4d4', '#d4d4d4')],
	},
	{
		id: 'midnight',
		label: 'Midnight',
		description: 'Deep navy nighttime palette with cyan focus.',
		background: pair('#011627', '#011627'), surface: pair('#071d31', '#071d31'), surfaceAlt: pair('#0b253a', '#0b253a'), neutralSurface: pair('#102a43', '#102a43'), border: pair('#d6deeb22', '#d6deeb22'), borderStrong: pair('#d6deeb3d', '#d6deeb3d'), accent: pair('#2f5f87', '#2f5f87'), accentHover: pair('#3d75a7', '#3d75a7'), accentMuted: pair('#0e3156', '#0e3156'), textPrimary: pair('#d6deeb', '#d6deeb'), textSecondary: pair('#a7b9cc', '#a7b9cc'), textTertiary: pair('#637777', '#637777'), danger: pair('#ef5350', '#ef5350'), warning: pair('#ecc48d', '#ecc48d'), positive: pair('#addb67', '#addb67'),
		appColors: [pair('#82aaff', '#82aaff'), pair('#addb67', '#addb67'), pair('#7fdbca', '#7fdbca'), pair('#ecc48d', '#ecc48d'), pair('#c792ea', '#c792ea'), pair('#ff5874', '#ff5874'), pair('#ef5350', '#ef5350'), pair('#5f7eaf', '#5f7eaf'), pair('#22da6e', '#22da6e'), pair('#21c7a8', '#21c7a8'), pair('#f78c6c', '#f78c6c'), pair('#b392f0', '#b392f0')],
		heatmapGradient: [pair('#071d31', '#071d31'), pair('#0e3156', '#0e3156'), pair('#16456f', '#16456f'), pair('#1f5f87', '#1f5f87'), pair('#5f7eaf', '#5f7eaf'), pair('#82aaff', '#82aaff'), pair('#d6deeb', '#d6deeb')],
	},
	{
		id: 'daybreak',
		label: 'Daybreak',
		description: 'Soft daylight palette with blue-gray contrast.',
		background: pair('#fbfbfb', '#fbfbfb'), surface: pair('#ffffff', '#ffffff'), surfaceAlt: pair('#f0f2f5', '#f0f2f5'), neutralSurface: pair('#e6ebf2', '#e6ebf2'), border: pair('#01162718', '#01162718'), borderStrong: pair('#01162735', '#01162735'), accent: pair('#4876d6', '#4876d6'), accentHover: pair('#315fb8', '#315fb8'), accentMuted: pair('#e3ecff', '#e3ecff'), textPrimary: pair('#011627', '#011627'), textSecondary: pair('#405469', '#405469'), textTertiary: pair('#728095', '#728095'), danger: pair('#d3423e', '#d3423e'), warning: pair('#b87500', '#b87500'), positive: pair('#2b8a3e', '#2b8a3e'),
		appColors: [pair('#4876d6', '#4876d6'), pair('#2b8a3e', '#2b8a3e'), pair('#08979c', '#08979c'), pair('#b87500', '#b87500'), pair('#7d5cc6', '#7d5cc6'), pair('#c0447c', '#c0447c'), pair('#d3423e', '#d3423e'), pair('#2f5ca8', '#2f5ca8'), pair('#5c7f31', '#5c7f31'), pair('#007d74', '#007d74'), pair('#b35f2b', '#b35f2b'), pair('#8b6fcf', '#8b6fcf')],
		heatmapGradient: [pair('#e6ebf2', '#e6ebf2'), pair('#e3ecff', '#e3ecff'), pair('#c8dcff', '#c8dcff'), pair('#9abcf5', '#9abcf5'), pair('#7aa5f0', '#7aa5f0'), pair('#4876d6', '#4876d6'), pair('#123a80', '#123a80')],
	},
];

export const TIME_MD_COLOR_SCHEMES: TimeMdThemePreset[] = [
	{
		id: 'theme',
		label: 'Obsidian theme',
		description: 'Follow the current Obsidian theme accent and colors.',
		light: tokens(PRESET_PAIRS[0]!, 0),
		dark: tokens(PRESET_PAIRS[0]!, 1),
	},
	...PRESET_PAIRS.map((preset) => ({
		id: preset.id,
		label: preset.label,
		description: preset.description,
		light: tokens(preset, 0),
		dark: tokens(preset, 1),
	})),
];

export function normalizeColorScheme(value: string | undefined | null): TimeMdColorScheme {
	const normalized = String(value ?? '').trim().toLowerCase();
	switch (normalized) {
		case '':
		case 'theme':
		case 'obsidian':
		case 'obsidian-theme':
			return 'theme';
		case 'time':
		case 'timemd':
		case 'time-md':
			return 'time-md';
		case 'mono':
		case 'monochrome':
			return 'monochrome';
		case 'teenage-engineering':
		case 'warm':
		case 'warm-console':
			return 'warm-console';
		case 'obsidian-violet':
		case 'graphite':
		case 'graphite-violet':
			return 'graphite-violet';
		case 'apple':
		case 'system':
			return 'system';
		case 'vscode':
		case 'editor':
		case 'editor-dark':
			return 'editor-dark';
		case 'night-owl':
		case 'midnight':
			return 'midnight';
		case 'day-owl':
		case 'daybreak':
			return 'daybreak';
		default:
			return 'theme';
	}
}

export function getColorScheme(id: TimeMdColorScheme): TimeMdThemePreset {
	return TIME_MD_COLOR_SCHEMES.find((scheme) => scheme.id === id) ?? TIME_MD_COLOR_SCHEMES[0]!;
}

export function resolveColorSchemeTokens(id: TimeMdColorScheme, root: HTMLElement = activeDocument.body): TimeMdThemeTokens | null {
	if (id === 'theme') return null;
	const scheme = getColorScheme(id);
	let isDark = false;
	try {
		isDark = root.classList.contains('theme-dark') || activeWindow.matchMedia?.('(prefers-color-scheme: dark)').matches;
	} catch {
		isDark = false;
	}
	return isDark ? scheme.dark : scheme.light;
}

export function applyColorSchemeVars(target: HTMLElement, id: TimeMdColorScheme): void {
	const tokens = resolveColorSchemeTokens(id, target);
	if (!tokens) return;
	const style = target.style;
	style.setProperty('--background-primary', tokens.background);
	style.setProperty('--background-primary-alt', tokens.neutralSurface);
	style.setProperty('--background-secondary', tokens.surfaceAlt);
	style.setProperty('--background-modifier-border', tokens.border);
	style.setProperty('--background-modifier-hover', tokens.neutralSurface);
	style.setProperty('--text-normal', tokens.textPrimary);
	style.setProperty('--text-muted', tokens.textSecondary);
	style.setProperty('--text-faint', tokens.textTertiary);
	style.setProperty('--interactive-accent', tokens.accent);
	style.setProperty('--color-accent', tokens.accent);
	style.setProperty('--text-accent', tokens.accent);
	style.setProperty('--timemd-accent', tokens.accent);
	style.setProperty('--timemd-accent-hover', tokens.accentHover);
	style.setProperty('--timemd-accent-muted', tokens.accentMuted);
	style.setProperty('--timemd-danger', tokens.danger);
	style.setProperty('--timemd-warning', tokens.warning);
	style.setProperty('--timemd-positive', tokens.positive);
	style.setProperty('--timemd-app-palette', tokens.appColors.join(','));
	style.setProperty('--timemd-heatmap-rgb', hexToRgbString(tokens.heatmapGradient[Math.max(0, tokens.heatmapGradient.length - 2)] ?? tokens.accent));

	const sankeyOnDarkSurface = isDarkHexColor(tokens.background) || isDarkHexColor(tokens.surface);
	style.setProperty('--timemd-sankey-link-blend-mode', sankeyOnDarkSurface ? 'normal' : 'multiply');
	style.setProperty('--timemd-sankey-link-opacity', sankeyOnDarkSurface ? '0.56' : '0.34');
	style.setProperty('--timemd-sankey-link-hover-opacity', sankeyOnDarkSurface ? '0.78' : '0.64');
}

export function clearColorSchemeVars(target: HTMLElement): void {
	[
		'--background-primary', '--background-primary-alt', '--background-secondary', '--background-modifier-border',
		'--background-modifier-hover', '--text-normal', '--text-muted', '--text-faint', '--interactive-accent',
		'--color-accent', '--text-accent', '--timemd-accent', '--timemd-accent-hover', '--timemd-accent-muted',
		'--timemd-danger', '--timemd-warning', '--timemd-positive', '--timemd-app-palette', '--timemd-heatmap-rgb',
		'--timemd-sankey-link-blend-mode', '--timemd-sankey-link-opacity', '--timemd-sankey-link-hover-opacity',
	].forEach((name) => target.style.removeProperty(name));
}

function hexToRgbString(hex: string): string {
	const rgb = parseHexRgb(hex);
	if (!rgb) return '88, 101, 242';
	return `${rgb.r}, ${rgb.g}, ${rgb.b}`;
}

function isDarkHexColor(hex: string): boolean {
	const rgb = parseHexRgb(hex);
	if (!rgb) return false;
	const perceivedBrightness = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
	return perceivedBrightness < 0.45;
}

function parseHexRgb(hex: string): { r: number; g: number; b: number } | null {
	const clean = hex.trim().replace('#', '').slice(0, 6);
	const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
	if (!/^[0-9a-f]{6}$/i.test(full)) return null;
	const n = Number.parseInt(full, 16);
	if (!Number.isFinite(n)) return null;
	return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
