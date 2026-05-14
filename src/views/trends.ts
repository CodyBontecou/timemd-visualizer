import { WorkspaceLeaf } from 'obsidian';
import { renderLineChart } from '../charts';
import { formatDateISO, formatDuration } from '../utils';
import { TimeMdBaseView, TimeMdHost } from './base';

export const VIEW_TYPE_TRENDS = 'timemd-trends';

export class TrendsView extends TimeMdBaseView {
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

		const total = trend.reduce((a, b) => a + b.total_seconds, 0);
		const avg = total / trend.length;
		const peak = trend.reduce((max, t) => (t.total_seconds > max.total_seconds ? t : max), trend[0]!);

		const statsRow = body.createDiv({ cls: 'timemd-stats-row' });
		addStat(statsRow, 'Period total', formatDuration(total));
		addStat(statsRow, 'Daily average', formatDuration(avg));
		addStat(statsRow, 'Peak day', `${formatDateISO(peak.date)} · ${formatDuration(peak.total_seconds)}`);
		addStat(statsRow, 'Days', String(trend.length));

		const chartCard = body.createDiv({ cls: 'timemd-card' });
		chartCard.createEl('h3', { text: 'Daily usage' });
		renderLineChart(
			chartCard,
			trend.map((t) => ({ label: formatDateISO(t.date).slice(5), value: t.total_seconds })),
			{ height: 280 },
		);

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

function addStat(row: HTMLElement, label: string, value: string): void {
	const stat = row.createDiv({ cls: 'timemd-stat' });
	stat.createDiv({ cls: 'timemd-stat-label', text: label });
	stat.createDiv({ cls: 'timemd-stat-value', text: value });
}
