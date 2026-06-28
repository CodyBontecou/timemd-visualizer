import { WorkspaceLeaf } from 'obsidian';
import { colorForLabel, renderLineChart, renderStackedBarChart, renderVerticalBarChart, StackedBarRow } from '../charts';
import { SessionRow, TrendPoint } from '../types';
import { formatDateISO, formatDuration } from '../utils';
import { TimeMdBaseView, TimeMdHost } from './base';

export const VIEW_TYPE_TRENDS = 'timemd-trends';

type TrendMode = 'total' | 'stacked' | 'hourly';

export class TrendsView extends TimeMdBaseView {
	private mode: TrendMode = 'total';

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
				cls: 'timemd-segmented-btn' + (this.mode === opt.id ? ' is-active' : ''),
				text: opt.label,
			});
			btn.addEventListener('click', () => {
				this.mode = opt.id;
				this.refresh();
			});
		}

		const chartCard = body.createDiv({ cls: 'timemd-card' });
		if (this.mode === 'stacked') {
			chartCard.createEl('h3', { text: 'Daily usage by app' });
			const rows = buildStackedRows(sessions, trend);
			if (rows.length === 0) {
				chartCard.createDiv({ cls: 'timemd-empty-inline', text: 'By-app trends require the Raw Sessions section in your export.' });
			} else {
				renderStackedBarChart(chartCard, rows, { height: 300, formatValue: formatDuration });
				renderLegend(chartCard, rows.flatMap((r) => r.segments.map((s) => s.label)));
			}
		} else if (this.mode === 'hourly') {
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
				trend.map((t) => ({ label: formatDateISO(t.date).slice(5), value: t.total_seconds })),
				{ height: 280 },
			);
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

function buildStackedRows(sessions: SessionRow[], trend: TrendPoint[]): StackedBarRow[] {
	if (sessions.length === 0) return [];
	const topApps = topAppNames(sessions, 5);
	const dayMap = new Map<string, Map<string, number>>();
	for (const s of sessions) {
		const day = formatDateISO(s.start_time);
		const bucket = topApps.includes(s.app_name) ? s.app_name : 'Other';
		const row = dayMap.get(day) ?? new Map<string, number>();
		row.set(bucket, (row.get(bucket) ?? 0) + s.duration_seconds);
		dayMap.set(day, row);
	}
	const dayKeys = trend.length > 0
		? trend.map((t) => formatDateISO(t.date))
		: [...dayMap.keys()].sort();
	return dayKeys.map((day) => {
		const row = dayMap.get(day) ?? new Map<string, number>();
		const labels = [...topApps, 'Other'];
		return {
			label: day.slice(5),
			segments: labels
				.map((label) => ({ label, value: row.get(label) ?? 0, color: colorForLabel(label) }))
				.filter((seg) => seg.value > 0),
		};
	}).filter((row) => row.segments.length > 0);
}

function topAppNames(sessions: SessionRow[], limit: number): string[] {
	const totals = new Map<string, number>();
	for (const s of sessions) totals.set(s.app_name, (totals.get(s.app_name) ?? 0) + s.duration_seconds);
	return [...totals.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([name]) => name);
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
