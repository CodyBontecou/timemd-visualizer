import { WorkspaceLeaf } from 'obsidian';
import { renderBarList, renderHeatmap, renderLineChart } from '../charts';
import { formatDuration, formatDateISO } from '../utils';
import { TimeMdBaseView, TimeMdHost } from './base';

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

		const statsRow = body.createDiv({ cls: 'timemd-stats-row' });
		addStat(statsRow, 'Total time', formatDuration(totalSeconds));
		addStat(statsRow, 'Top app', apps[0]?.app_name ?? '—');
		addStat(statsRow, 'Tracked apps', String(apps.length));
		addStat(statsRow, 'Date range', formatRange(range));

		const trendCard = body.createDiv({ cls: 'timemd-card' });
		trendCard.createEl('h3', { text: 'Trend' });
		renderLineChart(
			trendCard,
			trend.map((t) => ({ label: formatDateISO(t.date).slice(5), value: t.total_seconds })),
		);

		const heatCard = body.createDiv({ cls: 'timemd-card' });
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

		const topAppsCard = body.createDiv({ cls: 'timemd-card' });
		topAppsCard.createEl('h3', { text: 'Top apps' });
		renderBarList(
			topAppsCard,
			apps.slice(0, 10).map((a) => ({ label: a.app_name, value: a.total_seconds })),
			{ formatValue: formatDuration },
		);
	}
}

function clamp(n: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, n));
}

function addStat(row: HTMLElement, label: string, value: string): void {
	const stat = row.createDiv({ cls: 'timemd-stat' });
	stat.createDiv({ cls: 'timemd-stat-label', text: label });
	stat.createDiv({ cls: 'timemd-stat-value', text: value });
}
