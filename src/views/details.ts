import { WorkspaceLeaf } from 'obsidian';
import { colorForLabel, renderVerticalBarChart } from '../charts';
import { AppTransitionRow, ContextSwitchRow, SessionRow } from '../types';
import { formatDateISO, formatDuration } from '../utils';
import { TimeMdBaseView, TimeMdHost } from './base';

export const VIEW_TYPE_DETAILS = 'timemd-details';

const MAX_TIMELINE_DAYS = 14;
const SECONDS_PER_DAY = 24 * 3600;

interface TimelineSegment {
	app_name: string;
	start: number;
	end: number;
	start_time: Date;
	end_time: Date;
	duration_seconds: number;
}

interface TimelineDay {
	date: Date;
	segments: TimelineSegment[];
	sessionCount: number;
	visibleSeconds: number;
}

export class DetailsView extends TimeMdBaseView {
	private filter = '';

	constructor(leaf: WorkspaceLeaf, host: TimeMdHost) {
		super(leaf, host);
	}

	getViewType(): string {
		return VIEW_TYPE_DETAILS;
	}

	getDisplayText(): string {
		return 'Details';
	}

	renderBody(body: HTMLElement): void {
		const sessions = this.host.store.getSessions();
		if (sessions.length === 0) {
			body.createDiv({ cls: 'timemd-empty-inline', text: 'No raw sessions in the loaded exports.' });
			return;
		}

		const contextSwitches = this.host.store.getContextSwitches();
		const appTransitions = this.host.store.getAppTransitions();
		const totalSwitches = contextSwitches.reduce((sum, row) => sum + row.switch_count, 0);
		const stats = computeSessionStats(sessions, totalSwitches);

		const statsRow = body.createDiv({ cls: 'timemd-stats-row' });
		addStat(statsRow, 'Sessions', sessions.length.toLocaleString());
		addStat(statsRow, 'Total time', formatDuration(stats.totalSeconds));
		addStat(statsRow, 'Average session', formatDuration(stats.averageSeconds));
		addStat(statsRow, 'Longest', `${stats.longest.app_name} · ${formatDuration(stats.longest.duration_seconds)}`);

		const insightRow = body.createDiv({ cls: 'timemd-stats-row timemd-insight-row' });
		addStat(insightRow, 'Fragmentation', `${formatPercent(stats.fragmentationRatio)} under 1m`);
		addStat(insightRow, 'Switches/active hour', stats.switchesPerActiveHour === undefined ? '—' : formatNumber(stats.switchesPerActiveHour));
		addStat(insightRow, 'Apps used', stats.appsUsed.toLocaleString());
		addStat(insightRow, 'Median session', formatDuration(stats.medianSeconds));
		const focusBlocks = numericSummaryMetric(this.host.store.getSummaryMetric('focus_blocks'));
		if (focusBlocks !== undefined) addStat(insightRow, 'Focus blocks', formatNumber(focusBlocks));

		const timelineCard = body.createDiv({ cls: 'timemd-card timemd-details-wide-card' });
		timelineCard.createEl('h3', { text: '24-hour session timeline' });
		renderDailyTimeline(timelineCard, sessions);

		const vizGrid = body.createDiv({ cls: 'timemd-details-viz-grid' });
		const distCard = vizGrid.createDiv({ cls: 'timemd-card' });
		distCard.createEl('h3', { text: 'Session length distribution' });
		renderVerticalBarChart(distCard, buildSessionBuckets(sessions), {
			height: 220,
			formatValue: (v) => `${v} sessions`,
			formatAxis: (v) => String(Math.round(v)),
			showValues: true,
			maxLabels: 6,
		});

		const switchCard = vizGrid.createDiv({ cls: 'timemd-card' });
		switchCard.createEl('h3', { text: 'Context switch intensity' });
		renderContextSwitchChart(switchCard, contextSwitches);

		const transitionsCard = vizGrid.createDiv({ cls: 'timemd-card' });
		transitionsCard.createEl('h3', { text: 'Top app transitions' });
		renderAppTransitions(transitionsCard, appTransitions);

		const toolbar = body.createDiv({ cls: 'timemd-toolbar' });
		const input = toolbar.createEl('input', {
			type: 'text',
			placeholder: 'Filter by app name…',
			cls: 'timemd-filter-input',
		});
		input.value = this.filter;
		const count = toolbar.createDiv({ cls: 'timemd-toolbar-count' });

		const tableWrap = body.createDiv({ cls: 'timemd-table-wrap' });
		const table = tableWrap.createEl('table', { cls: 'timemd-table' });
		const head = table.createEl('thead').createEl('tr');
		head.createEl('th', { text: 'App' });
		head.createEl('th', { text: 'Start' });
		head.createEl('th', { text: 'End' });
		head.createEl('th', { text: 'Duration' });
		const tbody = table.createEl('tbody');

		const redraw = (): void => {
			tbody.empty();
			const needle = this.filter.trim().toLowerCase();
			const filtered = needle
				? sessions.filter((s) => s.app_name.toLowerCase().includes(needle))
				: sessions;
			const shown = filtered.slice(0, 2000);
			for (const s of shown) {
				const tr = tbody.createEl('tr');
				tr.createEl('td', { text: s.app_name });
				tr.createEl('td', { text: s.start_time.toLocaleString() });
				tr.createEl('td', { text: s.end_time.toLocaleString() });
				tr.createEl('td', { text: formatDuration(s.duration_seconds) });
			}
			const suffix = filtered.length > shown.length ? ` (showing first ${shown.length})` : '';
			count.setText(`${filtered.length} session${filtered.length === 1 ? '' : 's'}${suffix}`);
		};

		input.addEventListener('input', () => {
			this.filter = input.value;
			redraw();
		});

		redraw();
	}
}

function buildSessionBuckets(sessions: SessionRow[]): Array<{ label: string; value: number }> {
	const buckets = [
		{ label: '<5m', min: 0, max: 5 * 60, value: 0 },
		{ label: '5–15m', min: 5 * 60, max: 15 * 60, value: 0 },
		{ label: '15–30m', min: 15 * 60, max: 30 * 60, value: 0 },
		{ label: '30–60m', min: 30 * 60, max: 60 * 60, value: 0 },
		{ label: '1–2h', min: 60 * 60, max: 2 * 60 * 60, value: 0 },
		{ label: '2h+', min: 2 * 60 * 60, max: Infinity, value: 0 },
	];
	for (const session of sessions) {
		const bucket = buckets.find((b) => session.duration_seconds >= b.min && session.duration_seconds < b.max);
		if (bucket) bucket.value += 1;
	}
	return buckets.map(({ label, value }) => ({ label, value }));
}

function renderDailyTimeline(parent: HTMLElement, sessions: SessionRow[]): void {
	const dayMap = buildTimelineDays(sessions);
	const allDays = [...dayMap.keys()].sort();
	const days = allDays.slice(-MAX_TIMELINE_DAYS);
	if (days.length === 0) {
		parent.createDiv({ cls: 'timemd-empty-inline', text: 'No sessions.' });
		return;
	}
	if (allDays.length > MAX_TIMELINE_DAYS) {
		parent.createDiv({
			cls: 'timemd-card-note',
			text: `Showing the most recent ${MAX_TIMELINE_DAYS} of ${allDays.length} days.`,
		});
	}
	const wrap = parent.createDiv({ cls: 'timemd-session-timeline' });
	renderTimelineAxis(wrap, 'timemd-session-timeline-axis timemd-session-timeline-axis-top');
	for (const day of days) {
		const entry = dayMap.get(day);
		if (!entry) continue;
		const row = wrap.createDiv({ cls: 'timemd-session-timeline-row' });
		const label = row.createDiv({ cls: 'timemd-session-timeline-label' });
		label.createDiv({ cls: 'timemd-session-timeline-date', text: formatTimelineDate(entry.date) });
		label.createDiv({ cls: 'timemd-session-timeline-weekday', text: entry.date.toLocaleDateString(undefined, { weekday: 'short' }) });
		const track = row.createDiv({ cls: 'timemd-session-timeline-track' });
		for (const s of entry.segments.sort((a, b) => a.start - b.start)) {
			const start = Math.max(0, Math.min(SECONDS_PER_DAY, s.start));
			const end = Math.max(start + 60, Math.min(SECONDS_PER_DAY, s.end));
			const width = ((end - start) / SECONDS_PER_DAY) * 100;
			const seg = track.createDiv({
				cls: `timemd-session-timeline-segment${s.duration_seconds < 60 ? ' is-short' : ''}`,
			});
			seg.style.left = `${(start / SECONDS_PER_DAY) * 100}%`;
			seg.style.width = `${Math.max(0.25, width)}%`;
			seg.style.background = colorForLabel(s.app_name);
			seg.setAttr(
				'title',
				`${s.app_name} · ${s.start_time.toLocaleTimeString()}–${s.end_time.toLocaleTimeString()} · ${formatDuration(s.duration_seconds)}`,
			);
		}
		row.createDiv({
			cls: 'timemd-session-timeline-summary',
			text: `${entry.sessionCount} sessions · ${formatDuration(entry.visibleSeconds)}`,
		});
	}
	renderTimelineAxis(wrap, 'timemd-session-timeline-axis');
}

function renderTimelineAxis(parent: HTMLElement, cls: string): void {
	const axis = parent.createDiv({ cls });
	for (const label of ['12a', '3a', '6a', '9a', '12p', '3p', '6p', '9p', '12a']) {
		axis.createSpan({ text: label });
	}
}

function renderContextSwitchChart(parent: HTMLElement, rows: ContextSwitchRow[]): void {
	if (rows.length === 0) {
		parent.createDiv({ cls: 'timemd-empty-inline', text: 'No context switch data in the loaded exports.' });
		return;
	}
	const byHour = Array.from({ length: 24 }, (_, hour) => ({ label: `${String(hour).padStart(2, '0')}:00`, value: 0 }));
	const days = new Set<string>();
	for (const row of rows) {
		if (row.hour < 0 || row.hour > 23) continue;
		byHour[row.hour]!.value += row.switch_count;
		days.add(row.date);
	}
	renderVerticalBarChart(parent, byHour, {
		height: 220,
		formatValue: (v) => `${Math.round(v)} switches`,
		formatAxis: (v) => String(Math.round(v)),
		maxLabels: 8,
		color: 'var(--timemd-warning, var(--text-accent))',
	});
	const total = byHour.reduce((sum, row) => sum + row.value, 0);
	parent.createDiv({
		cls: 'timemd-card-note',
		text: `${total.toLocaleString()} switches across ${days.size.toLocaleString()} day${days.size === 1 ? '' : 's'}, grouped by hour of day.`,
	});
}

function renderAppTransitions(parent: HTMLElement, transitions: AppTransitionRow[]): void {
	if (transitions.length === 0) {
		parent.createDiv({ cls: 'timemd-empty-inline', text: 'No app transition data in the loaded exports.' });
		return;
	}
	const list = parent.createDiv({ cls: 'timemd-transition-list' });
	for (const transition of transitions.slice(0, 12)) {
		const row = list.createDiv({ cls: 'timemd-transition-row' });
		row.createDiv({ cls: 'timemd-transition-from', text: displayAppName(transition.from_app) });
		row.createDiv({ cls: 'timemd-transition-arrow', text: '→' });
		row.createDiv({ cls: 'timemd-transition-to', text: displayAppName(transition.to_app) });
		row.createDiv({ cls: 'timemd-transition-count', text: transition.count.toLocaleString() });
		row.createDiv({ cls: 'timemd-transition-percent', text: `${transition.percentage.toFixed(1)}%` });
	}
}

function computeSessionStats(sessions: SessionRow[], totalSwitches: number): {
	totalSeconds: number;
	averageSeconds: number;
	longest: SessionRow;
	fragmentationRatio: number;
	switchesPerActiveHour: number | undefined;
	appsUsed: number;
	medianSeconds: number;
} {
	const totalSeconds = sessions.reduce((sum, s) => sum + s.duration_seconds, 0);
	const averageSeconds = totalSeconds / Math.max(1, sessions.length);
	const longest = sessions.reduce((best, s) => (best.duration_seconds >= s.duration_seconds ? best : s), sessions[0]!);
	const shortSessions = sessions.filter((s) => s.duration_seconds < 60).length;
	const activeHours = totalSeconds / 3600;
	return {
		totalSeconds,
		averageSeconds,
		longest,
		fragmentationRatio: shortSessions / Math.max(1, sessions.length),
		switchesPerActiveHour: activeHours > 0 && totalSwitches > 0 ? totalSwitches / activeHours : undefined,
		appsUsed: new Set(sessions.map((s) => s.app_name).filter(Boolean)).size,
		medianSeconds: median(sessions.map((s) => s.duration_seconds)),
	};
}

function buildTimelineDays(sessions: SessionRow[]): Map<string, TimelineDay> {
	const byDay = new Map<string, TimelineDay>();
	for (const session of sessions) {
		const startKey = formatDateISO(session.start_time);
		const startEntry = ensureTimelineDay(byDay, startKey, session.start_time);
		startEntry.sessionCount += 1;

		let cursor = new Date(session.start_time);
		const end = session.end_time.getTime() > session.start_time.getTime()
			? session.end_time
			: new Date(session.start_time.getTime() + Math.max(1000, session.duration_seconds * 1000));
		let guard = 0;
		while (cursor.getTime() < end.getTime() && guard < MAX_TIMELINE_DAYS + 2) {
			const dayStart = startOfDay(cursor);
			const nextDay = new Date(dayStart.getTime() + SECONDS_PER_DAY * 1000);
			const segmentStart = cursor.getTime() > dayStart.getTime() ? cursor : dayStart;
			const segmentEnd = end.getTime() < nextDay.getTime() ? end : nextDay;
			const dayKey = formatDateISO(dayStart);
			const entry = ensureTimelineDay(byDay, dayKey, dayStart);
			const visibleSeconds = Math.max(1, (segmentEnd.getTime() - segmentStart.getTime()) / 1000);
			entry.visibleSeconds += visibleSeconds;
			entry.segments.push({
				app_name: session.app_name,
				start: secondsSinceStartOfDay(segmentStart),
				end: segmentEnd.getTime() === nextDay.getTime() ? SECONDS_PER_DAY : secondsSinceStartOfDay(segmentEnd),
				start_time: session.start_time,
				end_time: session.end_time,
				duration_seconds: session.duration_seconds,
			});
			cursor = segmentEnd;
			guard += 1;
		}
	}
	return byDay;
}

function ensureTimelineDay(map: Map<string, TimelineDay>, key: string, date: Date): TimelineDay {
	const existing = map.get(key);
	if (existing) return existing;
	const entry = { date: startOfDay(date), segments: [], sessionCount: 0, visibleSeconds: 0 };
	map.set(key, entry);
	return entry;
}

function secondsSinceStartOfDay(d: Date): number {
	return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

function startOfDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatTimelineDate(d: Date): string {
	return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function median(values: number[]): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
	return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function formatPercent(value: number): string {
	return `${Math.round(value * 100)}%`;
}

function formatNumber(value: number): string {
	if (Math.abs(value) >= 10) return Math.round(value).toLocaleString();
	return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function numericSummaryMetric(value: number | string | undefined): number | undefined {
	if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
	if (typeof value !== 'string') return undefined;
	const n = Number(value.trim());
	return Number.isFinite(n) ? n : undefined;
}

function displayAppName(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return 'Unknown';
	if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(trimmed)) return trimmed;
	const part = trimmed.split('.').filter(Boolean).pop();
	if (!part) return trimmed;
	return part
		.replace(/[-_]+/g, ' ')
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function addStat(row: HTMLElement, label: string, value: string): void {
	const stat = row.createDiv({ cls: 'timemd-stat' });
	stat.createDiv({ cls: 'timemd-stat-label', text: label });
	stat.createDiv({ cls: 'timemd-stat-value', text: value });
}
