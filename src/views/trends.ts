import { WorkspaceLeaf } from 'obsidian';
import { colorForLabel, renderLineChart, renderStackedBarChart, renderVerticalBarChart, StackedBarRow } from '../charts';
import { DailyAppTrendRow, SessionRow, TrendPoint } from '../types';
import { formatDateISO, formatDuration } from '../utils';
import { TimeMdBaseView, TimeMdHost } from './base';

export const VIEW_TYPE_TRENDS = 'timemd-trends';

type TrendMode = 'total' | 'stacked' | 'hourly';

export class TrendsView extends TimeMdBaseView {
	private mode: TrendMode | null = null;

	constructor(leaf: WorkspaceLeaf, host: TimeMdHost) {
		super(leaf, host);
	}

	getViewType(): string {
		return VIEW_TYPE_TRENDS;
	}

	getDisplayText(): string {
		return 'Trends';
	}

	renderBody(body: HTMLElement): void {
		const trend = this.host.store.getTrend();
		if (trend.length === 0) {
			body.createDiv({ cls: 'timemd-empty-inline', text: 'No trend data in the loaded exports.' });
			return;
		}

		const sessions = this.host.store.getSessions();
		const dailyApps = this.host.store.getDailyAppTrend();
		const effectiveMode = this.mode ?? defaultMode(trend, sessions);
		const totalDays = countTrendDays(trend);
		const total = trend.reduce((a, b) => a + b.total_seconds, 0);
		const avg = total / trend.length;
		const peak = trend.reduce((max, t) => (t.total_seconds > max.total_seconds ? t : max), trend[0]!);
		const hourly = buildHourlyTotals(sessions);
		const peakHour = hourly.reduce((best, value, hour) => (value > best.value ? { hour, value } : best), { hour: 0, value: 0 });

		const statsRow = body.createDiv({ cls: 'timemd-stats-row' });
		addStat(statsRow, 'Period total', formatDuration(total));
		addStat(statsRow, 'Daily average', formatDuration(avg));
		addStat(statsRow, 'Peak day', `${formatDateISO(peak.date)} · ${formatDuration(peak.total_seconds)}`);
		addStat(statsRow, 'Peak hour', peakHour.value > 0 ? `${formatHour(peakHour.hour)} · ${formatDuration(peakHour.value)}` : '—');
		addStat(statsRow, 'Days', String(trend.length));

		const controls = body.createDiv({ cls: 'timemd-segmented' });
		for (const opt of [
			{ id: 'total' as TrendMode, label: 'Total' },
			{ id: 'stacked' as TrendMode, label: 'By app' },
			{ id: 'hourly' as TrendMode, label: 'Hourly' },
		]) {
			const btn = controls.createEl('button', {
				cls: 'timemd-segmented-btn' + (effectiveMode === opt.id ? ' is-active' : ''),
				text: opt.label,
			});
			btn.addEventListener('click', () => {
				this.mode = opt.id;
				this.refresh();
			});
		}

		const chartCard = body.createDiv({ cls: 'timemd-card' });
		if (effectiveMode === 'stacked') {
			chartCard.createEl('h3', { text: 'Daily usage by app' });
			const rows = buildStackedRows(dailyApps, trend, totalDays);
			if (rows.length === 0) {
				chartCard.createDiv({ cls: 'timemd-empty-inline', text: 'By-app trends require the Raw Sessions section in your export.' });
			} else {
				renderStackedBarChart(chartCard, rows, { height: totalDays > 120 ? 320 : 300, formatValue: formatDuration, maxLabels: totalDays > 120 ? 12 : 8 });
				renderLegend(chartCard, rows.flatMap((r) => r.segments.map((s) => s.label)));
			}
		} else if (effectiveMode === 'hourly') {
			chartCard.createEl('h3', { text: 'Hourly usage' });
			if (sessions.length === 0) {
				chartCard.createDiv({ cls: 'timemd-empty-inline', text: 'Hourly trends require the Raw Sessions section in your export.' });
			} else {
				renderVerticalBarChart(
					chartCard,
					hourly.map((value, hour) => ({ label: formatHourShort(hour), value })),
					{ height: 280, formatValue: formatDuration, maxLabels: 8 },
				);
			}
		} else {
			chartCard.createEl('h3', { text: 'Daily usage' });
			renderLineChart(
				chartCard,
				trend.map((t) => ({ label: formatTrendLabel(t.date, totalDays), value: t.total_seconds })),
				{ height: totalDays > 120 ? 300 : 280, maxLabels: totalDays > 120 ? 12 : 8 },
			);
		}

		if (dailyApps.length > 0) {
			const rankingCard = body.createDiv({ cls: 'timemd-card' });
			rankingCard.createEl('h3', { text: 'Top apps by day' });
			renderTopAppsByDay(rankingCard, buildTopAppsByDay(dailyApps, trend, 3));
		}

		const tableCard = body.createDiv({ cls: 'timemd-card' });
		tableCard.createEl('h3', { text: 'Daily breakdown' });
		const table = tableCard.createEl('table', { cls: 'timemd-table' });
		const head = table.createEl('thead').createEl('tr');
		head.createEl('th', { text: 'Date' });
		head.createEl('th', { text: 'Duration' });
		const tbody = table.createEl('tbody');
		for (const row of trend) {
			const tr = tbody.createEl('tr');
			tr.createEl('td', { text: formatDateISO(row.date) });
			tr.createEl('td', { text: formatDuration(row.total_seconds) });
		}
	}
}

function buildHourlyTotals(sessions: SessionRow[]): number[] {
	const out = Array<number>(24).fill(0);
	for (const s of sessions) {
		let cursor = new Date(s.start_time);
		const end = s.end_time > s.start_time
			? s.end_time
			: new Date(s.start_time.getTime() + s.duration_seconds * 1000);
		while (cursor < end) {
			const nextHour = new Date(cursor);
			nextHour.setMinutes(0, 0, 0);
			nextHour.setHours(nextHour.getHours() + 1);
			const segmentEnd = nextHour < end ? nextHour : end;
			const seconds = Math.max(0, (segmentEnd.getTime() - cursor.getTime()) / 1000);
			const hour = Math.max(0, Math.min(23, cursor.getHours()));
			out[hour] = (out[hour] ?? 0) + seconds;
			cursor = segmentEnd;
		}
	}
	return out;
}

function buildStackedRows(dailyApps: DailyAppTrendRow[], trend: TrendPoint[], totalDays: number): StackedBarRow[] {
	if (dailyApps.length === 0) return [];
	const topApps = topAppNames(dailyApps, 5);
	const dayMap = new Map<string, Map<string, number>>();
	for (const app of dailyApps) {
		const day = formatDateISO(app.date);
		const bucket = topApps.includes(app.app_name) ? app.app_name : 'Other';
		const row = dayMap.get(day) ?? new Map<string, number>();
		row.set(bucket, (row.get(bucket) ?? 0) + app.total_seconds);
		dayMap.set(day, row);
	}
	const dayKeys = trend.length > 0
		? trend.map((t) => formatDateISO(t.date))
		: [...dayMap.keys()].sort();
	return dayKeys.map((day) => {
		const row = dayMap.get(day) ?? new Map<string, number>();
		const labels = [...topApps, 'Other'];
		return {
			label: formatTrendKey(day, totalDays),
			segments: labels
				.map((label) => ({ label, value: row.get(label) ?? 0, color: colorForLabel(label) }))
				.filter((seg) => seg.value > 0),
		};
	}).filter((row) => row.segments.length > 0);
}

function topAppNames(dailyApps: DailyAppTrendRow[], limit: number): string[] {
	const totals = new Map<string, number>();
	for (const app of dailyApps) totals.set(app.app_name, (totals.get(app.app_name) ?? 0) + app.total_seconds);
	return [...totals.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([name]) => name);
}

interface TopAppsByDayRow {
	date: Date;
	apps: Array<{ app_name: string; total_seconds: number }>;
}

function defaultMode(trend: TrendPoint[], sessions: SessionRow[]): TrendMode {
	if (sessions.length === 0) return 'total';
	const days = countTrendDays(trend);
	if (days <= 1) return 'hourly';
	if (days <= 92) return 'stacked';
	return 'total';
}

function countTrendDays(trend: TrendPoint[]): number {
	if (trend.length === 0) return 0;
	const start = startOfDay(trend[0]!.date);
	const end = startOfDay(trend[trend.length - 1]!.date);
	return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function formatTrendLabel(date: Date, totalDays: number): string {
	if (totalDays > 370) return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
	if (totalDays > 120) return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	return formatDateISO(date).slice(5);
}

function formatTrendKey(day: string, totalDays: number): string {
	const date = dateFromKey(day);
	return formatTrendLabel(date, totalDays);
}

function buildTopAppsByDay(dailyApps: DailyAppTrendRow[], trend: TrendPoint[], limit: number): TopAppsByDayRow[] {
	const grouped = new Map<string, Array<{ app_name: string; total_seconds: number }>>();
	for (const app of dailyApps) {
		const key = formatDateISO(app.date);
		const rows = grouped.get(key) ?? [];
		rows.push({ app_name: app.app_name, total_seconds: app.total_seconds });
		grouped.set(key, rows);
	}
	const days = trend.length > 0
		? trend.map((t) => formatDateISO(t.date))
		: [...grouped.keys()].sort();
	return days.map((day) => ({
		date: dateFromKey(day),
		apps: (grouped.get(day) ?? [])
			.sort((a, b) => b.total_seconds - a.total_seconds)
			.slice(0, limit),
	})).filter((row) => row.apps.length > 0);
}

function renderTopAppsByDay(parent: HTMLElement, rows: TopAppsByDayRow[]): void {
	if (rows.length === 0) {
		parent.createDiv({ cls: 'timemd-empty-inline', text: 'Top-apps-by-day requires the Raw Sessions section in your export.' });
		return;
	}
	const wrap = parent.createDiv({ cls: 'timemd-top-apps-by-day' });
	for (const row of rows) {
		const item = wrap.createDiv({ cls: 'timemd-top-app-day-row' });
		item.createDiv({ cls: 'timemd-top-app-day-date', text: formatDateISO(row.date) });
		const apps = item.createDiv({ cls: 'timemd-top-app-day-apps' });
		for (let i = 0; i < row.apps.length; i++) {
			const app = row.apps[i]!;
			const chip = apps.createDiv({ cls: 'timemd-top-app-chip' });
			const dot = chip.createSpan({ cls: 'timemd-chart-legend-dot' });
			dot.style.background = colorForLabel(app.app_name);
			chip.createSpan({ text: `${i + 1}. ${app.app_name}` });
			chip.createSpan({ cls: 'timemd-top-app-chip-value', text: formatDuration(app.total_seconds) });
			chip.setAttribute('title', `${formatDateISO(row.date)} · #${i + 1} ${app.app_name}: ${formatDuration(app.total_seconds)}`);
		}
	}
}

function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateFromKey(key: string): Date {
	const [year, month, day] = key.split('-').map((part) => Number(part));
	return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function renderLegend(parent: HTMLElement, labels: string[]): void {
	const unique = [...new Set(labels)].filter((label) => label !== 'Other' || labels.includes('Other'));
	if (unique.length === 0) return;
	const legend = parent.createDiv({ cls: 'timemd-chart-legend' });
	for (const label of unique) {
		const item = legend.createDiv({ cls: 'timemd-chart-legend-item' });
		const dot = item.createSpan({ cls: 'timemd-chart-legend-dot' });
		dot.style.background = colorForLabel(label);
		item.createSpan({ text: label });
	}
}

function formatHour(hour: number): string {
	if (hour === 0) return '12 AM';
	if (hour < 12) return `${hour} AM`;
	if (hour === 12) return '12 PM';
	return `${hour - 12} PM`;
}

function formatHourShort(hour: number): string {
	if (hour === 0) return '12a';
	if (hour < 12) return `${hour}a`;
	if (hour === 12) return '12p';
	return `${hour - 12}p`;
}

function addStat(row: HTMLElement, label: string, value: string): void {
	const stat = row.createDiv({ cls: 'timemd-stat' });
	stat.createDiv({ cls: 'timemd-stat-label', text: label });
	stat.createDiv({ cls: 'timemd-stat-value', text: value });
}
