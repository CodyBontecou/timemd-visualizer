import { WorkspaceLeaf } from 'obsidian';
import { DayAnnotation, getHeatmapRgb, renderContributionHeatmap, renderDateHourHeatmap, renderHeatmap } from '../charts';
import { ContextSwitchRow, FocusBlockRow, SessionRow, TrendPoint } from '../types';
import { formatDateISO, formatDuration } from '../utils';
import { TimeMdBaseView, TimeMdHost } from './base';

export const VIEW_TYPE_CALENDAR = 'timemd-calendar';

export class CalendarView extends TimeMdBaseView {
	private selectedDate: string | null = null;

	constructor(leaf: WorkspaceLeaf, host: TimeMdHost) {
		super(leaf, host);
	}

	getViewType(): string {
		return VIEW_TYPE_CALENDAR;
	}

	getDisplayText(): string {
		return 'Calendar';
	}

	renderBody(body: HTMLElement): void {
		const store = this.host.store;
		const heatmap = store.getHeatmap();
		const trend = store.getTrend();
		const sessions = store.getSessions();
		const dateHour = store.getDateHourHeatmap();
		const contextSwitches = store.getContextSwitches();
		const focusBlocks = store.getFocusBlocks();
		const dayAnnotations = buildDayAnnotations(contextSwitches, focusBlocks);

		if (trend.length > 0) {
			const total = trend.reduce((sum, t) => sum + t.total_seconds, 0);
			const activeDays = trend.filter((t) => t.total_seconds > 0).length;
			const peak = trend.reduce((best, t) => (best.total_seconds >= t.total_seconds ? best : t), trend[0]!);
			const statsRow = body.createDiv({ cls: 'timemd-stats-row' });
			addStat(statsRow, 'Total time', formatDuration(total));
			addStat(statsRow, 'Active days', String(activeDays));
			addStat(statsRow, 'Daily avg', formatDuration(total / Math.max(1, trend.length)));
			addStat(statsRow, 'Peak day', `${formatDateISO(peak.date)} · ${formatDuration(peak.total_seconds)}`);
		}

		if (this.selectedDate) {
			renderDayDetail(body, this.selectedDate, trend, sessions, contextSwitches, focusBlocks);
		}

		const contributionCard = body.createDiv({ cls: 'timemd-card' });
		contributionCard.createEl('h3', { text: 'Daily contribution heatmap' });
		if (trend.length === 0) {
			contributionCard.createDiv({ cls: 'timemd-empty-inline', text: 'No trend data for contribution heatmap.' });
		} else {
			renderIntensityLegend(contributionCard);
			renderContributionHeatmap(
				contributionCard,
				trend.map((t) => ({ date: t.date, value: t.total_seconds })),
				{
					formatValue: formatDuration,
					dayAnnotations,
					selectedDate: this.selectedDate,
					onDayClick: (date) => {
						this.selectedDate = formatDateISO(date);
						this.refresh();
					},
				},
			);
		}

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

		const dateHourCard = body.createDiv({ cls: 'timemd-card' });
		dateHourCard.createEl('h3', { text: 'Date × hour heatmap' });
		if (sessions.length === 0 || dateHour.length === 0) {
			dateHourCard.createDiv({ cls: 'timemd-empty-inline', text: 'Date × hour activity requires the Raw Sessions section in your export.' });
		} else {
			renderDateHourHeatmap(dateHourCard, dateHour, {
				formatValue: formatDuration,
				start: trend[0]?.date,
				end: trend[trend.length - 1]?.date,
				dayAnnotations,
			});
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

		renderIntensityLegend(monthCard);

		const monthsWrap = monthCard.createDiv({ cls: 'timemd-months' });
		const cursor = new Date(startMonth);
		while (cursor <= endMonth) {
			renderMonth(monthsWrap, cursor, byKey, max, dayAnnotations, this.selectedDate, (key) => {
				this.selectedDate = key;
				this.refresh();
			});
			cursor.setMonth(cursor.getMonth() + 1);
		}
	}
}

function renderMonth(
	parent: HTMLElement,
	month: Date,
	data: Map<string, number>,
	max: number,
	dayAnnotations: Map<string, DayAnnotation>,
	selectedDate: string | null,
	onDayClick: (key: string) => void,
): void {
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
		const annotation = dayAnnotations.get(key);
		const classes = [
			'timemd-month-day',
			annotation?.highContextSwitches !== undefined ? 'has-high-context' : '',
			annotation?.focusBlocks !== undefined ? 'has-focus-block' : '',
			selectedDate === key ? 'is-selected' : '',
		].filter(Boolean).join(' ');
		const dayEl = daysEl.createDiv({ cls: classes });
		dayEl.setAttribute('title', [`${key} — ${formatDuration(v)}`, ...formatAnnotationLines(annotation)].join('\n'));
		dayEl.style.background = `rgba(${rgb}, ${0.08 + intensity * 0.92})`;
		dayEl.addEventListener('click', () => onDayClick(key));
		dayEl.createDiv({ cls: 'timemd-month-day-num', text: String(d) });
		if (annotation?.focusBlocks !== undefined) dayEl.createDiv({ cls: 'timemd-month-day-dot' });
	}
}

function buildDayAnnotations(
	contextSwitches: ContextSwitchRow[],
	focusBlocks: FocusBlockRow[],
): Map<string, DayAnnotation> {
	const switchTotals = new Map<string, number>();
	for (const row of contextSwitches) {
		switchTotals.set(row.date, (switchTotals.get(row.date) ?? 0) + row.switch_count);
	}
	const positiveSwitchDays = [...switchTotals.values()].filter((value) => value > 0).sort((a, b) => a - b);
	const switchThreshold = positiveSwitchDays.length > 0
		? positiveSwitchDays[Math.max(0, Math.ceil(positiveSwitchDays.length * 0.75) - 1)] ?? 0
		: 0;

	const focusTotals = new Map<string, number>();
	for (const block of focusBlocks) {
		const key = formatDateISO(block.start_time);
		focusTotals.set(key, (focusTotals.get(key) ?? 0) + 1);
	}

	const out = new Map<string, DayAnnotation>();
	for (const [date, count] of switchTotals) {
		if (count <= 0 || count < switchThreshold) continue;
		out.set(date, { ...out.get(date), highContextSwitches: count });
	}
	for (const [date, count] of focusTotals) {
		if (count <= 0) continue;
		out.set(date, { ...out.get(date), focusBlocks: count });
	}
	return out;
}

function renderDayDetail(
	body: HTMLElement,
	dateKey: string,
	trend: TrendPoint[],
	sessions: SessionRow[],
	contextSwitches: ContextSwitchRow[],
	focusBlocks: FocusBlockRow[],
): void {
	const card = body.createDiv({ cls: 'timemd-card timemd-calendar-day-detail' });
	const header = card.createDiv({ cls: 'timemd-calendar-day-detail-header' });
	header.createEl('h3', { text: `Day detail · ${dateKey}` });
	const totalSeconds = trend.find((point) => formatDateISO(point.date) === dateKey)?.total_seconds ?? 0;
	const daySessions = sessions
		.filter((session) => formatDateISO(session.start_time) === dateKey)
		.sort((a, b) => b.duration_seconds - a.duration_seconds);
	const switchCount = contextSwitches
		.filter((row) => row.date === dateKey)
		.reduce((sum, row) => sum + row.switch_count, 0);
	const dayFocusBlocks = focusBlocks.filter((block) => formatDateISO(block.start_time) === dateKey);

	const stats = card.createDiv({ cls: 'timemd-stats-row' });
	addStat(stats, 'Total time', formatDuration(totalSeconds));
	addStat(stats, 'Sessions', daySessions.length.toLocaleString());
	addStat(stats, 'Context switches', switchCount > 0 ? switchCount.toLocaleString() : '—');
	addStat(stats, 'Focus blocks', dayFocusBlocks.length > 0 ? dayFocusBlocks.length.toLocaleString() : '—');

	if (daySessions.length === 0 && dayFocusBlocks.length === 0 && switchCount === 0 && totalSeconds === 0) {
		card.createDiv({ cls: 'timemd-empty-inline', text: 'No detail rows are available for this date.' });
		return;
	}

	if (daySessions.length > 0) {
		card.createDiv({ cls: 'timemd-calendar-detail-subtitle', text: 'Longest sessions' });
		const list = card.createEl('ul', { cls: 'timemd-session-list timemd-calendar-session-list' });
		for (const session of daySessions.slice(0, 8)) {
			const item = list.createEl('li', { cls: 'timemd-session-item' });
			item.createSpan({ cls: 'timemd-session-app', text: session.app_name });
			item.createSpan({ cls: 'timemd-session-sep', text: ' · ' });
			item.createSpan({ cls: 'timemd-session-duration', text: formatDuration(session.duration_seconds) });
		}
	}
}

function formatAnnotationLines(annotation: DayAnnotation | undefined): string[] {
	if (!annotation) return [];
	const lines: string[] = [];
	if (annotation.highContextSwitches !== undefined) {
		lines.push(`High context switching: ${annotation.highContextSwitches.toLocaleString()} switches`);
	}
	if (annotation.focusBlocks !== undefined) {
		lines.push(`${annotation.focusBlocks.toLocaleString()} focus block${annotation.focusBlocks === 1 ? '' : 's'}`);
	}
	return lines;
}

function clamp(n: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, n));
}

function renderIntensityLegend(parent: HTMLElement): void {
	const legend = parent.createDiv({ cls: 'timemd-intensity-legend' });
	legend.createSpan({ cls: 'timemd-intensity-legend-label', text: 'Less' });
	const rgb = getHeatmapRgb();
	for (let i = 0; i < 5; i++) {
		const swatch = legend.createSpan({ cls: 'timemd-intensity-swatch' });
		swatch.style.background = `rgba(${rgb}, ${0.08 + (i / 4) * 0.92})`;
	}
	legend.createSpan({ cls: 'timemd-intensity-legend-label', text: 'More' });
}

function addStat(row: HTMLElement, label: string, value: string): void {
	const stat = row.createDiv({ cls: 'timemd-stat' });
	stat.createDiv({ cls: 'timemd-stat-label', text: label });
	stat.createDiv({ cls: 'timemd-stat-value', text: value });
}
