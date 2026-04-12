import { WorkspaceLeaf } from 'obsidian';
import { getHeatmapRgb, renderHeatmap } from '../charts';
import { formatDateISO, formatDuration } from '../utils';
import { TimeMdBaseView, TimeMdHost } from './base';

export const VIEW_TYPE_CALENDAR = 'timemd-calendar';

export class CalendarView extends TimeMdBaseView {
	constructor(leaf: WorkspaceLeaf, host: TimeMdHost) {
		super(leaf, host);
	}

	getViewType(): string {
		return VIEW_TYPE_CALENDAR;
	}

	getDisplayText(): string {
		return 'time.md — Calendar';
	}

	renderBody(body: HTMLElement): void {
		const store = this.host.store;
		const heatmap = store.getHeatmap();
		const trend = store.getTrend();

		const heatCard = body.createDiv({ cls: 'timemd-card' });
		heatCard.createEl('h3', { text: 'Weekly heatmap' });
		if (heatmap.length === 0) {
			heatCard.createDiv({ cls: 'timemd-empty-inline', text: 'No heatmap section in the loaded exports.' });
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

		const monthCard = body.createDiv({ cls: 'timemd-card' });
		monthCard.createEl('h3', { text: 'Month grid' });
		if (trend.length === 0) {
			monthCard.createDiv({ cls: 'timemd-empty-inline', text: 'No trend data for month grid.' });
			return;
		}

		const max = Math.max(1, ...trend.map((t) => t.total_seconds));
		const byKey = new Map<string, number>();
		for (const t of trend) byKey.set(formatDateISO(t.date), t.total_seconds);

		const first = trend[0]!.date;
		const last = trend[trend.length - 1]!.date;
		const startMonth = new Date(first.getFullYear(), first.getMonth(), 1);
		const endMonth = new Date(last.getFullYear(), last.getMonth(), 1);

		const monthsWrap = monthCard.createDiv({ cls: 'timemd-months' });
		const cursor = new Date(startMonth);
		while (cursor <= endMonth) {
			renderMonth(monthsWrap, cursor, byKey, max);
			cursor.setMonth(cursor.getMonth() + 1);
		}
	}
}

function renderMonth(parent: HTMLElement, month: Date, data: Map<string, number>, max: number): void {
	const monthEl = parent.createDiv({ cls: 'timemd-month' });
	const monthName = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
	monthEl.createDiv({ cls: 'timemd-month-title', text: monthName });

	const daysEl = monthEl.createDiv({ cls: 'timemd-month-grid' });
	for (const label of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) {
		daysEl.createDiv({ cls: 'timemd-month-dow', text: label });
	}

	const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
	const lastOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0);
	const startOffset = (firstOfMonth.getDay() + 6) % 7;
	for (let i = 0; i < startOffset; i++) daysEl.createDiv({ cls: 'timemd-month-day timemd-month-day-empty' });

	const rgb = getHeatmapRgb();
	for (let d = 1; d <= lastOfMonth.getDate(); d++) {
		const date = new Date(month.getFullYear(), month.getMonth(), d);
		const key = formatDateISO(date);
		const v = data.get(key) ?? 0;
		const intensity = v / max;
		const dayEl = daysEl.createDiv({ cls: 'timemd-month-day' });
		dayEl.setAttribute('title', `${key} — ${formatDuration(v)}`);
		dayEl.style.background = `rgba(${rgb}, ${0.08 + intensity * 0.92})`;
		dayEl.createDiv({ cls: 'timemd-month-day-num', text: String(d) });
	}
}

function clamp(n: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, n));
}
