import { SectionName } from './types';

export function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds <= 0) return '0m';
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	if (h > 0 && m > 0) return `${h}h ${m}m`;
	if (h > 0) return `${h}h`;
	if (m > 0) return `${m}m`;
	return `${Math.round(seconds)}s`;
}

export function formatDurationLong(seconds: number): string {
	const h = seconds / 3600;
	if (h >= 1) return `${h.toFixed(1)} hours`;
	const m = seconds / 60;
	return `${m.toFixed(0)} minutes`;
}

export function parseDate(value: unknown): Date | undefined {
	if (value == null) return undefined;
	if (value instanceof Date) return value;
	if (typeof value !== 'string' && typeof value !== 'number') return undefined;
	const s = String(value).trim();
	if (!s) return undefined;
	const d = new Date(s);
	return Number.isNaN(d.getTime()) ? undefined : d;
}

export function formatDateISO(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export function coerceNumber(value: unknown): number | string {
	if (typeof value === 'number') return value;
	if (typeof value !== 'string') return String(value);
	const trimmed = value.trim();
	if (!trimmed) return trimmed;
	if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
	return value;
}

export function stripWikiLinks(value: string): string {
	let out = value.replace(/\[\[([^\]]*?)\]\]/g, (_, inner: string) => displayText(inner));
	out = out.replace(/\[\[([^\]\n]*)/g, (_, inner: string) => displayText(inner));
	return out;
}

function displayText(inner: string): string {
	const idx = inner.lastIndexOf('|');
	return idx >= 0 ? inner.slice(idx + 1).trim() : inner.trim();
}

export function stripLeadingEmoji(text: string): string {
	return text.replace(/^[^\w#]+/, '').trim();
}

const SECTION_ALIASES: Record<string, SectionName> = {
	summary: 'summary',
	apps: 'apps',
	'top apps': 'apps',
	top_apps: 'apps',
	categories: 'categories',
	category: 'categories',
	trend: 'trend',
	trends: 'trend',
	heatmap: 'heatmap',
	sessions: 'sessions',
	'raw sessions': 'sessions',
	raw_sessions: 'sessions',
	session_distribution: 'session_distribution',
	'session distribution': 'session_distribution',
	browsing_history: 'browsing_history',
	'browsing history': 'browsing_history',
	web_history: 'browsing_history',
	'web history': 'browsing_history',
	top_domains: 'top_domains',
	'top domains': 'top_domains',
	context_switches: 'context_switches',
	'context switches': 'context_switches',
	app_transitions: 'app_transitions',
	'app transitions': 'app_transitions',
	period_comparison: 'period_comparison',
	'period comparison': 'period_comparison',
	'top typed words': 'input_top_words',
	input_top_words: 'input_top_words',
	'top typed keys': 'input_top_keys',
	input_top_keys: 'input_top_keys',
	'cursor heatmap bins': 'input_cursor_heatmap',
	'cursor heatmap': 'input_cursor_heatmap',
	input_cursor_heatmap: 'input_cursor_heatmap',
	'typing intensity': 'input_typing_intensity',
	input_typing_intensity: 'input_typing_intensity',
	'raw keystrokes': 'input_raw_keystrokes',
	input_raw_keystrokes: 'input_raw_keystrokes',
	'raw mouse events': 'input_raw_mouse_events',
	input_raw_mouse_events: 'input_raw_mouse_events',
};

export function canonicalSectionName(raw: string): SectionName {
	const cleaned = stripLeadingEmoji(raw).toLowerCase().trim();
	return SECTION_ALIASES[cleaned] ?? 'unknown';
}

export function isNumericString(s: string): boolean {
	return /^-?\d+(\.\d+)?$/.test(s.trim());
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
	if (!m) return null;
	let h = m[1]!;
	if (h.length === 3) h = h.split('').map((c) => c + c).join('');
	const n = parseInt(h, 16);
	return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export function rgbString(hex: string, fallback: string): string {
	const rgb = hexToRgb(hex);
	return rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : fallback;
}
