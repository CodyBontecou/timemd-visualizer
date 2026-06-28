import { WorkspaceLeaf } from 'obsidian';
import { colorForLabel, renderVerticalBarChart } from '../charts';
import { SessionRow } from '../types';
import { formatDateISO, formatDuration } from '../utils';
import { TimeMdBaseView, TimeMdHost } from './base';

export const VIEW_TYPE_DETAILS = 'timemd-details';

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

		const statsRow = body.createDiv({ cls: 'timemd-stats-row' });
		const total = sessions.reduce((sum, s) => sum + s.duration_seconds, 0);
		const avg = total / Math.max(1, sessions.length);
		const longest = sessions.reduce((best, s) => (best.duration_seconds >= s.duration_seconds ? best : s), sessions[0]!);
		addStat(statsRow, 'Sessions', sessions.length.toLocaleString());
		addStat(statsRow, 'Total time', formatDuration(total));
		addStat(statsRow, 'Average session', formatDuration(avg));
		addStat(statsRow, 'Longest', `${longest.app_name} · ${formatDuration(longest.duration_seconds)}`);

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

		const timelineCard = vizGrid.createDiv({ cls: 'timemd-card' });
		timelineCard.createEl('h3', { text: 'Daily timeline' });
		renderDailyTimeline(timelineCard, sessions);

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
	const byDay = new Map<string, SessionRow[]>();
	for (const s of sessions) {
		const key = formatDateISO(s.start_time);
		const daySessions = byDay.get(key) ?? [];
		daySessions.push(s);
		byDay.set(key, daySessions);
	}
	const days = [...byDay.keys()].sort().slice(-14);
	if (days.length === 0) {
		parent.createDiv({ cls: 'timemd-empty-inline', text: 'No sessions.' });
		return;
	}
	const wrap = parent.createDiv({ cls: 'timemd-session-timeline' });
	for (const day of days) {
		const row = wrap.createDiv({ cls: 'timemd-session-timeline-row' });
		row.createDiv({ cls: 'timemd-session-timeline-label', text: day.slice(5) });
		const track = row.createDiv({ cls: 'timemd-session-timeline-track' });
		const daySessions = (byDay.get(day) ?? []).sort((a, b) => a.start_time.getTime() - b.start_time.getTime());
		for (const s of daySessions) {
			const start = secondsSinceStartOfDay(s.start_time);
			const end = Math.min(24 * 3600, start + Math.max(60, s.duration_seconds));
			const seg = track.createDiv({ cls: 'timemd-session-timeline-segment' });
			seg.style.left = `${(start / (24 * 3600)) * 100}%`;
			seg.style.width = `${Math.max(0.4, ((end - start) / (24 * 3600)) * 100)}%`;
			seg.style.background = colorForLabel(s.app_name);
			seg.setAttr('title', `${s.app_name} · ${s.start_time.toLocaleTimeString()} · ${formatDuration(s.duration_seconds)}`);
		}
	}
	const axis = wrap.createDiv({ cls: 'timemd-session-timeline-axis' });
	for (const label of ['12a', '6a', '12p', '6p', '12a']) axis.createSpan({ text: label });
}

function secondsSinceStartOfDay(d: Date): number {
	return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

function addStat(row: HTMLElement, label: string, value: string): void {
	const stat = row.createDiv({ cls: 'timemd-stat' });
	stat.createDiv({ cls: 'timemd-stat-label', text: label });
	stat.createDiv({ cls: 'timemd-stat-value', text: value });
}
