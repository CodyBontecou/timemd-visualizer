import { WorkspaceLeaf } from 'obsidian';
import {
	AppHourHeatmapRow,
	ScatterPoint,
	StackedBarRow,
	colorForLabel,
	renderAppHourHeatmap,
	renderLineChart,
	renderScatterPlot,
	renderStackedBarChart,
	renderVerticalBarChart,
} from '../charts';
import { CategoryRow, ContextSwitchRow, DailyAppTrendRow, FocusBlockRow, MatrixCell, SessionRow, TrendPoint } from '../types';
import { formatDateISO, formatDuration } from '../utils';
import { TimeMdBaseView, TimeMdHost } from './base';

export const VIEW_TYPE_TRENDS = 'timemd-trends';

type TrendMode = 'total' | 'stacked' | 'hourly';
type DayArchetype = 'Deep work' | 'Comms-heavy' | 'Browsing-heavy' | 'Fragmented' | 'Low activity';

interface DayTopApp {
	app_name: string;
	total_seconds: number;
	share: number;
}

interface DayTopCategory {
	category: string;
	total_seconds: number;
	share: number;
}

interface DayArchetypeRow {
	date: Date;
	label: DayArchetype;
	activeSeconds: number;
	sessions: number;
	switchesPerHour: number;
	focusBlocks: number;
	topApp?: DayTopApp;
	topCategory?: DayTopCategory;
	reason: string;
}

interface CategoryBalanceResult {
	rows: StackedBarRow[];
	legendLabels: string[];
	note: string;
	exact: boolean;
}

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
		const contextSwitches = this.host.store.getContextSwitches();
		const focusBlocks = this.host.store.getFocusBlocks();
		const categories = this.host.store.getCategories();
		const dailyMatrix = this.host.store.getDailyMatrix();
		const hourlyMatrix = this.host.store.getHourlyMatrix();
		const categoryByDay = buildTopCategoryByDay(dailyMatrix, hourlyMatrix);
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

		const rhythmCard = body.createDiv({ cls: 'timemd-card timemd-trends-wide-card' });
		rhythmCard.createEl('h3', { text: 'App rhythm by hour' });
		const appHourRows = buildAppHourRows(sessions, 8);
		if (appHourRows.length === 0) {
			rhythmCard.createDiv({ cls: 'timemd-empty-inline', text: 'App rhythm requires the Raw Sessions section in your export.' });
		} else {
			renderAppHourHeatmap(rhythmCard, appHourRows, { formatValue: formatDuration });
			renderLegend(rhythmCard, appHourRows.map((row) => row.label));
		}

		const analyticsGrid = body.createDiv({ cls: 'timemd-columns' });
		const scatterCard = analyticsGrid.createDiv({ cls: 'timemd-card' });
		scatterCard.createEl('h3', { text: 'Focus vs fragmentation' });
		const scatter = buildScatterPoints(trend, sessions, contextSwitches, focusBlocks, dailyApps);
		renderScatterPlot(scatterCard, scatter.points, {
			height: 300,
			formatX: formatDuration,
			formatY: (v) => v.toFixed(v >= 10 ? 0 : 1),
			xLabel: 'Total active time',
			yLabel: 'Context switches/hour',
		});
		scatterCard.createDiv({ cls: 'timemd-card-note', text: `Bubble size is session count. Color shows ${scatter.colorMode}.` });

		const categoryCard = analyticsGrid.createDiv({ cls: 'timemd-card' });
		categoryCard.createEl('h3', { text: 'Category balance' });
		const categoryBalance = buildCategoryBalance(dailyMatrix, hourlyMatrix, categories, trend, totalDays);
		if (categoryBalance.rows.length === 0) {
			categoryCard.createDiv({ cls: 'timemd-empty-inline', text: 'No category data in the loaded exports.' });
		} else {
			renderStackedBarChart(categoryCard, categoryBalance.rows, { height: categoryBalance.exact ? 280 : 180, formatValue: formatDuration, maxLabels: totalDays > 120 ? 10 : 8 });
			renderLegend(categoryCard, categoryBalance.legendLabels);
			categoryCard.createDiv({ cls: 'timemd-card-note', text: categoryBalance.note });
		}

		const archetypeCard = body.createDiv({ cls: 'timemd-card timemd-trends-wide-card' });
		archetypeCard.createEl('h3', { text: 'Day archetypes' });
		renderDayArchetypes(archetypeCard, buildDayArchetypes(trend, sessions, contextSwitches, focusBlocks, dailyApps, categoryByDay));

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
		walkSessionByHour(s, (start, end) => {
			const seconds = Math.max(0, (end.getTime() - start.getTime()) / 1000);
			const hour = Math.max(0, Math.min(23, start.getHours()));
			out[hour] = (out[hour] ?? 0) + seconds;
		});
	}
	return out;
}

function buildAppHourRows(sessions: SessionRow[], limit: number): AppHourHeatmapRow[] {
	const byApp = new Map<string, number[]>();
	for (const session of sessions) {
		const appName = session.app_name || 'Unknown';
		const hours = byApp.get(appName) ?? Array<number>(24).fill(0);
		walkSessionByHour(session, (start, end) => {
			const hour = Math.max(0, Math.min(23, start.getHours()));
			hours[hour] = (hours[hour] ?? 0) + Math.max(0, (end.getTime() - start.getTime()) / 1000);
		});
		byApp.set(appName, hours);
	}
	return [...byApp.entries()]
		.map(([label, hours]) => ({ label, hours, color: colorForLabel(label), total: hours.reduce((sum, value) => sum + value, 0) }))
		.sort((a, b) => b.total - a.total)
		.slice(0, limit)
		.map(({ label, hours, color }) => ({ label, hours, color }));
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

function buildCategoryBalance(
	dailyMatrix: MatrixCell[],
	hourlyMatrix: MatrixCell[],
	categories: CategoryRow[],
	trend: TrendPoint[],
	totalDays: number,
): CategoryBalanceResult {
	const exactCells = chooseCategoryMatrixCells(dailyMatrix, hourlyMatrix);
	if (exactCells.length > 0) {
		const totals = sumByLabel(exactCells.map((cell) => ({ label: cell.category, value: cell.total_seconds })));
		const topCategories = topLabelsFromTotals(totals, 6);
		const dayMap = new Map<string, Map<string, number>>();
		for (const cell of exactCells) {
			const day = formatDateISO(cell.date);
			const bucket = topCategories.includes(cell.category) ? cell.category : 'Other';
			const row = dayMap.get(day) ?? new Map<string, number>();
			row.set(bucket, (row.get(bucket) ?? 0) + cell.total_seconds);
			dayMap.set(day, row);
		}
		const dayKeys = trend.length > 0 ? trend.map((t) => formatDateISO(t.date)) : [...dayMap.keys()].sort();
		const labels = [...topCategories, 'Other'];
		const rows = dayKeys.map((day) => {
			const row = dayMap.get(day) ?? new Map<string, number>();
			return {
				label: formatTrendKey(day, totalDays),
				segments: labels
					.map((label) => ({ label, value: row.get(label) ?? 0, color: colorForLabel(label) }))
					.filter((seg) => seg.value > 0),
			};
		}).filter((row) => row.segments.length > 0);
		return {
			rows,
			legendLabels: labels.filter((label) => rows.some((row) => row.segments.some((seg) => seg.label === label))),
			note: 'Using dated category matrix rows from the export.',
			exact: true,
		};
	}

	const topCategories = categories.slice(0, 8);
	if (topCategories.length === 0) {
		return { rows: [], legendLabels: [], note: '', exact: false };
	}
	const shownTotal = topCategories.reduce((sum, category) => sum + category.total_seconds, 0);
	const allTotal = categories.reduce((sum, category) => sum + category.total_seconds, 0);
	const segments = topCategories.map((category) => ({
		label: category.category,
		value: category.total_seconds,
		color: colorForLabel(category.category),
	}));
	if (allTotal > shownTotal) {
		segments.push({ label: 'Other', value: allTotal - shownTotal, color: colorForLabel('Other') });
	}
	return {
		rows: [{ label: 'Range', segments }],
		legendLabels: segments.map((segment) => segment.label),
		note: 'Category exports only include range totals, so this shows full-period balance rather than daily change.',
		exact: false,
	};
}

function buildScatterPoints(
	trend: TrendPoint[],
	sessions: SessionRow[],
	contextSwitches: ContextSwitchRow[],
	focusBlocks: FocusBlockRow[],
	dailyApps: DailyAppTrendRow[],
): { points: ScatterPoint[]; colorMode: string } {
	const sessionsByDay = countSessionsByDay(sessions);
	const switchesByDay = sumContextSwitchesByDay(contextSwitches);
	const focusByDay = countFocusBlocksByDay(focusBlocks);
	const topApps = buildTopAppByDay(dailyApps, trend);
	const useFocusColor = focusBlocks.length > 0;
	const points = trend.map((day) => {
		const key = formatDateISO(day.date);
		const activeHours = day.total_seconds / 3600;
		const switches = switchesByDay.get(key) ?? 0;
		const switchesPerHour = activeHours > 0 ? switches / activeHours : 0;
		const sessionsCount = sessionsByDay.get(key) ?? 0;
		const focusCount = focusByDay.get(key) ?? 0;
		const topApp = topApps.get(key);
		const color = useFocusColor ? colorForFocusCount(focusCount) : colorForLabel(topApp?.app_name ?? 'Unknown');
		return {
			label: key,
			x: day.total_seconds,
			y: switchesPerHour,
			size: sessionsCount,
			color,
			title: [
				key,
				`Active: ${formatDuration(day.total_seconds)}`,
				`Context switches/hour: ${switchesPerHour.toFixed(1)}`,
				`Sessions: ${sessionsCount}`,
				`Focus blocks: ${focusCount}`,
				topApp ? `Top app: ${topApp.app_name} (${formatDuration(topApp.total_seconds)})` : undefined,
			].filter((part): part is string => Boolean(part)).join('\n'),
		};
	});
	return { points, colorMode: useFocusColor ? 'focus block count' : 'top app' };
}

function buildDayArchetypes(
	trend: TrendPoint[],
	sessions: SessionRow[],
	contextSwitches: ContextSwitchRow[],
	focusBlocks: FocusBlockRow[],
	dailyApps: DailyAppTrendRow[],
	categoryByDay: Map<string, DayTopCategory>,
): DayArchetypeRow[] {
	const sessionsByDay = countSessionsByDay(sessions);
	const longestSessionByDay = longestSessionByStartDay(sessions);
	const switchesByDay = sumContextSwitchesByDay(contextSwitches);
	const focusByDay = countFocusBlocksByDay(focusBlocks);
	const topApps = buildTopAppByDay(dailyApps, trend);
	const averageActive = trend.reduce((sum, row) => sum + row.total_seconds, 0) / Math.max(1, trend.length);
	const lowThreshold = Math.max(20 * 60, Math.min(60 * 60, averageActive * 0.25));

	return trend.map((day) => {
		const key = formatDateISO(day.date);
		const activeHours = day.total_seconds / 3600;
		const switches = switchesByDay.get(key) ?? 0;
		const switchesPerHour = activeHours > 0 ? switches / activeHours : 0;
		const sessionCount = sessionsByDay.get(key) ?? 0;
		const sessionsPerHour = activeHours > 0 ? sessionCount / activeHours : 0;
		const focusCount = focusByDay.get(key) ?? 0;
		const topApp = topApps.get(key);
		const topCategory = categoryByDay.get(key);
		const longestSession = longestSessionByDay.get(key) ?? 0;
		const result = classifyDay({
			activeSeconds: day.total_seconds,
			lowThreshold,
			switchesPerHour,
			sessionsPerHour,
			focusCount,
			longestSession,
			topApp,
			topCategory,
		});
		return {
			date: day.date,
			label: result.label,
			activeSeconds: day.total_seconds,
			sessions: sessionCount,
			switchesPerHour,
			focusBlocks: focusCount,
			topApp,
			topCategory,
			reason: result.reason,
		};
	});
}

function classifyDay(input: {
	activeSeconds: number;
	lowThreshold: number;
	switchesPerHour: number;
	sessionsPerHour: number;
	focusCount: number;
	longestSession: number;
	topApp?: DayTopApp;
	topCategory?: DayTopCategory;
}): { label: DayArchetype; reason: string } {
	const topLabel = `${input.topApp?.app_name ?? ''} ${input.topCategory?.category ?? ''}`.toLowerCase();
	const topShare = Math.max(input.topApp?.share ?? 0, input.topCategory?.share ?? 0);
	if (input.activeSeconds < input.lowThreshold) {
		return { label: 'Low activity', reason: `Under ${formatDuration(input.lowThreshold)} active` };
	}
	if (input.switchesPerHour >= 18 || input.sessionsPerHour >= 7) {
		return { label: 'Fragmented', reason: `${input.switchesPerHour.toFixed(1)} switches/hour` };
	}
	if (input.activeSeconds >= 2 * 3600 && (input.focusCount > 0 || input.longestSession >= 45 * 60) && input.switchesPerHour <= 10) {
		return { label: 'Deep work', reason: input.focusCount > 0 ? `${input.focusCount} focus block${input.focusCount === 1 ? '' : 's'}` : `Longest session ${formatDuration(input.longestSession)}` };
	}
	if (isCommsLabel(topLabel) && topShare >= 0.25) {
		return { label: 'Comms-heavy', reason: `${input.topApp?.app_name ?? input.topCategory?.category ?? 'Comms'} led the day` };
	}
	if (isBrowsingLabel(topLabel) && topShare >= 0.35) {
		return { label: 'Browsing-heavy', reason: `${input.topApp?.app_name ?? input.topCategory?.category ?? 'Browser'} dominated usage` };
	}
	if (input.switchesPerHour <= 10) {
		return { label: 'Deep work', reason: input.topApp ? `Low switch rate; top app: ${input.topApp.app_name}` : 'Low switch rate' };
	}
	return { label: 'Fragmented', reason: input.topApp ? `Mixed usage; top app: ${input.topApp.app_name}` : 'Mixed usage' };
}

function renderDayArchetypes(parent: HTMLElement, rows: DayArchetypeRow[]): void {
	if (rows.length === 0) {
		parent.createDiv({ cls: 'timemd-empty-inline', text: 'No days to classify.' });
		return;
	}
	const counts = new Map<DayArchetype, number>();
	for (const row of rows) counts.set(row.label, (counts.get(row.label) ?? 0) + 1);
	const chips = parent.createDiv({ cls: 'timemd-archetype-chips' });
	for (const [label, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
		const chip = chips.createDiv({ cls: `timemd-archetype-chip ${archetypeClass(label)}` });
		chip.createSpan({ text: label });
		chip.createSpan({ cls: 'timemd-archetype-chip-count', text: String(count) });
	}

	const wrap = parent.createDiv({ cls: 'timemd-table-wrap timemd-archetype-table-wrap' });
	const table = wrap.createEl('table', { cls: 'timemd-table timemd-archetype-table' });
	const head = table.createEl('thead').createEl('tr');
	for (const label of ['Date', 'Archetype', 'Active', 'Top app/category', 'Switches/hr', 'Sessions', 'Focus', 'Why']) {
		head.createEl('th', { text: label });
	}
	const tbody = table.createEl('tbody');
	for (const row of rows) {
		const tr = tbody.createEl('tr');
		tr.createEl('td', { text: formatDateISO(row.date) });
		const archetypeCell = tr.createEl('td');
		archetypeCell.createSpan({ cls: `timemd-archetype-pill ${archetypeClass(row.label)}`, text: row.label });
		tr.createEl('td', { text: formatDuration(row.activeSeconds) });
		tr.createEl('td', { text: describeTopDayEntity(row.topApp, row.topCategory) });
		tr.createEl('td', { text: row.switchesPerHour.toFixed(1) });
		tr.createEl('td', { text: String(row.sessions) });
		tr.createEl('td', { text: String(row.focusBlocks) });
		tr.createEl('td', { text: row.reason });
	}
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

interface TopAppsByDayRow {
	date: Date;
	apps: Array<{ app_name: string; total_seconds: number }>;
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

function buildTopAppByDay(dailyApps: DailyAppTrendRow[], trend: TrendPoint[]): Map<string, DayTopApp> {
	const totalsByDay = new Map<string, number>();
	for (const day of trend) totalsByDay.set(formatDateISO(day.date), day.total_seconds);
	const grouped = new Map<string, DailyAppTrendRow[]>();
	for (const app of dailyApps) {
		const key = formatDateISO(app.date);
		const rows = grouped.get(key) ?? [];
		rows.push(app);
		grouped.set(key, rows);
	}
	const out = new Map<string, DayTopApp>();
	for (const [day, rows] of grouped) {
		const top = rows.sort((a, b) => b.total_seconds - a.total_seconds)[0];
		if (!top) continue;
		const total = totalsByDay.get(day) ?? rows.reduce((sum, row) => sum + row.total_seconds, 0);
		out.set(day, { app_name: top.app_name, total_seconds: top.total_seconds, share: total > 0 ? top.total_seconds / total : 0 });
	}
	return out;
}

function buildTopCategoryByDay(dailyMatrix: MatrixCell[], hourlyMatrix: MatrixCell[]): Map<string, DayTopCategory> {
	const cells = chooseCategoryMatrixCells(dailyMatrix, hourlyMatrix);
	const totalsByDay = new Map<string, number>();
	const byDayCategory = new Map<string, Map<string, number>>();
	for (const cell of cells) {
		const day = formatDateISO(cell.date);
		const category = cell.category;
		totalsByDay.set(day, (totalsByDay.get(day) ?? 0) + cell.total_seconds);
		const row = byDayCategory.get(day) ?? new Map<string, number>();
		row.set(category, (row.get(category) ?? 0) + cell.total_seconds);
		byDayCategory.set(day, row);
	}
	const out = new Map<string, DayTopCategory>();
	for (const [day, values] of byDayCategory) {
		const top = [...values.entries()].sort((a, b) => b[1] - a[1])[0];
		if (!top) continue;
		const total = totalsByDay.get(day) ?? top[1];
		out.set(day, { category: top[0], total_seconds: top[1], share: total > 0 ? top[1] / total : 0 });
	}
	return out;
}

function chooseCategoryMatrixCells(dailyMatrix: MatrixCell[], hourlyMatrix: MatrixCell[]): Array<MatrixCell & { date: Date; category: string }> {
	const daily = filterDatedCategoryCells(dailyMatrix);
	if (daily.length > 0) return daily;
	return filterDatedCategoryCells(hourlyMatrix);
}

function filterDatedCategoryCells(cells: MatrixCell[]): Array<MatrixCell & { date: Date; category: string }> {
	return cells.filter((cell): cell is MatrixCell & { date: Date; category: string } => Boolean(cell.date && cell.category && cell.total_seconds > 0));
}

function countSessionsByDay(sessions: SessionRow[]): Map<string, number> {
	const out = new Map<string, number>();
	for (const session of sessions) {
		const key = formatDateISO(session.start_time);
		out.set(key, (out.get(key) ?? 0) + 1);
	}
	return out;
}

function longestSessionByStartDay(sessions: SessionRow[]): Map<string, number> {
	const out = new Map<string, number>();
	for (const session of sessions) {
		const key = formatDateISO(session.start_time);
		const duration = Math.max(0, (normalizedSessionEnd(session).getTime() - session.start_time.getTime()) / 1000);
		out.set(key, Math.max(out.get(key) ?? 0, duration));
	}
	return out;
}

function sumContextSwitchesByDay(contextSwitches: ContextSwitchRow[]): Map<string, number> {
	const out = new Map<string, number>();
	for (const row of contextSwitches) out.set(row.date, (out.get(row.date) ?? 0) + row.switch_count);
	return out;
}

function countFocusBlocksByDay(focusBlocks: FocusBlockRow[]): Map<string, number> {
	const out = new Map<string, number>();
	for (const block of focusBlocks) {
		const key = formatDateISO(block.start_time);
		out.set(key, (out.get(key) ?? 0) + 1);
	}
	return out;
}

function sumByLabel(rows: Array<{ label: string; value: number }>): Map<string, number> {
	const out = new Map<string, number>();
	for (const row of rows) out.set(row.label, (out.get(row.label) ?? 0) + row.value);
	return out;
}

function topLabelsFromTotals(totals: Map<string, number>, limit: number): string[] {
	return [...totals.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([label]) => label);
}

function topAppNames(dailyApps: DailyAppTrendRow[], limit: number): string[] {
	const totals = new Map<string, number>();
	for (const app of dailyApps) totals.set(app.app_name, (totals.get(app.app_name) ?? 0) + app.total_seconds);
	return [...totals.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([name]) => name);
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

function walkSessionByHour(session: SessionRow, cb: (start: Date, end: Date) => void): void {
	let cursor = new Date(session.start_time);
	const end = normalizedSessionEnd(session);
	let guard = 0;
	while (cursor < end && guard < 10000) {
		const nextHour = new Date(cursor);
		nextHour.setMinutes(0, 0, 0);
		nextHour.setHours(nextHour.getHours() + 1);
		const segmentEnd = nextHour < end ? nextHour : end;
		if (segmentEnd <= cursor) break;
		cb(cursor, segmentEnd);
		cursor = segmentEnd;
		guard += 1;
	}
}

function normalizedSessionEnd(session: SessionRow): Date {
	if (session.end_time > session.start_time) return session.end_time;
	return new Date(session.start_time.getTime() + Math.max(0, session.duration_seconds) * 1000);
}

function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateFromKey(key: string): Date {
	const [year, month, day] = key.split('-').map((part) => Number(part));
	return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
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

function colorForFocusCount(count: number): string {
	if (count <= 0) return '#64748b';
	if (count === 1) return '#3b82f6';
	if (count === 2) return '#22c55e';
	if (count === 3) return '#f59e0b';
	return '#a855f7';
}

function describeTopDayEntity(topApp: DayTopApp | undefined, topCategory: DayTopCategory | undefined): string {
	if (topApp && topCategory) return `${topApp.app_name} / ${topCategory.category}`;
	if (topApp) return topApp.app_name;
	if (topCategory) return topCategory.category;
	return '—';
}

function isCommsLabel(label: string): boolean {
	return /\b(slack|teams|discord|mail|outlook|gmail|messages|zoom|meet|calendar|communication|comms|email|chat)\b/.test(label);
}

function isBrowsingLabel(label: string): boolean {
	return /\b(safari|chrome|firefox|arc|brave|edge|browser|browsing|web)\b/.test(label);
}

function archetypeClass(label: DayArchetype): string {
	return `is-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function addStat(row: HTMLElement, label: string, value: string): void {
	const stat = row.createDiv({ cls: 'timemd-stat' });
	stat.createDiv({ cls: 'timemd-stat-label', text: label });
	stat.createDiv({ cls: 'timemd-stat-value', text: value });
}
