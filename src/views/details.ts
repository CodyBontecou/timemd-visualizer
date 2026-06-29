import { WorkspaceLeaf } from 'obsidian';
import { colorForLabel, renderTransitionSankey, renderVerticalBarChart } from '../charts';
import { AppTransitionRow, ContextSwitchRow, SessionRow } from '../types';
import { formatDateISO, formatDuration } from '../utils';
import { TimeMdBaseView, TimeMdHost } from './base';

export const VIEW_TYPE_DETAILS = 'timemd-details';

const MAX_TIMELINE_DAYS = 14;
const MAX_LANE_DAYS = 3;
const MAX_LANE_TOP_APPS = 9;
const MAX_LANE_SEGMENTS_PER_DAY = 800;
const MAX_WATERFALL_DAYS = 3;
const MAX_WATERFALL_SESSIONS = 500;
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

interface TimelineLane {
	appName: string;
	segments: TimelineSegment[];
	totalSeconds: number;
	sessionCount: number;
	isOther: boolean;
}

interface WaterfallGroup {
	date: Date;
	sessions: SessionRow[];
	omittedSessions: number;
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

		const laneTimelineCard = body.createDiv({ cls: 'timemd-card timemd-details-wide-card' });
		laneTimelineCard.createEl('h3', { text: 'Timeline with lanes' });
		renderTimelineWithLanes(laneTimelineCard, sessions);

		const waterfallCard = body.createDiv({ cls: 'timemd-card timemd-details-wide-card' });
		waterfallCard.createEl('h3', { text: 'Session waterfall' });
		renderSessionWaterfall(waterfallCard, sessions);

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

		const transitionsCard = vizGrid.createDiv({ cls: 'timemd-card timemd-transitions-card' });
		transitionsCard.createEl('h3', { text: 'Top app transitions' });
		renderTransitionSankey(transitionsCard, appTransitions, { formatApp: displayAppName });
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
			seg.setAttr('title', formatSessionTitle(s));
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

function renderTimelineWithLanes(parent: HTMLElement, sessions: SessionRow[]): void {
	const dayMap = buildTimelineDays(sessions);
	const allDays = [...dayMap.keys()].sort();
	const days = allDays.slice(-MAX_LANE_DAYS).reverse();
	if (days.length === 0) {
		parent.createDiv({ cls: 'timemd-empty-inline', text: 'No sessions.' });
		return;
	}
	if (allDays.length > days.length) {
		parent.createDiv({
			cls: 'timemd-card-note',
			text: `Showing the latest ${days.length} of ${allDays.length} days.`,
		});
	}
	const wrap = parent.createDiv({ cls: 'timemd-lane-timeline' });
	for (const day of days) {
		const entry = dayMap.get(day);
		if (!entry) continue;
		const sortedSegments = [...entry.segments].sort((a, b) => a.start - b.start);
		const renderedSegments = sortedSegments.slice(0, MAX_LANE_SEGMENTS_PER_DAY);
		const lanes = buildTimelineLanes(sortedSegments, renderedSegments);

		const section = wrap.createDiv({ cls: 'timemd-lane-day' });
		const head = section.createDiv({ cls: 'timemd-lane-day-head' });
		head.createDiv({ cls: 'timemd-lane-day-title', text: `${formatTimelineDate(entry.date)} · ${entry.date.toLocaleDateString(undefined, { weekday: 'short' })}` });
		head.createDiv({ cls: 'timemd-lane-day-meta', text: `${entry.sessionCount} sessions · ${formatDuration(entry.visibleSeconds)}` });
		renderTimelineAxis(section, 'timemd-lane-axis');

		for (const lane of lanes) {
			const row = section.createDiv({ cls: `timemd-lane-row${lane.isOther ? ' is-other' : ''}` });
			const label = row.createDiv({ cls: 'timemd-lane-label' });
			label.createDiv({ cls: 'timemd-lane-app', text: lane.isOther ? 'Other' : displayAppName(lane.appName) });
			label.createDiv({ cls: 'timemd-lane-meta', text: `${formatDuration(lane.totalSeconds)} · ${lane.sessionCount.toLocaleString()} segs` });
			const track = row.createDiv({ cls: 'timemd-lane-track' });
			for (const s of lane.segments) {
				const start = Math.max(0, Math.min(SECONDS_PER_DAY, s.start));
				const rawEnd = Math.max(start, Math.min(SECONDS_PER_DAY, s.end));
				const end = Math.min(SECONDS_PER_DAY, Math.max(start + 60, rawEnd));
				const width = ((end - start) / SECONDS_PER_DAY) * 100;
				const seg = track.createDiv({
					cls: `timemd-lane-segment${s.duration_seconds < 60 ? ' is-short' : ''}`,
				});
				seg.style.left = `${(start / SECONDS_PER_DAY) * 100}%`;
				seg.style.width = `${Math.max(0.22, width)}%`;
				seg.style.background = colorForLabel(s.app_name);
				seg.setAttr('title', formatSessionTitle(s));
			}
		}
		if (sortedSegments.length > renderedSegments.length) {
			section.createDiv({
				cls: 'timemd-card-note',
				text: `Rendered ${renderedSegments.length.toLocaleString()} of ${sortedSegments.length.toLocaleString()} timeline segments for performance.`,
			});
		}
	}
}

function buildTimelineLanes(allSegments: TimelineSegment[], renderedSegments: TimelineSegment[]): TimelineLane[] {
	const totals = new Map<string, { totalSeconds: number; sessionCount: number }>();
	for (const segment of allSegments) {
		const appName = normalizeAppName(segment.app_name);
		const current = totals.get(appName) ?? { totalSeconds: 0, sessionCount: 0 };
		current.totalSeconds += Math.max(1, segment.end - segment.start);
		current.sessionCount += 1;
		totals.set(appName, current);
	}
	const topAppNames = [...totals.entries()]
		.sort((a, b) => b[1].totalSeconds - a[1].totalSeconds)
		.slice(0, MAX_LANE_TOP_APPS)
		.map(([appName]) => appName);
	const topSet = new Set(topAppNames);
	const hiddenAppCount = Math.max(0, totals.size - topAppNames.length);
	const lanes = new Map<string, TimelineLane>();
	for (const appName of topAppNames) {
		const total = totals.get(appName) ?? { totalSeconds: 0, sessionCount: 0 };
		lanes.set(appName, {
			appName,
			segments: [],
			totalSeconds: total.totalSeconds,
			sessionCount: total.sessionCount,
			isOther: false,
		});
	}
	if (hiddenAppCount > 0) {
		let otherSeconds = 0;
		let otherSessions = 0;
		for (const [appName, total] of totals.entries()) {
			if (topSet.has(appName)) continue;
			otherSeconds += total.totalSeconds;
			otherSessions += total.sessionCount;
		}
		lanes.set('Other', {
			appName: 'Other',
			segments: [],
			totalSeconds: otherSeconds,
			sessionCount: otherSessions,
			isOther: true,
		});
	}
	for (const segment of renderedSegments) {
		const appName = normalizeAppName(segment.app_name);
		const laneKey = topSet.has(appName) ? appName : 'Other';
		lanes.get(laneKey)?.segments.push(segment);
	}
	return [...lanes.values()].filter((lane) => lane.totalSeconds > 0);
}

function renderSessionWaterfall(parent: HTMLElement, sessions: SessionRow[]): void {
	const dayCount = new Set(sessions.map((session) => formatDateISO(session.start_time))).size;
	if (dayCount > MAX_WATERFALL_DAYS) {
		parent.createDiv({
			cls: 'timemd-card-note',
			text: `Showing sessions from the latest ${MAX_WATERFALL_DAYS} of ${dayCount} days.`,
		});
	}
	const groups = buildWaterfallGroups(sessions);
	if (groups.length === 0) {
		parent.createDiv({ cls: 'timemd-empty-inline', text: 'No sessions.' });
		return;
	}
	const shownSessions = groups.flatMap((group) => group.sessions);
	const omitted = groups.reduce((sum, group) => sum + group.omittedSessions, 0);
	const maxDuration = Math.max(1, ...shownSessions.map((session) => session.duration_seconds));
	const wrap = parent.createDiv({ cls: 'timemd-session-waterfall' });
	for (const group of groups) {
		const section = wrap.createDiv({ cls: 'timemd-waterfall-day' });
		const head = section.createDiv({ cls: 'timemd-waterfall-day-head' });
		head.createDiv({ cls: 'timemd-waterfall-day-title', text: `${formatTimelineDate(group.date)} · ${group.date.toLocaleDateString(undefined, { weekday: 'short' })}` });
		head.createDiv({ cls: 'timemd-waterfall-day-meta', text: `${group.sessions.length.toLocaleString()} shown${group.omittedSessions > 0 ? ` · ${group.omittedSessions.toLocaleString()} omitted` : ''}` });
		for (const session of group.sessions) {
			const row = section.createDiv({ cls: 'timemd-waterfall-row' });
			row.setAttr('title', formatSessionTitle(session));
			row.createDiv({ cls: 'timemd-waterfall-time', text: `${formatClock(session.start_time)}–${formatClock(session.end_time)}` });
			row.createDiv({ cls: 'timemd-waterfall-app', text: displayAppName(session.app_name) });
			row.createDiv({ cls: 'timemd-waterfall-duration', text: formatDuration(session.duration_seconds) });
			const track = row.createDiv({ cls: 'timemd-waterfall-track' });
			const fill = track.createDiv({ cls: 'timemd-waterfall-fill' });
			fill.style.width = `${Math.max(2, (session.duration_seconds / maxDuration) * 100)}%`;
			fill.style.background = colorForLabel(session.app_name);
		}
	}
	if (omitted > 0) {
		parent.createDiv({
			cls: 'timemd-card-note',
			text: `Showing ${shownSessions.length.toLocaleString()} sessions; ${omitted.toLocaleString()} more from these days were hidden for performance.`,
		});
	}
}

function buildWaterfallGroups(sessions: SessionRow[]): WaterfallGroup[] {
	const byDay = new Map<string, { date: Date; sessions: SessionRow[] }>();
	for (const session of sessions) {
		const key = formatDateISO(session.start_time);
		let group = byDay.get(key);
		if (!group) {
			group = { date: startOfDay(session.start_time), sessions: [] };
			byDay.set(key, group);
		}
		group.sessions.push(session);
	}
	const days = [...byDay.keys()].sort().slice(-MAX_WATERFALL_DAYS);
	const daySessions = days
		.map((day) => {
			const group = byDay.get(day);
			return group
				? { date: group.date, sessions: [...group.sessions].sort((a, b) => a.start_time.getTime() - b.start_time.getTime()) }
				: undefined;
		})
		.filter((group): group is { date: Date; sessions: SessionRow[] } => group !== undefined);
	let sessionsToSkip = Math.max(0, daySessions.reduce((sum, group) => sum + group.sessions.length, 0) - MAX_WATERFALL_SESSIONS);
	const groups: WaterfallGroup[] = [];
	for (const group of daySessions) {
		const omittedFromDay = Math.min(sessionsToSkip, group.sessions.length);
		const shown = group.sessions.slice(omittedFromDay);
		sessionsToSkip -= omittedFromDay;
		groups.push({
			date: group.date,
			sessions: shown,
			omittedSessions: omittedFromDay,
		});
	}
	return groups;
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

function formatClock(d: Date): string {
	return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatSessionTitle(session: SessionRow | TimelineSegment): string {
	return `${displayAppName(session.app_name)} · ${session.start_time.toLocaleString()}–${session.end_time.toLocaleString()} · ${formatDuration(session.duration_seconds)}`;
}

function normalizeAppName(appName: string): string {
	const trimmed = appName.trim();
	return trimmed.length > 0 ? trimmed : 'Unknown';
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
