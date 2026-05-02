import { MarkdownRenderChild } from 'obsidian';
import { renderBarList, renderHeatmap, renderHourStrip, renderLineChart } from './charts';
import { DataStore } from './store';
import { AppRow, TrendPoint } from './types';
import { formatDateISO, formatDuration } from './utils';
import { TimeMdHost } from './views/base';

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
	| 'details';

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
	metric?: StatMetric;
	title?: string;
	sections?: OverviewSection[];
	date?: Date;
}

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
		renderEmbed(this.containerEl, this.host.store, this.params);
	}
}

export function renderEmbed(el: HTMLElement, store: DataStore, params: BlockParams): void {
	el.addClass('timemd-embed');
	if (!store.hasData()) {
		el.createDiv({
			cls: 'timemd-embed-empty',
			text:
				store.lastError ??
				'time.md: no exports loaded. Set the export folder in plugin settings and click Reload.',
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

function addStat(row: HTMLElement, label: string, value: string): void {
	const stat = row.createDiv({ cls: 'timemd-stat' });
	stat.createDiv({ cls: 'timemd-stat-label', text: label });
	stat.createDiv({ cls: 'timemd-stat-value', text: value });
}

function filterDays(trend: TrendPoint[], days?: number): TrendPoint[] {
	if (!days || days <= 0 || trend.length <= days) return trend;
	return trend.slice(-days);
}
