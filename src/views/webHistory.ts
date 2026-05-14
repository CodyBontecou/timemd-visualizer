import { WorkspaceLeaf } from 'obsidian';
import { renderBarList } from '../charts';
import { DataStore } from '../store';
import { Row } from '../types';
import { formatDateISO, formatDuration, parseDate } from '../utils';
import { TimeMdBaseView, TimeMdHost } from './base';

export const VIEW_TYPE_WEB_HISTORY = 'timemd-web-history';

type SubTab = 'timeline' | 'domains' | 'activity';

interface VisitRow {
	visit_time: Date;
	url: string;
	title: string;
	domain: string;
	browser: string;
}

interface DomainRow {
	domain: string;
	visit_count: number;
	total_duration_seconds: number;
	last_visit_time: Date | undefined;
}

const TIMELINE_LIMIT = 500;

export class WebHistoryView extends TimeMdBaseView {
	private filter = '';
	private browser = 'All';
	private tab: SubTab = 'timeline';

	constructor(leaf: WorkspaceLeaf, host: TimeMdHost) {
		super(leaf, host);
	}

	getViewType(): string {
		return VIEW_TYPE_WEB_HISTORY;
	}

	getDisplayText(): string {
		return 'Web history';
	}

	getIcon(): string {
		return 'globe';
	}

	renderBody(body: HTMLElement): void {
		const visits = collectVisits(this.host.store);
		const domains = collectDomains(this.host.store);

		if (visits.length === 0) {
			body.createDiv({
				cls: 'timemd-empty-inline',
				text: 'No web history data in the loaded exports. Re-export with the Web History section enabled.',
			});
			return;
		}

		const container = body.createDiv({ cls: 'timemd-history' });

		const headerRow = container.createDiv({ cls: 'timemd-history-header' });
		const headerLeft = headerRow.createDiv({ cls: 'timemd-history-header-left' });
		headerLeft.createDiv({ cls: 'timemd-history-title', text: 'Web History' });
		headerLeft.createDiv({
			cls: 'timemd-history-subtitle',
			text: formatRangeSubtitle(visits),
		});

		const browsers = uniqueBrowsers(visits);
		const browserGroup = headerRow.createDiv({ cls: 'timemd-history-browsers' });
		const allOpts = ['All', ...browsers];
		if (!allOpts.includes(this.browser)) this.browser = 'All';
		for (const opt of allOpts) {
			const pill = browserGroup.createEl('button', {
				cls:
					'timemd-history-pill' +
					(opt === this.browser ? ' timemd-history-pill-active' : ''),
				text: opt,
			});
			pill.addEventListener('click', () => {
				this.browser = opt;
				this.refresh();
			});
		}

		const filtered =
			this.browser === 'All'
				? visits
				: visits.filter(
						(v) => v.browser.toLowerCase() === this.browser.toLowerCase(),
					);

		const stats = computeStats(filtered);
		const statsRow = container.createDiv({ cls: 'timemd-stats-row timemd-history-stats' });
		addStatCard(statsRow, 'Total visits', String(stats.totalVisits), 'circle');
		addStatCard(statsRow, 'Domains', String(stats.domains), 'link');
		addStatCard(statsRow, 'Daily avg', String(stats.dailyAvg), 'chart');
		addStatCard(statsRow, 'Peak hour', stats.peakHour, 'clock');

		const tabsRow = container.createDiv({ cls: 'timemd-history-tabs' });
		const tabDefs: Array<{ id: SubTab; label: string }> = [
			{ id: 'timeline', label: 'Timeline' },
			{ id: 'domains', label: 'Top Domains' },
			{ id: 'activity', label: 'Activity' },
		];
		for (const def of tabDefs) {
			const btn = tabsRow.createEl('button', {
				cls:
					'timemd-history-tab' +
					(def.id === this.tab ? ' timemd-history-tab-active' : ''),
				text: def.label,
			});
			btn.addEventListener('click', () => {
				this.tab = def.id;
				this.refresh();
			});
		}

		const tabBody = container.createDiv({ cls: 'timemd-history-tab-body' });

		if (this.tab === 'timeline') {
			renderTimeline(tabBody, filtered, {
				filter: this.filter,
				onFilterChange: (v) => {
					this.filter = v;
				},
			});
		} else if (this.tab === 'domains') {
			renderDomains(tabBody, filtered, domains);
		} else {
			renderActivity(tabBody, filtered);
		}
	}
}

export interface WebHistoryEmbedOptions {
	limit?: number;
	tab?: SubTab;
	browser?: string;
}

export function renderWebHistoryEmbed(
	el: HTMLElement,
	store: DataStore,
	opts: WebHistoryEmbedOptions = {},
): void {
	const visits = collectVisits(store);
	if (visits.length === 0) {
		el.createDiv({
			cls: 'timemd-embed-empty',
			text: 'No web history data in the loaded exports. Re-export with the Web History section enabled.',
		});
		return;
	}

	const container = el.createDiv({ cls: 'timemd-history timemd-history-embed' });

	const browser = opts.browser && opts.browser.length > 0 ? opts.browser : 'All';
	const filtered =
		browser === 'All'
			? visits
			: visits.filter((v) => v.browser.toLowerCase() === browser.toLowerCase());

	const stats = computeStats(filtered);
	const statsRow = container.createDiv({ cls: 'timemd-stats-row timemd-history-stats' });
	addStatCard(statsRow, 'Total visits', String(stats.totalVisits), 'circle');
	addStatCard(statsRow, 'Domains', String(stats.domains), 'link');
	addStatCard(statsRow, 'Daily avg', String(stats.dailyAvg), 'chart');
	addStatCard(statsRow, 'Peak hour', stats.peakHour, 'clock');

	const tab: SubTab = opts.tab ?? 'timeline';
	const tabBody = container.createDiv({ cls: 'timemd-history-tab-body' });

	if (tab === 'timeline') {
		const slice = opts.limit && opts.limit > 0 ? filtered.slice(0, opts.limit) : filtered;
		renderTimeline(tabBody, slice, {
			filter: '',
			onFilterChange: () => undefined,
			showSearch: false,
			limit: opts.limit ?? TIMELINE_LIMIT,
		});
	} else if (tab === 'domains') {
		renderDomains(tabBody, filtered, collectDomains(store), opts.limit);
	} else {
		renderActivity(tabBody, filtered);
	}
}

function collectVisits(store: DataStore): VisitRow[] {
	const out: VisitRow[] = [];
	for (const section of store.allSections('browsing_history')) {
		for (const row of section.rows) {
			const ts = parseDate(row['visit_time']);
			if (!ts) continue;
			out.push({
				visit_time: ts,
				url: rowString(row, 'url'),
				title: rowString(row, 'title'),
				domain: rowString(row, 'domain'),
				browser: rowString(row, 'browser'),
			});
		}
	}
	out.sort((a, b) => b.visit_time.getTime() - a.visit_time.getTime());
	return out;
}

function collectDomains(store: DataStore): DomainRow[] {
	const map = new Map<string, DomainRow>();
	for (const section of store.allSections('top_domains')) {
		for (const row of section.rows) {
			const domain = rowString(row, 'domain');
			if (!domain) continue;
			const existing =
				map.get(domain) ?? {
					domain,
					visit_count: 0,
					total_duration_seconds: 0,
					last_visit_time: undefined as Date | undefined,
				};
			existing.visit_count += rowNumber(row, 'visit_count');
			existing.total_duration_seconds += rowNumber(row, 'total_duration_seconds');
			const last = parseDate(row['last_visit_time']);
			if (last && (!existing.last_visit_time || last > existing.last_visit_time)) {
				existing.last_visit_time = last;
			}
			map.set(domain, existing);
		}
	}
	return [...map.values()].sort(
		(a, b) => b.total_duration_seconds - a.total_duration_seconds,
	);
}

function rowString(row: Row, key: string): string {
	const v = row[key];
	if (v == null) return '';
	return String(v).trim();
}

function rowNumber(row: Row, key: string): number {
	const v = row[key];
	if (typeof v === 'number') return v;
	if (typeof v === 'string') {
		const n = Number(v);
		return Number.isFinite(n) ? n : 0;
	}
	return 0;
}

function uniqueBrowsers(visits: VisitRow[]): string[] {
	const set = new Set<string>();
	for (const v of visits) {
		if (v.browser) set.add(v.browser);
	}
	return [...set].sort((a, b) => a.localeCompare(b));
}

function formatRangeSubtitle(visits: VisitRow[]): string {
	if (visits.length === 0) return '';
	let min = visits[0]!.visit_time;
	let max = visits[0]!.visit_time;
	for (const v of visits) {
		if (v.visit_time < min) min = v.visit_time;
		if (v.visit_time > max) max = v.visit_time;
	}
	const fmt = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
	const a = fmt.format(min).toUpperCase();
	const b = fmt.format(max).toUpperCase();
	return a === b ? `${a} - ${b}` : `${a} - ${b}`;
}

interface VisitStats {
	totalVisits: number;
	domains: number;
	dailyAvg: number;
	peakHour: string;
}

function computeStats(visits: VisitRow[]): VisitStats {
	const totalVisits = visits.length;
	const domainSet = new Set<string>();
	const daySet = new Set<string>();
	const hours = new Array<number>(24).fill(0);

	for (const v of visits) {
		if (v.domain) domainSet.add(v.domain);
		daySet.add(formatDateISO(v.visit_time));
		const h = v.visit_time.getHours();
		if (h >= 0 && h < 24) hours[h] = (hours[h] ?? 0) + 1;
	}

	const days = Math.max(1, daySet.size);
	const dailyAvg = totalVisits === 0 ? 0 : Math.round(totalVisits / days);

	let peakHourIndex = 0;
	let peakHourCount = -1;
	for (let h = 0; h < 24; h++) {
		const c = hours[h] ?? 0;
		if (c > peakHourCount) {
			peakHourCount = c;
			peakHourIndex = h;
		}
	}

	return {
		totalVisits,
		domains: domainSet.size,
		dailyAvg,
		peakHour: totalVisits === 0 ? '—' : formatHour(peakHourIndex),
	};
}

function formatHour(h: number): string {
	if (h === 0) return '12AM';
	if (h < 12) return `${h}AM`;
	if (h === 12) return '12PM';
	return `${h - 12}PM`;
}

function addStatCard(
	row: HTMLElement,
	label: string,
	value: string,
	icon: 'circle' | 'link' | 'chart' | 'clock',
): void {
	const stat = row.createDiv({ cls: 'timemd-stat timemd-history-stat' });
	const top = stat.createDiv({ cls: 'timemd-history-stat-top' });
	const iconEl = top.createDiv({ cls: `timemd-history-stat-icon timemd-history-icon-${icon}` });
	iconEl.setText(iconGlyph(icon));
	top.createDiv({ cls: 'timemd-stat-label timemd-history-stat-label', text: label });
	stat.createDiv({ cls: 'timemd-stat-value timemd-history-stat-value', text: value });
}

function iconGlyph(icon: 'circle' | 'link' | 'chart' | 'clock'): string {
	switch (icon) {
		case 'circle':
			return '○';
		case 'link':
			return '\u{1F517}';
		case 'chart':
			return '\u{1F4CA}';
		case 'clock':
			return '\u{1F551}';
	}
}

interface TimelineOpts {
	filter: string;
	onFilterChange: (value: string) => void;
	showSearch?: boolean;
	limit?: number;
}

function renderTimeline(parent: HTMLElement, visits: VisitRow[], opts: TimelineOpts): void {
	const showSearch = opts.showSearch !== false;
	const limit = opts.limit ?? TIMELINE_LIMIT;

	let filterValue = opts.filter;
	const tableWrap = parent.createDiv({ cls: 'timemd-history-table-wrap' });

	if (showSearch) {
		const searchWrap = parent.createDiv({ cls: 'timemd-history-search' });
		const input = searchWrap.createEl('input', {
			type: 'text',
			placeholder: 'Search URLs, titles, domains…',
			cls: 'timemd-filter-input timemd-history-search-input',
		});
		input.value = filterValue;
		const overflowNote = parent.createDiv({ cls: 'timemd-history-overflow' });
		const renderRows = (): void => {
			tableWrap.empty();
			overflowNote.empty();
			drawTimelineTable(tableWrap, overflowNote, visits, filterValue, limit);
		};
		input.addEventListener('input', () => {
			filterValue = input.value;
			opts.onFilterChange(filterValue);
			renderRows();
		});
		// Reorder so search appears above the table
		parent.insertBefore(searchWrap, tableWrap);
		parent.appendChild(overflowNote);
		renderRows();
	} else {
		const overflowNote = parent.createDiv({ cls: 'timemd-history-overflow' });
		drawTimelineTable(tableWrap, overflowNote, visits, filterValue, limit);
	}
}

function drawTimelineTable(
	tableWrap: HTMLElement,
	overflowNote: HTMLElement,
	visits: VisitRow[],
	filter: string,
	limit: number,
): void {
	const needle = filter.trim().toLowerCase();
	const filtered = needle
		? visits.filter(
				(v) =>
					v.url.toLowerCase().includes(needle) ||
					v.title.toLowerCase().includes(needle) ||
					v.domain.toLowerCase().includes(needle),
			)
		: visits;
	const shown = filtered.slice(0, limit);

	const table = tableWrap.createEl('table', {
		cls: 'timemd-table timemd-history-table',
	});
	const head = table.createEl('thead').createEl('tr');
	head.createEl('th', { text: 'Time' });
	head.createEl('th', { text: 'Title / URL' });
	head.createEl('th', { text: 'Domain' });
	head.createEl('th', { text: 'BRC' });
	const tbody = table.createEl('tbody');

	let lastDayKey = '';
	for (const v of shown) {
		const dayKey = formatDateISO(v.visit_time);
		if (dayKey !== lastDayKey) {
			lastDayKey = dayKey;
			const dayRow = tbody.createEl('tr', { cls: 'timemd-history-day-row' });
			const dayCell = dayRow.createEl('td');
			dayCell.colSpan = 4;
			dayCell.addClass('timemd-history-day-cell');
			dayCell.setText(formatDayHeader(v.visit_time));
		}

		const tr = tbody.createEl('tr', { cls: 'timemd-history-row' });
		const timeCell = tr.createEl('td', { cls: 'timemd-history-time' });
		timeCell.setText(formatHHMM(v.visit_time));

		const titleCell = tr.createEl('td', { cls: 'timemd-history-title-cell' });
		titleCell.createDiv({
			cls: 'timemd-history-row-title',
			text: v.title || v.url || '(untitled)',
		});
		if (v.url) {
			titleCell.createDiv({ cls: 'timemd-history-row-url', text: v.url });
		}

		tr.createEl('td', { cls: 'timemd-history-domain', text: v.domain });

		const brcCell = tr.createEl('td', { cls: 'timemd-history-brc' });
		const dot = brcCell.createSpan({ cls: 'timemd-history-browser-dot' });
		dot.setAttr('title', v.browser || 'unknown');
		if (v.browser) dot.addClass(`timemd-history-browser-${slug(v.browser)}`);
	}

	if (filtered.length > shown.length) {
		overflowNote.setText(
			`Showing first ${shown.length} of ${filtered.length} visits. Refine your search to see more.`,
		);
	}
}

function formatDayHeader(d: Date): string {
	const fmt = new Intl.DateTimeFormat(undefined, {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
	});
	return fmt.format(d).toUpperCase();
}

function formatHHMM(d: Date): string {
	const h = String(d.getHours()).padStart(2, '0');
	const m = String(d.getMinutes()).padStart(2, '0');
	return `${h}:${m}`;
}

function slug(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

function renderDomains(
	parent: HTMLElement,
	visits: VisitRow[],
	domainsFromExport: DomainRow[],
	limit?: number,
): void {
	const merged = mergeDomains(visits, domainsFromExport);
	if (merged.length === 0) {
		parent.createDiv({ cls: 'timemd-empty-inline', text: 'No domain data.' });
		return;
	}
	const cap = limit && limit > 0 ? limit : 15;
	const top = merged.slice(0, cap);

	const barsWrap = parent.createDiv({ cls: 'timemd-history-bars' });
	renderBarList(
		barsWrap,
		top.map((d) => ({ label: d.domain, value: d.total_duration_seconds })),
		{ formatValue: formatDuration },
	);

	const tableWrap = parent.createDiv({ cls: 'timemd-table-wrap timemd-history-domain-table' });
	const table = tableWrap.createEl('table', { cls: 'timemd-table' });
	const head = table.createEl('thead').createEl('tr');
	head.createEl('th', { text: 'Domain' });
	head.createEl('th', { text: 'Visits' });
	head.createEl('th', { text: 'Duration' });
	head.createEl('th', { text: 'Last visit' });
	const tbody = table.createEl('tbody');
	for (const d of top) {
		const tr = tbody.createEl('tr');
		tr.createEl('td', { text: d.domain });
		tr.createEl('td', { text: String(d.visit_count) });
		tr.createEl('td', { text: formatDuration(d.total_duration_seconds) });
		tr.createEl('td', {
			text: d.last_visit_time ? d.last_visit_time.toLocaleString() : '—',
		});
	}
}

function mergeDomains(visits: VisitRow[], exported: DomainRow[]): DomainRow[] {
	const map = new Map<string, DomainRow>();
	for (const e of exported) {
		map.set(e.domain, {
			domain: e.domain,
			visit_count: e.visit_count,
			total_duration_seconds: e.total_duration_seconds,
			last_visit_time: e.last_visit_time,
		});
	}
	for (const v of visits) {
		if (!v.domain) continue;
		const existing =
			map.get(v.domain) ?? {
				domain: v.domain,
				visit_count: 0,
				total_duration_seconds: 0,
				last_visit_time: undefined as Date | undefined,
			};
		if (!exported.some((e) => e.domain === v.domain)) {
			existing.visit_count += 1;
		}
		if (!existing.last_visit_time || v.visit_time > existing.last_visit_time) {
			existing.last_visit_time = v.visit_time;
		}
		map.set(v.domain, existing);
	}
	return [...map.values()].sort(
		(a, b) =>
			b.total_duration_seconds - a.total_duration_seconds ||
			b.visit_count - a.visit_count,
	);
}

function renderActivity(parent: HTMLElement, visits: VisitRow[]): void {
	if (visits.length === 0) {
		parent.createDiv({ cls: 'timemd-empty-inline', text: 'No activity data.' });
		return;
	}
	const hours = new Array<number>(24).fill(0);
	for (const v of visits) {
		const h = v.visit_time.getHours();
		if (h >= 0 && h < 24) hours[h] = (hours[h] ?? 0) + 1;
	}
	const max = Math.max(1, ...hours);

	const wrap = parent.createDiv({ cls: 'timemd-history-activity' });
	const chart = wrap.createDiv({ cls: 'timemd-history-activity-chart' });
	for (let h = 0; h < 24; h++) {
		const col = chart.createDiv({ cls: 'timemd-history-activity-col' });
		const bar = col.createDiv({ cls: 'timemd-history-activity-bar' });
		const pct = Math.round(((hours[h] ?? 0) / max) * 100);
		bar.style.height = `${pct}%`;
		bar.setAttr('title', `${formatHour(h)} — ${hours[h] ?? 0} visit${hours[h] === 1 ? '' : 's'}`);
		const label = col.createDiv({ cls: 'timemd-history-activity-label' });
		if (h % 3 === 0) label.setText(formatHour(h));
	}

	const summary = wrap.createDiv({ cls: 'timemd-history-activity-summary' });
	const total = visits.length;
	summary.setText(`${total} visit${total === 1 ? '' : 's'} across 24 hours`);
}
