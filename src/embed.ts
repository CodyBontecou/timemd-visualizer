import { MarkdownRenderChild } from 'obsidian';
import {
	colorForLabel,
	renderAppHourHeatmap,
	renderBarList,
	renderContributionHeatmap,
	renderDateHourHeatmap,
	renderHeatmap,
	renderHourStrip,
	renderLineChart,
	renderScatterPlot,
	renderTransitionSankey,
} from './charts';
import { DataStore } from './store';
import { AppRow, SessionRow, TrendPoint } from './types';
import { formatDateISO, formatDuration } from './utils';
import { TimeMdHost } from './views/base';
import { renderDistributionEmbed, renderProjectsEmbed } from './views/projects';
import { renderWebHistoryEmbed } from './views/webHistory';
import { renderReportsEmbed, ReportsFormat, ReportsGroupBy } from './views/reports';
import {
	renderCursorHeatmapEmbed,
	renderInputActivityEmbed,
	renderInputStatsEmbed,
	renderTopKeysEmbed,
	renderTopWordsEmbed,
	renderTypingIntensityEmbed,
} from './views/input';
import { applyColorSchemeVars, clearColorSchemeVars, normalizeColorScheme, TimeMdColorScheme } from './themePresets';

export type EmbedView =
	| 'overview'
	| 'stat'
	| 'trends'
	| 'trend-chart'
	| 'calendar'
	| 'heatmap'
	| 'apps'
	| 'top-apps'
	| 'categories'
	| 'details'
	| 'transition-sankey'
	| 'app-lanes'
	| 'session-waterfall'
	| 'app-rhythm'
	| 'fragmentation-scatter'
	| 'category-balance'
	| 'day-archetypes'
	| 'contribution-heatmap'
	| 'date-hour-heatmap'
	| 'projects'
	| 'distribution'
	| 'web-history'
	| 'reports'
	| 'input-stats'
	| 'cursor-heatmap'
	| 'typing-intensity'
	| 'top-keys'
	| 'top-words'
	| 'input-activity';

export type WebHistoryTab = 'timeline' | 'domains' | 'activity';

export type StatMetric =
	| 'total_time'
	| 'top_app'
	| 'apps_count'
	| 'days'
	| 'peak_day';

export type OverviewSection = 'stats' | 'trend' | 'heatmap' | 'apps';

const ALL_OVERVIEW_SECTIONS: OverviewSection[] = ['stats', 'trend', 'heatmap', 'apps'];

export interface BlockParams {
	view: EmbedView;
	limit?: number;
	days?: number;
	height?: number;
	metric?: StatMetric;
	title?: string;
	sections?: OverviewSection[];
	date?: Date;
	tab?: WebHistoryTab;
	browser?: string;
	groupBy?: ReportsGroupBy;
	format?: ReportsFormat;
	stats?: boolean;
	legend?: boolean;
	label?: boolean;
	bare?: boolean;
	colorScheme?: TimeMdColorScheme;
}

const WEB_HISTORY_TABS: WebHistoryTab[] = ['timeline', 'domains', 'activity'];
const REPORTS_GROUP_BY: ReportsGroupBy[] = ['app', 'category', 'day'];
const REPORTS_FORMATS: ReportsFormat[] = ['csv', 'json', 'markdown'];

function parseDateParam(value: string): Date | null {
	const v = value.trim().toLowerCase();
	const now = new Date();
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	if (v === 'today') return startOfToday;
	if (v === 'yesterday') {
		const d = new Date(startOfToday);
		d.setDate(d.getDate() - 1);
		return d;
	}
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
	if (!m) return null;
	const y = Number(m[1]);
	const mo = Number(m[2]) - 1;
	const da = Number(m[3]);
	const d = new Date(y, mo, da);
	return Number.isNaN(d.getTime()) ? null : d;
}

export function parseBlockParams(source: string): BlockParams {
	const params: BlockParams = { view: 'overview' };
	for (const rawLine of source.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;
		const m = line.match(/^([a-z_-]+)\s*:\s*(.+)$/i);
		if (!m) continue;
		const key = m[1]!.toLowerCase();
		const value = m[2]!.trim().replace(/^["'](.*)["']$/, '$1');
		switch (key) {
			case 'view':
				params.view = value as EmbedView;
				break;
			case 'limit': {
				const n = Number(value);
				if (Number.isFinite(n)) params.limit = n;
				break;
			}
			case 'days': {
				const n = Number(value);
				if (Number.isFinite(n)) params.days = n;
				break;
			}
			case 'height': {
				const n = Number(value);
				if (Number.isFinite(n) && n > 0) params.height = n;
				break;
			}
			case 'metric':
				params.metric = value as StatMetric;
				break;
			case 'title':
				params.title = value;
				break;
			case 'sections': {
				const picked = value
					.split(',')
					.map((s) => s.trim().toLowerCase())
					.filter((s): s is OverviewSection =>
						ALL_OVERVIEW_SECTIONS.includes(s as OverviewSection),
					);
				if (picked.length > 0) params.sections = picked;
				break;
			}
			case 'date': {
				const d = parseDateParam(value);
				if (d) params.date = d;
				break;
			}
			case 'tab': {
				const v = value.toLowerCase();
				if ((WEB_HISTORY_TABS as string[]).includes(v)) {
					params.tab = v as WebHistoryTab;
				}
				break;
			}
			case 'browser':
				params.browser = value;
				break;
			case 'groupby':
			case 'group_by':
			case 'group-by': {
				const v = value.toLowerCase();
				if ((REPORTS_GROUP_BY as string[]).includes(v)) {
					params.groupBy = v as ReportsGroupBy;
				}
				break;
			}
			case 'format': {
				const v = value.toLowerCase();
				if ((REPORTS_FORMATS as string[]).includes(v)) {
					params.format = v as ReportsFormat;
				}
				break;
			}
			case 'stats': {
				const v = value.toLowerCase();
				if (v === 'true' || v === 'yes' || v === '1') params.stats = true;
				else if (v === 'false' || v === 'no' || v === '0') params.stats = false;
				break;
			}
			case 'legend': {
				const v = value.toLowerCase();
				if (v === 'true' || v === 'yes' || v === '1') params.legend = true;
				else if (v === 'false' || v === 'no' || v === '0') params.legend = false;
				break;
			}
			case 'label': {
				const v = value.toLowerCase();
				if (v === 'true' || v === 'yes' || v === '1') params.label = true;
				else if (v === 'false' || v === 'no' || v === '0') params.label = false;
				break;
			}
				case 'bare': {
				const v = value.toLowerCase();
				if (v === 'true' || v === 'yes' || v === '1') params.bare = true;
				else if (v === 'false' || v === 'no' || v === '0') params.bare = false;
				break;
			}
			case 'colorscheme':
			case 'color-scheme':
			case 'color_scheme':
			case 'palette':
			case 'themepreset':
			case 'theme-preset':
				params.colorScheme = normalizeColorScheme(value);
				break;
		}
	}
	return params;
}

export class TimeMdBlock extends MarkdownRenderChild {
	constructor(
		containerEl: HTMLElement,
		private host: TimeMdHost,
		private params: BlockParams,
	) {
		super(containerEl);
	}

	onload(): void {
		this.registerEvent(this.host.store.onChange(() => this.render()));
		this.render();
	}

	private render(): void {
		this.containerEl.empty();
		if (!this.params.colorScheme && 'settings' in this.host) {
			this.params.colorScheme = normalizeColorScheme((this.host as { settings?: { colorScheme?: string } }).settings?.colorScheme);
		}
		renderEmbed(this.containerEl, this.host.store, this.params);
	}
}

const COLOR_SCHEME_CSS_VARS = [
	'--background-primary', '--background-primary-alt', '--background-secondary', '--background-modifier-border',
	'--background-modifier-hover', '--text-normal', '--text-muted', '--text-faint', '--interactive-accent',
	'--color-accent', '--text-accent', '--timemd-accent', '--timemd-accent-hover', '--timemd-accent-muted',
	'--timemd-danger', '--timemd-warning', '--timemd-positive', '--timemd-app-palette', '--timemd-heatmap-rgb',
	'--timemd-sankey-link-blend-mode', '--timemd-sankey-link-opacity', '--timemd-sankey-link-hover-opacity',
];

function temporarilyApplyBodyColorScheme(colorScheme: TimeMdColorScheme): () => void {
	if (colorScheme === 'theme') return () => undefined;
	const body = activeDocument.body;
	const previous = new Map<string, string>();
	for (const name of COLOR_SCHEME_CSS_VARS) previous.set(name, body.style.getPropertyValue(name));
	applyColorSchemeVars(body, colorScheme);
	return () => {
		for (const name of COLOR_SCHEME_CSS_VARS) {
			const value = previous.get(name) ?? '';
			if (value) body.style.setProperty(name, value);
			else body.style.removeProperty(name);
		}
	};
}

export function renderEmbed(el: HTMLElement, store: DataStore, params: BlockParams): void {
	const colorScheme = normalizeColorScheme(params.colorScheme);
	clearColorSchemeVars(el);
	if (colorScheme !== 'theme') applyColorSchemeVars(el, colorScheme);
	const restoreBodyScheme = temporarilyApplyBodyColorScheme(colorScheme);
	try {
		renderEmbedInner(el, store, params);
	} finally {
		restoreBodyScheme();
	}
}

function renderEmbedInner(el: HTMLElement, store: DataStore, params: BlockParams): void {
	el.addClass('timemd-embed');
	if (params.bare) el.addClass('timemd-embed-bare');
	if (!store.hasData()) {
		el.createDiv({
			cls: 'timemd-embed-empty',
			text:
				store.lastError ??
				'timemd-visualizor: no exports loaded. Set the export folder in plugin settings and click Reload.',
		});
		return;
	}

	if (params.title && params.view !== 'stat') {
		el.createEl('h4', { text: params.title, cls: 'timemd-embed-title' });
	}

	switch (params.view) {
		case 'stat':
			renderStat(el, store, params);
			return;
		case 'trends':
		case 'trend-chart':
			renderTrendChart(el, store, params);
			return;
		case 'calendar':
		case 'heatmap':
			renderHeatmapEmbed(el, store);
			return;
		case 'apps':
		case 'top-apps':
			renderTopApps(el, store, params);
			return;
		case 'categories':
			renderCategories(el, store, params);
			return;
		case 'details':
			renderRecentSessions(el, store, params);
			return;
		case 'transition-sankey':
			renderTransitionSankeyEmbed(el, store, params);
			return;
		case 'app-lanes':
			renderAppLanesEmbed(el, store, params);
			return;
		case 'session-waterfall':
			renderSessionWaterfallEmbed(el, store, params);
			return;
		case 'app-rhythm':
			renderAppRhythmEmbed(el, store, params);
			return;
		case 'fragmentation-scatter':
			renderFragmentationScatterEmbed(el, store);
			return;
		case 'category-balance':
			renderCategoryBalanceEmbed(el, store, params);
			return;
		case 'day-archetypes':
			renderDayArchetypesEmbed(el, store, params);
			return;
		case 'contribution-heatmap':
			renderContributionHeatmapEmbed(el, store);
			return;
		case 'date-hour-heatmap':
			renderDateHourHeatmapEmbed(el, store);
			return;
		case 'projects':
			renderProjectsEmbed(el, store, { limit: params.limit });
			return;
		case 'distribution':
			renderDistributionEmbed(el, store, {
				stats: params.stats,
				legend: params.legend,
				label: params.label,
			});
			return;
		case 'web-history':
			renderWebHistoryEmbed(el, store, {
				limit: params.limit,
				tab: params.tab,
				browser: params.browser,
			});
			return;
		case 'reports':
			renderReportsEmbed(el, store, {
				groupBy: params.groupBy,
				format: params.format,
			});
			return;
		case 'input-stats':
			renderInputStatsEmbed(el, store);
			return;
		case 'cursor-heatmap':
			renderCursorHeatmapEmbed(el, store, { height: params.height });
			return;
		case 'typing-intensity':
			renderTypingIntensityEmbed(el, store, { height: params.height });
			return;
		case 'top-keys':
			renderTopKeysEmbed(el, store, { limit: params.limit });
			return;
		case 'top-words':
			renderTopWordsEmbed(el, store, { limit: params.limit });
			return;
		case 'input-activity':
			renderInputActivityEmbed(el, store);
			return;
		case 'overview':
		default:
			renderOverview(el, store, params);
	}
}

interface OverviewData {
	apps: AppRow[];
	totalSeconds: number;
	trend: TrendPoint[];
	rangeText: string;
	hourly: number[] | null;
}

function buildOverviewData(store: DataStore, params: BlockParams): OverviewData | { empty: string } {
	if (params.date) {
		const dayKey = formatDateISO(params.date);
		const allSessions = store.getSessions();
		if (allSessions.length === 0) {
			return {
				empty:
					'Per-day filtering needs the Raw Sessions section in your export. Re-export with sessions included.',
			};
		}
		const dailySessions = allSessions.filter((s) => formatDateISO(s.start_time) === dayKey);
		if (dailySessions.length === 0) {
			return { empty: `No data for ${dayKey}.` };
		}
		const appMap = new Map<string, AppRow>();
		const hourly = Array.from<number>({ length: 24 }).fill(0);
		for (const s of dailySessions) {
			const existing =
				appMap.get(s.app_name) ?? { app_name: s.app_name, total_seconds: 0, session_count: 0 };
			existing.total_seconds += s.duration_seconds;
			existing.session_count += 1;
			appMap.set(s.app_name, existing);
			const h = Math.max(0, Math.min(23, s.start_time.getHours()));
			hourly[h] = (hourly[h] ?? 0) + s.duration_seconds;
		}
		const apps = [...appMap.values()].sort((a, b) => b.total_seconds - a.total_seconds);
		const totalSeconds = apps.reduce((sum, a) => sum + a.total_seconds, 0);
		const trendPoint = store.getTrend().find((t) => formatDateISO(t.date) === dayKey);
		return {
			apps,
			totalSeconds,
			trend: [trendPoint ?? { date: params.date, total_seconds: totalSeconds }],
			rangeText: dayKey,
			hourly,
		};
	}

	const range = store.getDateRange();
	let rangeText = '—';
	if (range) {
		const start = formatDateISO(range.start);
		const end = formatDateISO(range.end);
		rangeText = start === end ? start : `${start} → ${end}`;
	}
	return {
		apps: store.getApps(),
		totalSeconds: store.getTotalSeconds(),
		trend: filterDays(store.getTrend(), params.days),
		rangeText,
		hourly: null,
	};
}

function renderOverview(el: HTMLElement, store: DataStore, params: BlockParams): void {
	const sections = new Set<OverviewSection>(params.sections ?? ALL_OVERVIEW_SECTIONS);
	const data = buildOverviewData(store, params);
	if ('empty' in data) {
		el.createDiv({ cls: 'timemd-embed-empty', text: data.empty });
		return;
	}

	if (sections.has('stats')) {
		const statsRow = el.createDiv({ cls: 'timemd-stats-row' });
		addStat(statsRow, 'Total', formatDuration(data.totalSeconds));
		addStat(statsRow, 'Top app', data.apps[0]?.app_name ?? '—');
		addStat(statsRow, 'Apps', String(data.apps.length));
		addStat(statsRow, params.date ? 'Date' : 'Range', data.rangeText);
	}

	if (sections.has('trend') && data.trend.length > 0) {
		const chartWrap = el.createDiv({ cls: 'timemd-embed-chart' });
		renderLineChart(
			chartWrap,
			data.trend.map((t) => ({ label: formatDateISO(t.date).slice(5), value: t.total_seconds })),
			{ height: 180 },
		);
	}

	if (sections.has('heatmap')) {
		if (data.hourly) {
			const heatWrap = el.createDiv({ cls: 'timemd-embed-heatmap' });
			renderHourStrip(heatWrap, data.hourly, {
				label: data.rangeText,
				formatValue: formatDuration,
			});
		} else {
			const heatmap = store.getHeatmap();
			if (heatmap.length > 0) {
				const heatWrap = el.createDiv({ cls: 'timemd-embed-heatmap' });
				const grid: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
				for (const cell of heatmap) {
					const d = Math.max(0, Math.min(6, cell.weekday - 1));
					const h = Math.max(0, Math.min(23, cell.hour));
					const row = grid[d]!;
					row[h] = (row[h] ?? 0) + cell.total_seconds;
				}
				renderHeatmap(heatWrap, grid, { formatValue: formatDuration });
			}
		}
	}

	if (sections.has('apps') && data.apps.length > 0) {
		const limit = params.limit ?? 5;
		const barsWrap = el.createDiv({ cls: 'timemd-embed-bars' });
		renderBarList(
			barsWrap,
			data.apps.slice(0, limit).map((a) => ({ label: a.app_name, value: a.total_seconds })),
			{ formatValue: formatDuration },
		);
	}
}

function renderStat(el: HTMLElement, store: DataStore, params: BlockParams): void {
	const metric = params.metric ?? 'total_time';
	const card = el.createDiv({ cls: 'timemd-stat-card' });
	let label = params.title ?? '';
	let value = '—';

	switch (metric) {
		case 'total_time':
			label ||= 'Total time';
			value = formatDuration(store.getTotalSeconds());
			break;
		case 'top_app':
			label ||= 'Top app';
			value = store.getApps()[0]?.app_name ?? '—';
			break;
		case 'apps_count':
			label ||= 'Apps tracked';
			value = String(store.getApps().length);
			break;
		case 'days':
			label ||= 'Days tracked';
			value = String(store.getTrend().length);
			break;
		case 'peak_day': {
			const trend = store.getTrend();
			label ||= 'Peak day';
			if (trend.length > 0) {
				const peak = trend.reduce((m, t) => (t.total_seconds > m.total_seconds ? t : m), trend[0]!);
				value = `${formatDateISO(peak.date)} · ${formatDuration(peak.total_seconds)}`;
			}
			break;
		}
	}

	card.createDiv({ cls: 'timemd-stat-label', text: label });
	card.createDiv({ cls: 'timemd-stat-value timemd-stat-value-large', text: value });
}

function renderTrendChart(el: HTMLElement, store: DataStore, params: BlockParams): void {
	const trend = filterDays(store.getTrend(), params.days);
	if (trend.length === 0) {
		el.createDiv({ cls: 'timemd-embed-empty', text: 'No trend data.' });
		return;
	}
	renderLineChart(
		el,
		trend.map((t) => ({ label: formatDateISO(t.date).slice(5), value: t.total_seconds })),
		{ height: 220 },
	);
}

function renderHeatmapEmbed(el: HTMLElement, store: DataStore): void {
	const heatmap = store.getHeatmap();
	if (heatmap.length === 0) {
		el.createDiv({ cls: 'timemd-embed-empty', text: 'No heatmap data in the loaded exports.' });
		return;
	}
	const grid: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
	for (const cell of heatmap) {
		const d = Math.max(0, Math.min(6, cell.weekday - 1));
		const h = Math.max(0, Math.min(23, cell.hour));
		const row = grid[d]!;
		row[h] = (row[h] ?? 0) + cell.total_seconds;
	}
	renderHeatmap(el, grid, { formatValue: formatDuration });
}

function renderTopApps(el: HTMLElement, store: DataStore, params: BlockParams): void {
	const apps = store.getApps().slice(0, params.limit ?? 10);
	if (apps.length === 0) {
		el.createDiv({ cls: 'timemd-embed-empty', text: 'No apps data.' });
		return;
	}
	renderBarList(
		el,
		apps.map((a) => ({ label: a.app_name, value: a.total_seconds })),
		{ formatValue: formatDuration },
	);
}

function renderCategories(el: HTMLElement, store: DataStore, params: BlockParams): void {
	const cats = store.getCategories().slice(0, params.limit ?? 10);
	if (cats.length === 0) {
		el.createDiv({ cls: 'timemd-embed-empty', text: 'No categories data.' });
		return;
	}
	renderBarList(
		el,
		cats.map((c) => ({ label: c.category, value: c.total_seconds })),
		{ formatValue: formatDuration },
	);
}

function renderRecentSessions(el: HTMLElement, store: DataStore, params: BlockParams): void {
	const limit = params.limit ?? 10;
	const sessions = store.getSessions().slice(0, limit);
	if (sessions.length === 0) {
		el.createDiv({ cls: 'timemd-embed-empty', text: 'No session data.' });
		return;
	}
	const list = el.createEl('ul', { cls: 'timemd-session-list' });
	for (const s of sessions) {
		const li = list.createEl('li', { cls: 'timemd-session-item' });
		li.createSpan({ cls: 'timemd-session-app', text: s.app_name });
		li.createSpan({ cls: 'timemd-session-sep', text: ' · ' });
		li.createSpan({ cls: 'timemd-session-time', text: s.start_time.toLocaleString() });
		li.createSpan({ cls: 'timemd-session-sep', text: ' · ' });
		li.createSpan({ cls: 'timemd-session-duration', text: formatDuration(s.duration_seconds) });
	}
}

function renderTransitionSankeyEmbed(el: HTMLElement, store: DataStore, params: BlockParams): void {
	const transitions = store.getAppTransitions();
	if (transitions.length === 0) {
		el.createDiv({ cls: 'timemd-embed-empty', text: 'No app transition data.' });
		return;
	}
	renderTransitionSankey(el, transitions, {
		maxApps: params.limit ?? 8,
		maxTransitions: Math.max(params.limit ?? 12, 12),
		formatApp: displayAppName,
	});
}

function renderAppLanesEmbed(el: HTMLElement, store: DataStore, params: BlockParams): void {
	const sessions = sessionsForLatestDay(store.getSessions());
	if (sessions.length === 0) {
		el.createDiv({ cls: 'timemd-embed-empty', text: 'No session data.' });
		return;
	}
	const topApps = topAppNames(sessions, params.limit ?? 8);
	const lanes = el.createDiv({ cls: 'timemd-lane-timeline' });
	const day = formatDateISO(sessions[0]!.start_time);
	const head = lanes.createDiv({ cls: 'timemd-lane-day-head' });
	head.createDiv({ cls: 'timemd-lane-day-title', text: day });
	head.createDiv({ cls: 'timemd-lane-day-meta', text: `${sessions.length.toLocaleString()} sessions` });
	const axis = lanes.createDiv({ cls: 'timemd-lane-axis' });
	for (const label of ['12a', '6a', '12p', '6p', '12a']) axis.createSpan({ text: label });
	for (const app of [...topApps, 'Other']) {
		const laneSessions = sessions.filter((s) => (topApps.includes(s.app_name) ? s.app_name : 'Other') === app);
		if (laneSessions.length === 0) continue;
		const total = laneSessions.reduce((sum, s) => sum + s.duration_seconds, 0);
		const row = lanes.createDiv({ cls: `timemd-lane-row${app === 'Other' ? ' is-other' : ''}` });
		const label = row.createDiv({ cls: 'timemd-lane-label' });
		label.createDiv({ cls: 'timemd-lane-app', text: app });
		label.createDiv({ cls: 'timemd-lane-meta', text: formatDuration(total) });
		const track = row.createDiv({ cls: 'timemd-lane-track' });
		for (const s of laneSessions.slice(0, 300)) {
			const start = secondsSinceStartOfDay(s.start_time);
			const end = Math.min(86400, start + Math.max(60, s.duration_seconds));
			const seg = track.createDiv({ cls: `timemd-lane-segment${s.duration_seconds < 60 ? ' is-short' : ''}` });
			seg.style.left = `${(start / 86400) * 100}%`;
			seg.style.width = `${Math.max(0.25, ((end - start) / 86400) * 100)}%`;
			seg.style.background = colorForLabel(s.app_name);
			seg.setAttr('title', `${s.app_name} · ${s.start_time.toLocaleTimeString()}–${s.end_time.toLocaleTimeString()} · ${formatDuration(s.duration_seconds)}`);
		}
	}
}

function renderSessionWaterfallEmbed(el: HTMLElement, store: DataStore, params: BlockParams): void {
	const sessions = sessionsForLatestDay(store.getSessions()).sort((a, b) => a.start_time.getTime() - b.start_time.getTime());
	if (sessions.length === 0) {
		el.createDiv({ cls: 'timemd-embed-empty', text: 'No session data.' });
		return;
	}
	const limit = params.limit ?? 60;
	const shown = sessions.slice(0, limit);
	const max = Math.max(1, ...shown.map((s) => s.duration_seconds));
	const wrap = el.createDiv({ cls: 'timemd-session-waterfall' });
	for (const s of shown) {
		const row = wrap.createDiv({ cls: 'timemd-waterfall-row' });
		row.createDiv({ cls: 'timemd-waterfall-time', text: s.start_time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
		row.createDiv({ cls: 'timemd-waterfall-app', text: s.app_name });
		row.createDiv({ cls: 'timemd-waterfall-duration', text: formatDuration(s.duration_seconds) });
		const track = row.createDiv({ cls: 'timemd-waterfall-track' });
		const fill = track.createDiv({ cls: 'timemd-waterfall-fill' });
		fill.style.width = `${Math.max(1, (s.duration_seconds / max) * 100)}%`;
		fill.style.background = colorForLabel(s.app_name);
		row.setAttr('title', `${s.app_name} · ${s.start_time.toLocaleString()}–${s.end_time.toLocaleTimeString()} · ${formatDuration(s.duration_seconds)}`);
	}
	if (sessions.length > shown.length) el.createDiv({ cls: 'timemd-card-note', text: `Showing first ${shown.length} of ${sessions.length} sessions for the latest day.` });
}

function renderAppRhythmEmbed(el: HTMLElement, store: DataStore, params: BlockParams): void {
	const rows = buildAppHourRows(store.getSessions(), params.limit ?? 8);
	renderAppHourHeatmap(el, rows, { formatValue: formatDuration });
}

function renderFragmentationScatterEmbed(el: HTMLElement, store: DataStore): void {
	const sessionsByDay = groupSessionsByDay(store.getSessions());
	const switchesByDay = new Map<string, number>();
	for (const row of store.getContextSwitches()) switchesByDay.set(row.date, (switchesByDay.get(row.date) ?? 0) + row.switch_count);
	const points = store.getTrend().map((trend) => {
		const key = formatDateISO(trend.date);
		const sessions = sessionsByDay.get(key) ?? [];
		const switches = switchesByDay.get(key) ?? 0;
		const hours = Math.max(0.1, trend.total_seconds / 3600);
		const top = topAppNames(sessions, 1)[0] ?? 'Unknown';
		return {
			label: key,
			x: trend.total_seconds,
			y: switches / hours,
			size: Math.max(1, sessions.length),
			color: colorForLabel(top),
			title: `${key} · ${formatDuration(trend.total_seconds)} · ${(switches / hours).toFixed(1)} switches/hour · ${sessions.length} sessions · top app ${top}`,
		};
	});
	renderScatterPlot(el, points, {
		formatX: formatDuration,
		formatY: (v) => v.toFixed(1),
		xLabel: 'Active time',
		yLabel: 'Switches/hour',
	});
}

function renderCategoryBalanceEmbed(el: HTMLElement, store: DataStore, params: BlockParams): void {
	const dated = [...store.getDailyMatrix(), ...store.getHourlyMatrix()]
		.filter((cell) => cell.date && cell.category && cell.total_seconds > 0);
	if (dated.length === 0) {
		el.createDiv({ cls: 'timemd-card-note', text: 'No dated category matrix in this export; showing full-range category balance.' });
		renderCategories(el, store, params);
		return;
	}
	const totals = new Map<string, number>();
	for (const cell of dated) totals.set(cell.category!, (totals.get(cell.category!) ?? 0) + cell.total_seconds);
	renderBarList(el, [...totals.entries()]
		.map(([label, value]) => ({ label, value }))
		.sort((a, b) => b.value - a.value)
		.slice(0, params.limit ?? 10), { formatValue: formatDuration, showPercent: true });
}

function renderDayArchetypesEmbed(el: HTMLElement, store: DataStore, params: BlockParams): void {
	const sessionsByDay = groupSessionsByDay(store.getSessions());
	const switchesByDay = new Map<string, number>();
	for (const row of store.getContextSwitches()) switchesByDay.set(row.date, (switchesByDay.get(row.date) ?? 0) + row.switch_count);
	const rows = store.getTrend().map((trend) => {
		const key = formatDateISO(trend.date);
		const sessions = sessionsByDay.get(key) ?? [];
		const switches = switchesByDay.get(key) ?? 0;
		const top = topAppNames(sessions, 1)[0] ?? '—';
		const switchesPerHour = switches / Math.max(0.1, trend.total_seconds / 3600);
		let label = 'Deep work';
		if (trend.total_seconds < 3600) label = 'Low activity';
		else if (switchesPerHour > 18 || sessions.filter((s) => s.duration_seconds < 60).length / Math.max(1, sessions.length) > 0.45) label = 'Fragmented';
		else if (/slack|mail|messages|discord|teams|zoom/i.test(top)) label = 'Comms-heavy';
		else if (/safari|arc|chrome|firefox|youtube|browser/i.test(top)) label = 'Browsing-heavy';
		return { key, label, total: trend.total_seconds, switchesPerHour, sessions: sessions.length, top };
	}).slice(-(params.limit ?? 14));
	if (rows.length === 0) {
		el.createDiv({ cls: 'timemd-embed-empty', text: 'No daily trend data.' });
		return;
	}
	const table = el.createDiv({ cls: 'timemd-table-wrap timemd-archetype-table-wrap' }).createEl('table', { cls: 'timemd-table timemd-archetype-table' });
	const head = table.createEl('thead').createEl('tr');
	for (const h of ['Date', 'Archetype', 'Time', 'Top app', 'Switches/hr', 'Sessions']) head.createEl('th', { text: h });
	const body = table.createEl('tbody');
	for (const row of rows) {
		const tr = body.createEl('tr');
		tr.createEl('td', { text: row.key });
		tr.createEl('td').createSpan({ cls: `timemd-archetype-pill is-${row.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, text: row.label });
		tr.createEl('td', { text: formatDuration(row.total) });
		tr.createEl('td', { text: row.top });
		tr.createEl('td', { text: row.switchesPerHour.toFixed(1) });
		tr.createEl('td', { text: String(row.sessions) });
	}
}

function renderContributionHeatmapEmbed(el: HTMLElement, store: DataStore): void {
	renderContributionHeatmap(
		el,
		store.getTrend().map((t) => ({ date: t.date, value: t.total_seconds })),
		{ formatValue: formatDuration, dayAnnotations: buildDayAnnotations(store) },
	);
}

function renderDateHourHeatmapEmbed(el: HTMLElement, store: DataStore): void {
	const range = store.getDateRange();
	renderDateHourHeatmap(el, store.getDateHourHeatmap(), {
		formatValue: formatDuration,
		start: range?.start,
		end: range?.end,
		dayAnnotations: buildDayAnnotations(store),
	});
}

function buildAppHourRows(sessions: SessionRow[], limit: number): Array<{ label: string; hours: number[]; color?: string }> {
	const totals = new Map<string, number>();
	const hours = new Map<string, number[]>();
	for (const session of sessions) {
		const app = session.app_name || 'Unknown';
		const row = hours.get(app) ?? Array<number>(24).fill(0);
		walkSessionByHour(session, (start, end) => {
			const seconds = Math.max(0, (end.getTime() - start.getTime()) / 1000);
			row[start.getHours()] = (row[start.getHours()] ?? 0) + seconds;
			totals.set(app, (totals.get(app) ?? 0) + seconds);
		});
		hours.set(app, row);
	}
	return [...hours.entries()]
		.sort((a, b) => (totals.get(b[0]) ?? 0) - (totals.get(a[0]) ?? 0))
		.slice(0, limit)
		.map(([label, row]) => ({ label, hours: row, color: colorForLabel(label) }));
}

function buildDayAnnotations(store: DataStore): Map<string, { highContextSwitches?: number; focusBlocks?: number }> {
	const annotations = new Map<string, { highContextSwitches?: number; focusBlocks?: number }>();
	const switchTotals = new Map<string, number>();
	for (const row of store.getContextSwitches()) switchTotals.set(row.date, (switchTotals.get(row.date) ?? 0) + row.switch_count);
	const positive = [...switchTotals.values()].filter((v) => v > 0).sort((a, b) => a - b);
	const threshold = positive.length > 0 ? positive[Math.floor(positive.length * 0.75)] ?? positive[0] : undefined;
	for (const [date, count] of switchTotals) {
		if (threshold !== undefined && count >= threshold) {
			annotations.set(date, { ...annotations.get(date), highContextSwitches: count });
		}
	}
	for (const block of store.getFocusBlocks()) {
		const date = formatDateISO(block.start_time);
		const current = annotations.get(date) ?? {};
		current.focusBlocks = (current.focusBlocks ?? 0) + 1;
		annotations.set(date, current);
	}
	return annotations;
}

function sessionsForLatestDay(sessions: SessionRow[]): SessionRow[] {
	if (sessions.length === 0) return [];
	const latest = formatDateISO(sessions.reduce((best, s) => (s.start_time > best.start_time ? s : best), sessions[0]!).start_time);
	return sessions.filter((s) => formatDateISO(s.start_time) === latest);
}

function groupSessionsByDay(sessions: SessionRow[]): Map<string, SessionRow[]> {
	const map = new Map<string, SessionRow[]>();
	for (const session of sessions) {
		const key = formatDateISO(session.start_time);
		const row = map.get(key) ?? [];
		row.push(session);
		map.set(key, row);
	}
	return map;
}

function topAppNames(sessions: SessionRow[], limit: number): string[] {
	const totals = new Map<string, number>();
	for (const s of sessions) totals.set(s.app_name, (totals.get(s.app_name) ?? 0) + s.duration_seconds);
	return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name]) => name);
}

function walkSessionByHour(session: SessionRow, cb: (start: Date, end: Date) => void): void {
	let cursor = new Date(session.start_time);
	const end = session.end_time > session.start_time ? session.end_time : new Date(session.start_time.getTime() + session.duration_seconds * 1000);
	let guard = 0;
	while (cursor < end && guard < 1000) {
		const next = new Date(cursor);
		next.setMinutes(0, 0, 0);
		next.setHours(next.getHours() + 1);
		const segmentEnd = next < end ? next : end;
		cb(cursor, segmentEnd);
		cursor = segmentEnd;
		guard += 1;
	}
}

function secondsSinceStartOfDay(date: Date): number {
	return date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds();
}

function displayAppName(raw: string): string {
	const trimmed = raw.trim();
	if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(trimmed)) return trimmed || 'Unknown';
	return trimmed.split('.').filter(Boolean).pop()?.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? trimmed;
}

function addStat(row: HTMLElement, label: string, value: string): void {
	const stat = row.createDiv({ cls: 'timemd-stat' });
	stat.createDiv({ cls: 'timemd-stat-label', text: label });
	stat.createDiv({ cls: 'timemd-stat-value', text: value });
}

function filterDays(trend: TrendPoint[], days?: number): TrendPoint[] {
	if (!days || days <= 0 || trend.length <= days) return trend;
	return trend.slice(-days);
}
