import { ReportMetadata, SectionName } from './types';

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

export function pad2(value: number): string {
	const whole = Math.trunc(value);
	return whole >= 0 && whole < 10 ? `0${whole}` : `${whole}`;
}

export function formatDateISO(d: Date): string {
	const y = d.getFullYear();
	const m = pad2(d.getMonth() + 1);
	const day = pad2(d.getDate());
	return `${y}-${m}-${day}`;
}

export function coerceNumber(value: unknown): number | string {
	return coerceRowValue(value);
}

export function coerceRowValue(value: unknown, fieldName?: string): number | string {
	if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
	if (value == null) return isNumericField(fieldName) ? 0 : '';
	if (typeof value !== 'string') return stringifyRowValue(value);
	const trimmed = value.trim();
	if (!trimmed) return isNumericField(fieldName) ? 0 : trimmed;
	if (isNumericString(trimmed)) return Number(trimmed);
	return value;
}

export function toFiniteNumber(value: unknown, fallback = 0): number {
	if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return fallback;
		const n = Number(trimmed);
		return Number.isFinite(n) ? n : fallback;
	}
	return fallback;
}

export function parseDateRangeText(value: unknown): { start?: Date; end?: Date } {
	if (value == null) return {};
	if (value instanceof Date) return { start: value, end: value };
	if (typeof value !== 'string' && typeof value !== 'number') return {};
	const text = stripWikiLinks(`${value}`).trim();
	if (!text) return {};

	const parts = splitDateRange(text);
	if (parts.length >= 2) {
		return {
			start: parseDate(parts[0]),
			end: parseDate(parts.slice(1).join(' ').trim()) ?? parseDate(parts[1]),
		};
	}

	const single = parseDate(text);
	return single ? { start: single, end: single } : {};
}

export function applyFilterMetadata(metadata: ReportMetadata): void {
	if (!metadata.filters) return;
	const filters = parseFilterString(metadata.filters);
	const dateRange = filters.get('date_range') ?? filters.get('daterange') ?? filters.get('date range');
	if (dateRange) {
		const parsed = parseDateRangeText(dateRange);
		metadata.dateRangeStart = metadata.dateRangeStart ?? parsed.start;
		metadata.dateRangeEnd = metadata.dateRangeEnd ?? parsed.end;
	}
	metadata.granularity = metadata.granularity ?? filters.get('granularity');
	metadata.timezone = metadata.timezone ?? filters.get('timezone') ?? filters.get('time_zone');
	metadata.schemaVersion = metadata.schemaVersion ?? filters.get('schema_version') ?? filters.get('schema');
}

function splitDateRange(text: string): string[] {
	if (text.includes('..')) return text.split(/\.\./).map((s) => s.trim()).filter(Boolean);
	if (text.includes('→')) return text.split('→').map((s) => s.trim()).filter(Boolean);
	if (/\s+to\s+/i.test(text)) return text.split(/\s+to\s+/i).map((s) => s.trim()).filter(Boolean);
	if (/\s+-\s+/.test(text)) return text.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
	return [text];
}

function parseFilterString(filters: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const part of filters.split(';')) {
		const trimmed = part.trim();
		if (!trimmed) continue;
		const idx = trimmed.indexOf('=');
		if (idx <= 0) continue;
		const key = trimmed.slice(0, idx).trim().toLowerCase();
		const value = trimmed.slice(idx + 1).trim();
		if (key && value) out.set(key, value);
	}
	return out;
}

function stringifyRowValue(value: unknown): string {
	if (typeof value === 'boolean' || typeof value === 'bigint' || typeof value === 'symbol') return String(value);
	if (value instanceof Date) return value.toISOString();
	return JSON.stringify(value) ?? '';
}

function isNumericField(fieldName: string | undefined): boolean {
	if (!fieldName) return false;
	const key = fieldName.toLowerCase().trim();
	return (
		key === 'hour' ||
		key === 'weekday' ||
		key === 'count' ||
		key.endsWith('_count') ||
		key.endsWith('_seconds') ||
		key.endsWith('_minutes') ||
		key.endsWith('_hours') ||
		key.endsWith('_id') ||
		key.endsWith('_x') ||
		key.endsWith('_y') ||
		key === 'x' ||
		key === 'y' ||
		key === 'pct' ||
		key === 'percent' ||
		key === 'samples' ||
		key === 'modifiers' ||
		key === 'kind' ||
		key === 'button' ||
		key === 'visits' ||
		key === 'interruptions'
	);
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
	focus_blocks: 'focus_blocks',
	'focus blocks': 'focus_blocks',
	'focus block': 'focus_blocks',
	daily_matrix: 'daily_matrix',
	'daily matrix': 'daily_matrix',
	'daily matrices': 'daily_matrix',
	hourly_matrix: 'hourly_matrix',
	'hourly matrix': 'hourly_matrix',
	'hourly matrices': 'hourly_matrix',
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
