import { WorkspaceLeaf } from 'obsidian';
import { renderBarList } from '../charts';
import { DataStore } from '../store';
import { Row, TopDomainRow } from '../types';
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

type DomainRow = TopDomainRow;

type DomainClass = 'Work / learning' | 'Consumption' | 'Social' | 'Commerce' | 'Unknown';

interface DomainClassSummary {
	label: DomainClass;
	domains: number;
	visits: number;
	knownDurationSeconds: number;
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

		if (visits.length === 0 && domains.length === 0) {
			body.createDiv({
				cls: 'timemd-empty-inline',
				text: 'No web history data in the loaded exports. Re-export with the Web History section enabled.',
			});
			return;
		}
		if (visits.length === 0 && this.tab !== 'domains') this.tab = 'domains';

		const container = body.createDiv({ cls: 'timemd-history' });

		const headerRow = container.createDiv({ cls: 'timemd-history-header' });
		const headerLeft = headerRow.createDiv({ cls: 'timemd-history-header-left' });
		headerLeft.createDiv({ cls: 'timemd-history-title', text: 'Web History' });
		headerLeft.createDiv({
			cls: 'timemd-history-subtitle',
			text: formatHistoryRangeSubtitle(visits, domains),
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
			renderDomains(tabBody, filtered, this.browser === 'All' ? domains : []);
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
	const domains = collectDomains(store);
	if (visits.length === 0 && domains.length === 0) {
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

	const tab: SubTab = opts.tab ?? (visits.length === 0 ? 'domains' : 'timeline');
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
		renderDomains(tabBody, filtered, browser === 'All' ? domains : [], opts.limit);
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
	return store.getTopDomains();
}

function rowString(row: Row, key: string): string {
	const v = row[key];
	if (v == null) return '';
	return String(v).trim();
}

function uniqueBrowsers(visits: VisitRow[]): string[] {
	const set = new Set<string>();
	for (const v of visits) {
		if (v.browser) set.add(v.browser);
	}
	return [...set].sort((a, b) => a.localeCompare(b));
}

function formatHistoryRangeSubtitle(visits: VisitRow[], domains: DomainRow[]): string {
	if (visits.length > 0) return formatRangeSubtitle(visits);
	const latest = domains
		.map((d) => d.last_visit_time)
		.filter((d): d is Date => d instanceof Date)
		.sort((a, b) => b.getTime() - a.getTime())[0];
	return latest ? `LATEST DOMAIN VISIT ${formatDateLabel(latest)}` : 'TOP DOMAINS';
}

function formatRangeSubtitle(visits: VisitRow[]): string {
	let min = visits[0]!.visit_time;
	let max = visits[0]!.visit_time;
	for (const v of visits) {
		if (v.visit_time < min) min = v.visit_time;
		if (v.visit_time > max) max = v.visit_time;
	}
	const a = formatDateLabel(min);
	const b = formatDateLabel(max);
	return a === b ? `${a} - ${b}` : `${a} - ${b}`;
}

function formatDateLabel(date: Date): string {
	const fmt = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
	return fmt.format(date).toUpperCase();
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
	const cap = limit && limit > 0 ? limit : 24;
	const top = merged.slice(0, cap);

	renderDomainStats(parent, merged, visits);
	renderDomainTiles(parent, top);
	renderDomainClassSummary(parent, merged);
	renderDomainTable(parent, top);
}

function renderDomainStats(parent: HTMLElement, domains: DomainRow[], visits: VisitRow[]): void {
	const totalVisits = domains.reduce((sum, d) => sum + d.visit_count, 0) || visits.length;
	const knownDuration = domains.reduce(
		(sum, d) => sum + (d.total_duration_seconds > 0 ? d.total_duration_seconds : 0),
		0,
	);
	let latest: Date | undefined;
	for (const d of domains) {
		if (d.last_visit_time && (!latest || d.last_visit_time > latest)) latest = d.last_visit_time;
	}
	for (const v of visits) {
		if (!latest || v.visit_time > latest) latest = v.visit_time;
	}

	const statsRow = parent.createDiv({ cls: 'timemd-stats-row timemd-history-domain-stats' });
	addStatCard(statsRow, 'Domains', String(domains.length), 'link');
	addStatCard(statsRow, 'Visits', String(totalVisits), 'circle');
	addStatCard(statsRow, 'Known duration', knownDuration > 0 ? formatDuration(knownDuration) : '—', 'clock');
	addStatCard(statsRow, 'Top domain', domains[0]?.domain ?? '—', 'chart');
	addStatCard(statsRow, 'Latest visit', latest ? latest.toLocaleString() : '—', 'clock');
}

function renderDomainTiles(parent: HTMLElement, domains: DomainRow[]): void {
	const section = parent.createDiv({ cls: 'timemd-history-domain-section' });
	const heading = section.createDiv({ cls: 'timemd-history-section-heading' });
	heading.createDiv({ cls: 'timemd-history-section-title', text: 'Top domains' });
	heading.createDiv({
		cls: 'timemd-history-section-note',
		text: 'Tiles are sized by known duration when present, with visits as fallback.',
	});

	const maxWeight = Math.max(1, ...domains.map(domainWeight));
	const tiles = section.createDiv({ cls: 'timemd-history-domain-tiles' });
	for (const domain of domains) {
		const weight = domainWeight(domain);
		const span = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(weight / maxWeight) * 4)));
		const tile = tiles.createDiv({ cls: `timemd-history-domain-tile timemd-history-domain-tile-${span}` });
		tile.style.gridColumn = `span ${span}`;
		tile.setAttr(
			'title',
			`${domain.domain} · ${domain.visit_count} visit${domain.visit_count === 1 ? '' : 's'} · ${formatKnownDuration(domain.total_duration_seconds)}`,
		);
		const top = tile.createDiv({ cls: 'timemd-history-domain-tile-top' });
		top.createDiv({ cls: 'timemd-history-domain-tile-domain', text: domain.domain });
		top.createSpan({
			cls: 'timemd-history-domain-tile-class',
			text: classifyDomain(domain.domain),
		});
		tile.createDiv({ cls: 'timemd-history-domain-tile-value', text: domainMetricLabel(domain) });
		const meta = tile.createDiv({ cls: 'timemd-history-domain-tile-meta' });
		meta.createSpan({ text: `${domain.visit_count} visit${domain.visit_count === 1 ? '' : 's'}` });
		meta.createSpan({ text: domain.last_visit_time ? `Last ${domain.last_visit_time.toLocaleDateString()}` : 'Last visit unknown' });
	}
}

function renderDomainClassSummary(parent: HTMLElement, domains: DomainRow[]): void {
	const summaries = summarizeDomainClasses(domains);
	const wrap = parent.createDiv({ cls: 'timemd-history-classification timemd-card' });
	const heading = wrap.createDiv({ cls: 'timemd-history-section-heading' });
	heading.createDiv({ cls: 'timemd-history-section-title', text: 'Estimated domain classification' });
	heading.createDiv({
		cls: 'timemd-history-section-note',
		text: 'Local keyword/domain heuristics only. No network requests are made; unknown means no rule matched.',
	});

	renderBarList(
		wrap,
		summaries.map((s) => ({ label: s.label, value: s.visits })),
		{ formatValue: (v) => `${v} visit${v === 1 ? '' : 's'}`, showPercent: true },
	);

	const chips = wrap.createDiv({ cls: 'timemd-history-classification-chips' });
	for (const summary of summaries) {
		const chip = chips.createDiv({ cls: `timemd-history-classification-chip timemd-history-classification-${slug(summary.label)}` });
		chip.createDiv({ cls: 'timemd-history-classification-chip-label', text: summary.label });
		chip.createDiv({
			cls: 'timemd-history-classification-chip-value',
			text: `${summary.domains} domain${summary.domains === 1 ? '' : 's'} · ${formatKnownDuration(summary.knownDurationSeconds)}`,
		});
	}
}

function renderDomainTable(parent: HTMLElement, domains: DomainRow[]): void {
	const tableWrap = parent.createDiv({ cls: 'timemd-table-wrap timemd-history-domain-table' });
	const table = tableWrap.createEl('table', { cls: 'timemd-table' });
	const head = table.createEl('thead').createEl('tr');
	head.createEl('th', { text: 'Domain' });
	head.createEl('th', { text: 'Estimated class' });
	head.createEl('th', { text: 'Visits' });
	head.createEl('th', { text: 'Known duration' });
	head.createEl('th', { text: 'Last visit' });
	const tbody = table.createEl('tbody');
	for (const d of domains) {
		const tr = tbody.createEl('tr');
		tr.createEl('td', { text: d.domain });
		tr.createEl('td', { text: classifyDomain(d.domain) });
		tr.createEl('td', { text: String(d.visit_count) });
		tr.createEl('td', { text: formatKnownDuration(d.total_duration_seconds) });
		tr.createEl('td', {
			text: d.last_visit_time ? d.last_visit_time.toLocaleString() : '—',
		});
	}
}

function mergeDomains(visits: VisitRow[], exported: DomainRow[]): DomainRow[] {
	const map = new Map<string, DomainRow>();
	const exportedDomainNames = new Set<string>();
	for (const e of exported) {
		exportedDomainNames.add(e.domain);
		map.set(e.domain, {
			domain: e.domain,
			visit_count: e.visit_count,
			total_duration_seconds: e.total_duration_seconds,
			last_visit_time: e.last_visit_time,
		});
	}

	const visitCounts = new Map<string, number>();
	const latestVisits = new Map<string, Date>();
	for (const v of visits) {
		if (!v.domain) continue;
		visitCounts.set(v.domain, (visitCounts.get(v.domain) ?? 0) + 1);
		const latest = latestVisits.get(v.domain);
		if (!latest || v.visit_time > latest) latestVisits.set(v.domain, v.visit_time);
	}

	for (const [domain, count] of visitCounts) {
		const existing = map.get(domain) ?? {
			domain,
			visit_count: 0,
			total_duration_seconds: 0,
		};
		if (!exportedDomainNames.has(domain) || existing.visit_count <= 0) {
			existing.visit_count = count;
		}
		const latest = latestVisits.get(domain);
		if (latest && (!existing.last_visit_time || latest > existing.last_visit_time)) {
			existing.last_visit_time = latest;
		}
		map.set(domain, existing);
	}

	return [...map.values()].sort(
		(a, b) => domainWeight(b) - domainWeight(a) || b.visit_count - a.visit_count || a.domain.localeCompare(b.domain),
	);
}

function domainWeight(domain: DomainRow): number {
	return domain.total_duration_seconds > 0 ? domain.total_duration_seconds : Math.max(0, domain.visit_count);
}

function domainMetricLabel(domain: DomainRow): string {
	if (domain.total_duration_seconds > 0) return formatDuration(domain.total_duration_seconds);
	return `${domain.visit_count} visit${domain.visit_count === 1 ? '' : 's'}`;
}

function formatKnownDuration(seconds: number): string {
	return seconds > 0 ? formatDuration(seconds) : '—';
}

const DOMAIN_CLASS_ORDER: DomainClass[] = [
	'Work / learning',
	'Consumption',
	'Social',
	'Commerce',
	'Unknown',
];

function summarizeDomainClasses(domains: DomainRow[]): DomainClassSummary[] {
	const summaries = new Map<DomainClass, DomainClassSummary>();
	for (const label of DOMAIN_CLASS_ORDER) {
		summaries.set(label, { label, domains: 0, visits: 0, knownDurationSeconds: 0 });
	}
	for (const domain of domains) {
		const label = classifyDomain(domain.domain);
		const summary = summaries.get(label);
		if (!summary) continue;
		summary.domains += 1;
		summary.visits += domain.visit_count;
		if (domain.total_duration_seconds > 0) {
			summary.knownDurationSeconds += domain.total_duration_seconds;
		}
	}
	return DOMAIN_CLASS_ORDER.map((label) => summaries.get(label)!).filter(
		(summary) => summary.domains > 0 || summary.label === 'Unknown',
	);
}

function classifyDomain(domain: string): DomainClass {
	const d = domain.toLowerCase();
	if (matchesAny(d, ['github', 'gitlab', 'stackoverflow', 'stackexchange', 'developer', 'docs.', 'jira', 'linear', 'notion', 'confluence', 'atlassian', 'figma', 'localhost', '127.0.0.1', 'vercel', 'npmjs', 'obsidian', 'calendar.google', 'drive.google', 'mail.google'])) {
		return 'Work / learning';
	}
	if (matchesAny(d, ['youtube', 'netflix', 'hulu', 'twitch', 'spotify', 'podcasts', 'primevideo', 'disneyplus', 'max.com', 'news', 'medium', 'substack'])) {
		return 'Consumption';
	}
	if (matchesAny(d, ['twitter', 'x.com', 'facebook', 'instagram', 'tiktok', 'reddit', 'linkedin', 'bsky', 'threads', 'mastodon', 'discord'])) {
		return 'Social';
	}
	if (matchesAny(d, ['amazon', 'ebay', 'etsy', 'shop', 'store', 'checkout', 'stripe', 'paypal', 'doordash', 'ubereats'])) {
		return 'Commerce';
	}
	return 'Unknown';
}

function matchesAny(value: string, needles: string[]): boolean {
	return needles.some((needle) => value.includes(needle));
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
