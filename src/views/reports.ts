import { Notice, WorkspaceLeaf } from 'obsidian';
import { DataStore } from '../store';
import { AppRow, CategoryRow, TrendPoint } from '../types';
import { formatDateISO, formatDuration } from '../utils';
import { TimeMdBaseView, TimeMdHost } from './base';

export const VIEW_TYPE_REPORTS = 'timemd-reports';

const SVG_NS = 'http://www.w3.org/2000/svg';

export type ReportsGroupBy = 'app' | 'category' | 'day';
export type ReportsFormat = 'csv' | 'json' | 'markdown';

interface ReportRow {
	rank: number;
	label: string;
	totalSeconds: number;
	sessions?: number;
	pct: number;
}

const GROUP_BY_OPTIONS: Array<{ value: ReportsGroupBy; label: string }> = [
	{ value: 'app', label: 'By App' },
	{ value: 'category', label: 'By Category' },
	{ value: 'day', label: 'By Day' },
];

const FORMAT_OPTIONS: Array<{ value: ReportsFormat; label: string }> = [
	{ value: 'csv', label: 'CSV' },
	{ value: 'json', label: 'JSON' },
	{ value: 'markdown', label: 'Markdown' },
];

export class ReportsView extends TimeMdBaseView {
	private groupBy: ReportsGroupBy = 'app';
	private format: ReportsFormat = 'csv';

	constructor(leaf: WorkspaceLeaf, host: TimeMdHost) {
		super(leaf, host);
	}

	getViewType(): string {
		return VIEW_TYPE_REPORTS;
	}

	getDisplayText(): string {
		return 'timemd-visualizor — Reports';
	}

	getIcon(): string {
		return 'file-text';
	}

	renderBody(body: HTMLElement): void {
		renderReportsContent(body, this.host.store, {
			groupBy: this.groupBy,
			format: this.format,
			interactive: true,
			onGroupByChange: (g) => {
				this.groupBy = g;
				this.refresh();
			},
			onFormatChange: (f) => {
				this.format = f;
				this.refresh();
			},
		});
	}
}

export function renderReportsEmbed(
	el: HTMLElement,
	store: DataStore,
	opts?: { groupBy?: ReportsGroupBy; format?: ReportsFormat },
): void {
	el.addClass('timemd-reports-embed');
	renderReportsContent(el, store, {
		groupBy: opts?.groupBy ?? 'app',
		format: opts?.format ?? 'csv',
		interactive: false,
	});
}

interface RenderOpts {
	groupBy: ReportsGroupBy;
	format: ReportsFormat;
	interactive: boolean;
	onGroupByChange?: (g: ReportsGroupBy) => void;
	onFormatChange?: (f: ReportsFormat) => void;
}

function renderReportsContent(root: HTMLElement, store: DataStore, opts: RenderOpts): void {
	const apps = store.getApps();
	const categories = store.getCategories();
	const trend = store.getTrend();

	if (apps.length === 0 && trend.length === 0) {
		root.createDiv({
			cls: 'timemd-empty-inline',
			text: 'No data to report on. Load an export folder first.',
		});
		return;
	}

	const wrap = root.createDiv({ cls: 'timemd-reports' });

	// Compute report rows for current grouping
	const rows = buildRows(opts.groupBy, apps, categories, trend);
	const totalSeconds = rows.reduce((s, r) => s + r.totalSeconds, 0);

	// Header: title + date range subtitle + Export button
	renderReportsHeader(wrap, store, opts, rows, totalSeconds);

	// Toolbar (interactive only)
	if (opts.interactive) {
		renderToolbar(wrap, opts);
	}

	// Stats cards
	renderStats(wrap, store, apps, categories);

	// TIME DISTRIBUTION
	if (trend.length > 0) {
		const distSection = wrap.createDiv({ cls: 'timemd-reports-section' });
		distSection.createEl('div', {
			cls: 'timemd-reports-section-title',
			text: 'TIME DISTRIBUTION',
		});
		const distCard = distSection.createDiv({ cls: 'timemd-card' });
		renderVerticalBars(
			distCard,
			trend.map((t) => ({
				label: shortDateLabel(t.date),
				value: t.total_seconds,
			})),
			{ height: 280, formatValue: formatDuration, showValuesOnBars: false },
		);
	}

	// WEEKDAY AVERAGES
	if (trend.length > 0) {
		const weekdayBars = computeWeekdayAverages(trend);
		const wkSection = wrap.createDiv({ cls: 'timemd-reports-section' });
		wkSection.createEl('div', {
			cls: 'timemd-reports-section-title',
			text: 'WEEKDAY AVERAGES',
		});
		const wkCard = wkSection.createDiv({ cls: 'timemd-card' });
		renderVerticalBars(wkCard, weekdayBars, {
			height: 220,
			formatValue: formatDuration,
			showValuesOnBars: true,
			alwaysShowAllLabels: true,
		});
	}

	// REPORT DATA
	const tableSection = wrap.createDiv({ cls: 'timemd-reports-section' });
	tableSection.createEl('div', {
		cls: 'timemd-reports-section-title',
		text: 'REPORT DATA',
	});
	const tableCard = tableSection.createDiv({ cls: 'timemd-card' });
	renderTable(tableCard, opts.groupBy, rows);
}

function renderReportsHeader(
	wrap: HTMLElement,
	store: DataStore,
	opts: RenderOpts,
	rows: ReportRow[],
	totalSeconds: number,
): void {
	const header = wrap.createDiv({ cls: 'timemd-reports-header' });
	const titleBlock = header.createDiv({ cls: 'timemd-reports-title-block' });
	titleBlock.createEl('h2', { cls: 'timemd-reports-title', text: 'Reports' });
	const range = store.getDateRange();
	if (range) {
		titleBlock.createDiv({
			cls: 'timemd-reports-subtitle',
			text: formatRangeUpper(range.start, range.end),
		});
	}

	const exportBtn = header.createEl('button', {
		cls: 'timemd-reports-export-btn',
		text: 'Export',
	});
	exportBtn.addEventListener('click', () => {
		const text = buildExportString(opts.groupBy, opts.format, rows, totalSeconds);
		const writeToClipboard = navigator?.clipboard?.writeText
			? navigator.clipboard.writeText(text)
			: Promise.reject(new Error('clipboard unavailable'));
		Promise.resolve(writeToClipboard)
			.then(() => new Notice('Copied to clipboard'))
			.catch(() => new Notice('Failed to copy to clipboard'));
	});
}

function renderToolbar(wrap: HTMLElement, opts: RenderOpts): void {
	const toolbar = wrap.createDiv({ cls: 'timemd-reports-toolbar' });

	const groupGroup = toolbar.createDiv({ cls: 'timemd-reports-pillgroup' });
	groupGroup.createSpan({ cls: 'timemd-reports-pill-label', text: 'Group by' });
	const groupPills = groupGroup.createDiv({ cls: 'timemd-reports-pills' });
	for (const opt of GROUP_BY_OPTIONS) {
		const pill = groupPills.createEl('button', {
			cls:
				'timemd-reports-pill' +
				(opt.value === opts.groupBy ? ' timemd-reports-pill-active' : ''),
			text: opt.label,
		});
		pill.addEventListener('click', () => opts.onGroupByChange?.(opt.value));
	}

	const formatGroup = toolbar.createDiv({
		cls: 'timemd-reports-pillgroup timemd-reports-pillgroup-right',
	});
	formatGroup.createSpan({ cls: 'timemd-reports-pill-label', text: 'Format' });
	const formatPills = formatGroup.createDiv({ cls: 'timemd-reports-pills' });
	for (const opt of FORMAT_OPTIONS) {
		const pill = formatPills.createEl('button', {
			cls:
				'timemd-reports-pill' +
				(opt.value === opts.format ? ' timemd-reports-pill-active' : ''),
			text: opt.label,
		});
		pill.addEventListener('click', () => opts.onFormatChange?.(opt.value));
	}
}

function renderStats(
	wrap: HTMLElement,
	store: DataStore,
	apps: AppRow[],
	categories: CategoryRow[],
): void {
	const statsRow = wrap.createDiv({ cls: 'timemd-stats-row timemd-reports-stats' });

	const totalSeconds = store.getTotalSeconds();
	const range = store.getDateRange();

	addStatCard(
		statsRow,
		'TOTAL TIME',
		formatDuration(totalSeconds),
		range ? formatRangeUpper(range.start, range.end) : '',
	);
	addStatCard(
		statsRow,
		'APPS TRACKED',
		String(apps.length),
		`${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`,
	);
	const top = apps[0];
	addStatCard(
		statsRow,
		'TOP APP',
		top?.app_name ?? '—',
		top ? formatDuration(top.total_seconds) : '',
	);
}

function addStatCard(row: HTMLElement, label: string, value: string, sub: string): void {
	const stat = row.createDiv({ cls: 'timemd-stat timemd-reports-stat' });
	stat.createDiv({ cls: 'timemd-stat-label', text: label });
	stat.createDiv({ cls: 'timemd-stat-value', text: value });
	if (sub) {
		stat.createDiv({ cls: 'timemd-reports-stat-sub', text: sub });
	}
}

function renderTable(parent: HTMLElement, groupBy: ReportsGroupBy, rows: ReportRow[]): void {
	if (rows.length === 0) {
		parent.createDiv({ cls: 'timemd-empty-inline', text: 'No rows.' });
		return;
	}

	const labelHeader =
		groupBy === 'app' ? 'APP' : groupBy === 'category' ? 'CATEGORY' : 'DATE';
	const showSessions = groupBy !== 'category';

	type SortKey = 'rank' | 'label' | 'time' | 'sessions' | 'pct';
	let sortKey: SortKey = 'rank';
	let sortDir: 'asc' | 'desc' = 'asc';

	const wrapEl = parent.createDiv({ cls: 'timemd-table-wrap' });
	const table = wrapEl.createEl('table', { cls: 'timemd-table timemd-reports-table' });

	const draw = () => {
		table.empty();
		const head = table.createEl('thead').createEl('tr');
		const cols: Array<{ key: SortKey; text: string; numeric: boolean }> = [
			{ key: 'rank', text: '#', numeric: true },
			{ key: 'label', text: labelHeader, numeric: false },
			{ key: 'time', text: 'TIME', numeric: true },
		];
		if (showSessions) cols.push({ key: 'sessions', text: 'SESSIONS', numeric: true });
		cols.push({ key: 'pct', text: '%', numeric: true });

		for (const c of cols) {
			const th = head.createEl('th', {
				text: c.text,
				cls:
					'timemd-reports-th' +
					(c.numeric ? ' timemd-reports-num' : '') +
					(sortKey === c.key
						? sortDir === 'asc'
							? ' timemd-reports-sort-asc'
							: ' timemd-reports-sort-desc'
						: ''),
			});
			th.addEventListener('click', () => {
				if (sortKey === c.key) {
					sortDir = sortDir === 'asc' ? 'desc' : 'asc';
				} else {
					sortKey = c.key;
					sortDir = c.numeric ? 'desc' : 'asc';
				}
				draw();
			});
		}

		const sorted = [...rows].sort((a, b) => {
			let av: number | string = 0;
			let bv: number | string = 0;
			switch (sortKey) {
				case 'rank':
					av = a.rank;
					bv = b.rank;
					break;
				case 'label':
					av = a.label.toLowerCase();
					bv = b.label.toLowerCase();
					break;
				case 'time':
					av = a.totalSeconds;
					bv = b.totalSeconds;
					break;
				case 'sessions':
					av = a.sessions ?? 0;
					bv = b.sessions ?? 0;
					break;
				case 'pct':
					av = a.pct;
					bv = b.pct;
					break;
			}
			if (av < bv) return sortDir === 'asc' ? -1 : 1;
			if (av > bv) return sortDir === 'asc' ? 1 : -1;
			return 0;
		});

		const tbody = table.createEl('tbody');
		for (const r of sorted) {
			const tr = tbody.createEl('tr');
			tr.createEl('td', { cls: 'timemd-reports-num', text: String(r.rank).padStart(2, '0') });
			tr.createEl('td', { text: r.label });
			tr.createEl('td', { cls: 'timemd-reports-num', text: formatDuration(r.totalSeconds) });
			if (showSessions) {
				tr.createEl('td', {
					cls: 'timemd-reports-num',
					text: r.sessions != null ? String(r.sessions) : '—',
				});
			}
			tr.createEl('td', { cls: 'timemd-reports-num', text: `${r.pct.toFixed(1)}%` });
		}
	};

	draw();
}

function buildRows(
	groupBy: ReportsGroupBy,
	apps: AppRow[],
	categories: CategoryRow[],
	trend: TrendPoint[],
): ReportRow[] {
	if (groupBy === 'app') {
		const total = apps.reduce((s, a) => s + a.total_seconds, 0) || 1;
		return apps.map((a, i) => ({
			rank: i + 1,
			label: a.app_name,
			totalSeconds: a.total_seconds,
			sessions: a.session_count,
			pct: (a.total_seconds / total) * 100,
		}));
	}
	if (groupBy === 'category') {
		const total = categories.reduce((s, c) => s + c.total_seconds, 0) || 1;
		return categories.map((c, i) => ({
			rank: i + 1,
			label: c.category,
			totalSeconds: c.total_seconds,
			pct: (c.total_seconds / total) * 100,
		}));
	}
	// by day
	const sortedByTime = [...trend].sort((a, b) => b.total_seconds - a.total_seconds);
	const total = sortedByTime.reduce((s, t) => s + t.total_seconds, 0) || 1;
	return sortedByTime.map((t, i) => ({
		rank: i + 1,
		label: formatDateISO(t.date),
		totalSeconds: t.total_seconds,
		sessions: undefined,
		pct: (t.total_seconds / total) * 100,
	}));
}

function buildExportString(
	groupBy: ReportsGroupBy,
	format: ReportsFormat,
	rows: ReportRow[],
	_totalSeconds: number,
): string {
	const showSessions = groupBy !== 'category';
	const labelHeader =
		groupBy === 'app' ? 'app' : groupBy === 'category' ? 'category' : 'date';

	const headers = ['rank', labelHeader, 'time', 'time_seconds'];
	if (showSessions) headers.push('sessions');
	headers.push('percent');

	const dataRows = rows.map((r) => {
		const o: Record<string, string | number> = {
			rank: r.rank,
			[labelHeader]: r.label,
			time: formatDuration(r.totalSeconds),
			time_seconds: r.totalSeconds,
		};
		if (showSessions) o.sessions = r.sessions ?? 0;
		o.percent = Number(r.pct.toFixed(1));
		return o;
	});

	if (format === 'json') {
		return JSON.stringify(dataRows, null, 2);
	}
	if (format === 'csv') {
		const lines = [headers.join(',')];
		for (const row of dataRows) {
			lines.push(headers.map((h) => csvEscape(row[h])).join(','));
		}
		return lines.join('\n');
	}
	// markdown
	const headerLine = `| ${headers.join(' | ')} |`;
	const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
	const bodyLines = dataRows.map(
		(row) => `| ${headers.map((h) => mdEscape(row[h])).join(' | ')} |`,
	);
	return [headerLine, sepLine, ...bodyLines].join('\n');
}

function csvEscape(v: string | number | undefined): string {
	const s = v == null ? '' : String(v);
	if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
	return s;
}

function mdEscape(v: string | number | undefined): string {
	const s = v == null ? '' : String(v);
	return s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function computeWeekdayAverages(trend: TrendPoint[]): Array<{ label: string; value: number }> {
	// 0=Sun..6=Sat from getDay(); we want Mon..Sun in output
	const sums = [0, 0, 0, 0, 0, 0, 0];
	const counts = [0, 0, 0, 0, 0, 0, 0];
	for (const t of trend) {
		const d = t.date.getDay();
		sums[d] = (sums[d] ?? 0) + t.total_seconds;
		counts[d] = (counts[d] ?? 0) + 1;
	}
	const avg = (i: number) => ((counts[i] ?? 0) > 0 ? (sums[i] ?? 0) / (counts[i] ?? 1) : 0);
	const order: Array<{ idx: number; label: string }> = [
		{ idx: 1, label: 'Mon' },
		{ idx: 2, label: 'Tue' },
		{ idx: 3, label: 'Wed' },
		{ idx: 4, label: 'Thu' },
		{ idx: 5, label: 'Fri' },
		{ idx: 6, label: 'Sat' },
		{ idx: 0, label: 'Sun' },
	];
	return order.map((o) => ({ label: o.label, value: avg(o.idx) }));
}

function shortDateLabel(d: Date): string {
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatRangeUpper(start: Date, end: Date): string {
	const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
	const fmt = (d: Date) =>
		`${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
	if (start.getTime() === end.getTime()) return fmt(start);
	return `${fmt(start)} - ${fmt(end)}`;
}

// --- Inline vertical bar chart ---

function svgEl(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
	const el = document.createElementNS(SVG_NS, tag);
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
	return el;
}

interface VBarRow {
	label: string;
	value: number;
}

interface VBarOpts {
	width?: number;
	height?: number;
	formatValue?: (v: number) => string;
	showValuesOnBars?: boolean;
	alwaysShowAllLabels?: boolean;
}

function renderVerticalBars(parent: HTMLElement, data: VBarRow[], opts: VBarOpts = {}): void {
	const width = opts.width ?? 720;
	const height = opts.height ?? 240;
	const pad = { l: 32, r: 12, t: 12, b: 24 };
	const innerW = width - pad.l - pad.r;
	const innerH = height - pad.t - pad.b;
	const fmt = opts.formatValue ?? ((v: number) => String(v));
	const color = 'var(--timemd-accent, var(--interactive-accent))';

	const root = svgEl('svg', {
		class: 'timemd-chart timemd-reports-vbars',
		width,
		height,
		viewBox: `0 0 ${width} ${height}`,
		preserveAspectRatio: 'none',
	});
	parent.appendChild(root);

	if (data.length === 0) {
		const txt = svgEl('text', {
			x: width / 2,
			y: height / 2,
			'text-anchor': 'middle',
			class: 'timemd-axis-label',
		});
		txt.textContent = 'No data';
		root.appendChild(txt);
		return;
	}

	const maxRaw = Math.max(1, ...data.map((d) => d.value));
	const maxY = niceMax(maxRaw);

	// Gridlines + y-axis labels (5 lines)
	for (let i = 0; i <= 4; i++) {
		const t = i / 4;
		const y = pad.t + (1 - t) * innerH;
		root.appendChild(
			svgEl('line', {
				x1: pad.l,
				x2: pad.l + innerW,
				y1: y,
				y2: y,
				class: 'timemd-chart-grid',
			}),
		);
		const lbl = svgEl('text', {
			x: pad.l - 6,
			y: y + 4,
			'text-anchor': 'end',
			class: 'timemd-axis-label',
		});
		lbl.textContent = formatAxisDuration(maxY * t);
		root.appendChild(lbl);
	}

	// Bars
	const slot = innerW / data.length;
	const barW = Math.max(2, slot * 0.7);
	for (let i = 0; i < data.length; i++) {
		const d = data[i]!;
		const h = (d.value / maxY) * innerH;
		const x = pad.l + i * slot + (slot - barW) / 2;
		const y = pad.t + (innerH - h);
		const rect = svgEl('rect', {
			x,
			y,
			width: barW,
			height: Math.max(0, h),
			rx: 3,
			fill: color,
			class: 'timemd-reports-vbar',
		});
		const title = svgEl('title');
		title.textContent = `${d.label}: ${fmt(d.value)}`;
		rect.appendChild(title);
		root.appendChild(rect);

		if (opts.showValuesOnBars && d.value > 0) {
			const lbl = svgEl('text', {
				x: x + barW / 2,
				y: y - 4,
				'text-anchor': 'middle',
				class: 'timemd-axis-label timemd-reports-vbar-value',
			});
			lbl.textContent = fmt(d.value);
			root.appendChild(lbl);
		}
	}

	// X labels: every Nth where N = ceil(total/8), unless alwaysShowAllLabels
	const labelEvery = opts.alwaysShowAllLabels ? 1 : Math.max(1, Math.ceil(data.length / 8));
	for (let i = 0; i < data.length; i++) {
		if (i % labelEvery !== 0 && i !== data.length - 1) continue;
		if (i % labelEvery !== 0) continue;
		const cx = pad.l + i * slot + slot / 2;
		const t = svgEl('text', {
			x: cx,
			y: pad.t + innerH + 16,
			'text-anchor': 'middle',
			class: 'timemd-axis-label',
		});
		t.textContent = data[i]!.label;
		root.appendChild(t);
	}
}

function niceMax(v: number): number {
	if (v <= 0) return 1;
	// Round up to a "nice" value for axis: 1, 2, 5 * 10^n
	const exp = Math.floor(Math.log10(v));
	const base = Math.pow(10, exp);
	const norm = v / base;
	let nice: number;
	if (norm <= 1) nice = 1;
	else if (norm <= 2) nice = 2;
	else if (norm <= 5) nice = 5;
	else nice = 10;
	return nice * base;
}

function formatAxisDuration(seconds: number): string {
	if (seconds <= 0) return '0';
	const h = seconds / 3600;
	if (h >= 1) {
		// Whole hours where possible
		const rounded = Math.round(h * 10) / 10;
		return Number.isInteger(rounded) ? `${rounded}h` : `${rounded}h`;
	}
	const m = seconds / 60;
	return `${Math.round(m)}m`;
}
