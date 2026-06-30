import { WorkspaceLeaf } from 'obsidian';
import { renderBarList, renderHeatmap, renderLineChart, renderVerticalBarChart } from '../charts';
import { Row } from '../types';
import { formatDuration, formatDateISO, parseDate } from '../utils';
import { TimeMdBaseView, TimeMdHost } from './base';
import { renderDistributionEmbed } from './projects';

function formatRange(range: { start: Date; end: Date } | null): string {
	if (!range) return '—';
	const start = formatDateISO(range.start);
	const end = formatDateISO(range.end);
	return start === end ? start : `${start} → ${end}`;
}

export const VIEW_TYPE_OVERVIEW = 'timemd-overview';

export class OverviewView extends TimeMdBaseView {
	constructor(leaf: WorkspaceLeaf, host: TimeMdHost) {
		super(leaf, host);
	}

	getViewType(): string {
		return VIEW_TYPE_OVERVIEW;
	}

	getDisplayText(): string {
		return 'Overview';
	}

	renderBody(body: HTMLElement): void {
		const store = this.host.store;
		const totalSeconds = store.getTotalSeconds();
		const apps = store.getApps();
		const trend = store.getTrend();
		const heatmap = store.getHeatmap();
		const range = store.getDateRange();

		const sessions = store.getSessions();
		const longest = sessions.reduce((best, s) => (best && best.duration_seconds >= s.duration_seconds ? best : s), sessions[0]);
		const peakHour = getPeakHour(heatmap);
		const dailyAverage = trend.length > 0 ? totalSeconds / trend.length : 0;

		const statsRow = body.createDiv({ cls: 'timemd-stats-row' });
		addStat(statsRow, 'Total time', formatDuration(totalSeconds));
		addStat(statsRow, 'Daily avg', formatDuration(dailyAverage));
		addStat(statsRow, 'Peak hour', peakHour ? `${formatHour(peakHour.hour)} · ${formatDuration(peakHour.seconds)}` : '—');
		addStat(statsRow, 'Top app', apps[0]?.app_name ?? '—');
		addStat(statsRow, 'Longest session', longest ? `${longest.app_name} · ${formatDuration(longest.duration_seconds)}` : '—');
		addStat(statsRow, 'Date range', formatRange(range));

		const dashboard = body.createDiv({ cls: 'timemd-overview-grid' });

		const trendCard = dashboard.createDiv({ cls: 'timemd-card' });
		trendCard.createEl('h3', { text: 'Time trend' });
		renderLineChart(
			trendCard,
			trend.map((t) => ({ label: formatDateISO(t.date).slice(5), value: t.total_seconds })),
		);

		const distCard = dashboard.createDiv({ cls: 'timemd-card timemd-overview-distribution' });
		distCard.createEl('h3', { text: 'Distribution' });
		renderDistributionEmbed(distCard, store, { stats: false, legend: true, label: false });

		const heatCard = dashboard.createDiv({ cls: 'timemd-card' });
		heatCard.createEl('h3', { text: 'Weekly heatmap' });
		if (heatmap.length === 0) {
			heatCard.createDiv({
				cls: 'timemd-empty-inline',
				text: 'No heatmap section in the loaded exports.',
			});
		} else {
			const grid: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
			for (const cell of heatmap) {
				const d = clamp(cell.weekday - 1, 0, 6);
				const h = clamp(cell.hour, 0, 23);
				const row = grid[d]!;
				row[h] = (row[h] ?? 0) + cell.total_seconds;
			}
			renderHeatmap(heatCard, grid, { formatValue: formatDuration });
		}

		const topAppsCard = dashboard.createDiv({ cls: 'timemd-card' });
		topAppsCard.createEl('h3', { text: 'Top apps' });
		renderBarList(
			topAppsCard,
			apps.slice(0, 10).map((a) => ({ label: a.app_name, value: a.total_seconds })),
			{ formatValue: formatDuration, showPercent: true },
		);

		const browsingRows: Row[] = [];
		for (const section of store.allSections('browsing_history')) {
			browsingRows.push(...section.rows);
		}
		const webStats = collectWebStats(browsingRows);
		if (webStats.totalVisits > 0) {
			const webCard = body.createDiv({ cls: 'timemd-card' });
			webCard.createEl('h3', { text: 'Web history overview' });
			const webStatsRow = webCard.createDiv({ cls: 'timemd-stats-row timemd-overview-web-stats' });
			addStat(webStatsRow, 'Visits', webStats.totalVisits.toLocaleString());
			addStat(webStatsRow, 'Domains', String(webStats.domains));
			addStat(webStatsRow, 'Daily avg', String(webStats.dailyAverage));
			addStat(webStatsRow, 'Peak hour', formatHour(webStats.peakHour));
			renderVerticalBarChart(
				webCard,
				webStats.hourly.map((value, hour) => ({ label: formatHourShort(hour), value })),
				{ height: 180, formatValue: (v) => `${v} visits`, formatAxis: (v) => String(Math.round(v)), maxLabels: 8 },
			);
		}
	}
}

function clamp(n: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, n));
}

function getPeakHour(heatmap: Array<{ hour: number; total_seconds: number }>): { hour: number; seconds: number } | null {
	if (heatmap.length === 0) return null;
	const hours = Array<number>(24).fill(0);
	for (const cell of heatmap) {
		const h = clamp(cell.hour, 0, 23);
		hours[h] = (hours[h] ?? 0) + cell.total_seconds;
	}
	let bestHour = 0;
	let bestSeconds = 0;
	for (let h = 0; h < hours.length; h++) {
		const seconds = hours[h] ?? 0;
		if (seconds > bestSeconds) {
			bestHour = h;
			bestSeconds = seconds;
		}
	}
	return bestSeconds > 0 ? { hour: bestHour, seconds: bestSeconds } : null;
}

interface WebStats {
	totalVisits: number;
	domains: number;
	dailyAverage: number;
	peakHour: number;
	hourly: number[];
}

function collectWebStats(rows: Row[]): WebStats {
	const domains = new Set<string>();
	const days = new Set<string>();
	const hourly = Array<number>(24).fill(0);
	let totalVisits = 0;
	for (const row of rows) {
		const ts = parseDate(row['visit_time']);
		if (!ts) continue;
		totalVisits += 1;
		const domain = String(row['domain'] ?? '').trim();
		if (domain) domains.add(domain);
		days.add(formatDateISO(ts));
		const h = ts.getHours();
		if (h >= 0 && h < 24) hourly[h] = (hourly[h] ?? 0) + 1;
	}
	let peakHour = 0;
	let peakCount = -1;
	for (let h = 0; h < 24; h++) {
		const count = hourly[h] ?? 0;
		if (count > peakCount) {
			peakHour = h;
			peakCount = count;
		}
	}
	return {
		totalVisits,
		domains: domains.size,
		dailyAverage: totalVisits > 0 ? Math.round(totalVisits / Math.max(1, days.size)) : 0,
		peakHour,
		hourly,
	};
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
