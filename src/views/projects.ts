import { WorkspaceLeaf } from 'obsidian';
import { DataStore } from '../store';
import { CategoryRow } from '../types';
import { formatDuration } from '../utils';
import { TimeMdBaseView, TimeMdHost } from './base';

export const VIEW_TYPE_PROJECTS = 'timemd-projects';

const SVG_NS = 'http://www.w3.org/2000/svg';

const KNOWN_CATEGORY_COLORS: Record<string, string> = {
	productivity: '#3b82f6',
	games: '#ef4444',
	business: '#a855f7',
	'developer tools': '#ec4899',
	'social networking': '#f59e0b',
	'health & fitness': '#6366f1',
	entertainment: '#14b8a6',
	utilities: '#64748b',
	uncategorized: '#6b7280',
};

const FALLBACK_PALETTE = [
	'#3b82f6',
	'#ef4444',
	'#a855f7',
	'#ec4899',
	'#f59e0b',
	'#6366f1',
	'#14b8a6',
	'#64748b',
	'#22c55e',
	'#0ea5e9',
	'#eab308',
	'#f97316',
];

function colorFor(category: string): string {
	const key = category.trim().toLowerCase();
	const known = KNOWN_CATEGORY_COLORS[key];
	if (known) return known;
	let hash = 0;
	for (let i = 0; i < key.length; i++) {
		hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
	}
	return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length]!;
}

const MONTHS = [
	'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
	'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

function formatHeaderDate(d: Date): string {
	return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatRangeSubtitle(range: { start: Date; end: Date } | null): string {
	if (!range) return '';
	return `${formatHeaderDate(range.start)} - ${formatHeaderDate(range.end)}`;
}

function svgEl(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
	const el = document.createElementNS(SVG_NS, tag);
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
	return el;
}

function describeArc(
	cx: number,
	cy: number,
	radius: number,
	startAngle: number,
	endAngle: number,
): string {
	// angles in radians, 0 = 12 o'clock (top), clockwise
	const x1 = cx + radius * Math.sin(startAngle);
	const y1 = cy - radius * Math.cos(startAngle);
	const x2 = cx + radius * Math.sin(endAngle);
	const y2 = cy - radius * Math.cos(endAngle);
	const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
	return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
}

interface DonutHandle {
	onHover(cb: (category: CategoryRow | null) => void): void;
}

function renderDonut(
	parent: HTMLElement,
	categories: CategoryRow[],
	totalSeconds: number,
): DonutHandle {
	const size = 220;
	const cx = size / 2;
	const cy = size / 2;
	const radius = 80;
	const strokeWidth = 32;

	const root = svgEl('svg', {
		width: size,
		height: size,
		viewBox: `0 0 ${size} ${size}`,
		class: 'timemd-projects-donut',
	});
	parent.appendChild(root);

	const labelText = svgEl('text', {
		x: cx,
		y: cy - 12,
		'text-anchor': 'middle',
		class: 'timemd-projects-donut-center-label',
	});
	labelText.textContent = 'TOTAL';
	const valueText = svgEl('text', {
		x: cx,
		y: cy + 10,
		'text-anchor': 'middle',
		class: 'timemd-projects-donut-center-value',
	});
	valueText.textContent = formatDuration(totalSeconds);
	const pctText = svgEl('text', {
		x: cx,
		y: cy + 30,
		'text-anchor': 'middle',
		class: 'timemd-projects-donut-center-pct',
	});
	pctText.textContent = '';

	if (totalSeconds <= 0 || categories.length === 0) {
		const ring = svgEl('circle', {
			cx,
			cy,
			r: radius,
			fill: 'none',
			stroke: 'var(--background-modifier-border)',
			'stroke-width': strokeWidth,
		});
		root.appendChild(ring);
		root.appendChild(labelText);
		root.appendChild(valueText);
		root.appendChild(pctText);
		return { onHover: () => {} };
	}

	const categoriesTotal = categories.reduce((s, c) => s + c.total_seconds, 0);
	const sliceDenom = Math.max(totalSeconds, categoriesTotal);

	const listeners: Array<(c: CategoryRow | null) => void> = [];
	const setHover = (cat: CategoryRow | null): void => {
		if (cat) {
			root.classList.add('is-hovering');
			labelText.textContent = cat.category.toUpperCase();
			valueText.textContent = formatDuration(cat.total_seconds);
			const pct = totalSeconds > 0 ? (cat.total_seconds / totalSeconds) * 100 : 0;
			pctText.textContent = pct >= 10 ? `${pct.toFixed(0)}%` : `${pct.toFixed(1)}%`;
		} else {
			root.classList.remove('is-hovering');
			labelText.textContent = 'TOTAL';
			valueText.textContent = formatDuration(totalSeconds);
			pctText.textContent = '';
		}
		for (const cb of listeners) cb(cat);
	};

	let acc = 0;
	const TWO_PI = Math.PI * 2;
	const minVisibleAngle = 0.005; // hide zero-second slices
	for (const cat of categories) {
		const fraction = cat.total_seconds / sliceDenom;
		const sweep = fraction * TWO_PI;
		if (sweep <= minVisibleAngle) continue;
		const start = acc;
		// Avoid drawing exactly a full circle (which collapses arc); cap slightly under TWO_PI
		const end = Math.min(acc + sweep, TWO_PI - 0.0001);
		const path = svgEl('path', {
			d: describeArc(cx, cy, radius, start, end),
			fill: 'none',
			stroke: colorFor(cat.category),
			'stroke-width': strokeWidth,
			'stroke-linecap': 'butt',
			class: 'timemd-projects-donut-slice',
		});
		const title = svgEl('title');
		title.textContent = `${cat.category}: ${formatDuration(cat.total_seconds)}`;
		path.appendChild(title);
		path.addEventListener('mouseenter', () => {
			path.classList.add('is-hover');
			setHover(cat);
		});
		path.addEventListener('mouseleave', () => {
			path.classList.remove('is-hover');
			setHover(null);
		});
		root.appendChild(path);
		acc += sweep;
	}

	root.appendChild(labelText);
	root.appendChild(valueText);
	root.appendChild(pctText);

	return {
		onHover: (cb) => {
			listeners.push(cb);
		},
	};
}

function renderProjectsContent(
	root: HTMLElement,
	store: DataStore,
	state: ProjectsState,
	opts: { showHeader: boolean; limit?: number },
): void {
	root.addClass('timemd-projects');

	const categories = store.getCategories();
	const totalSeconds = store.getTotalSeconds();
	const apps = store.getApps();

	if (opts.showHeader) {
		const header = root.createDiv({ cls: 'timemd-projects-header' });
		const titleWrap = header.createDiv({ cls: 'timemd-projects-titlewrap' });
		titleWrap.createEl('h2', { text: 'Projects', cls: 'timemd-projects-title' });
		const subtitle = formatRangeSubtitle(store.getDateRange());
		if (subtitle) {
			titleWrap.createDiv({ cls: 'timemd-projects-subtitle', text: subtitle });
		}
	}

	if (categories.length === 0) {
		root.createDiv({
			cls: 'timemd-empty-inline',
			text: 'No categories section in the loaded exports.',
		});
		return;
	}

	const toolbar = root.createDiv({ cls: 'timemd-projects-toolbar' });
	const search = toolbar.createEl('input', {
		type: 'search',
		placeholder: 'Search apps or categories…',
		cls: 'timemd-projects-search',
	});
	search.value = state.filter;

	const expandBtn = toolbar.createEl('button', {
		cls: 'timemd-projects-expand-btn',
		text: state.allExpanded ? 'Collapse All' : 'Expand All',
	});

	const grid = root.createDiv({ cls: 'timemd-projects-grid' });
	const leftCol = grid.createDiv({ cls: 'timemd-projects-left' });
	const rightCol = grid.createDiv({ cls: 'timemd-projects-right' });

	const renderList = () => {
		leftCol.empty();

		const sectionLabel = leftCol.createDiv({
			cls: 'timemd-projects-section-label',
			text: 'PROJECTS',
		});
		void sectionLabel;

		const list = leftCol.createDiv({ cls: 'timemd-projects-list' });
		const filterText = state.filter.trim().toLowerCase();
		const maxSeconds = Math.max(1, ...categories.map((c) => c.total_seconds));

		let visible = 0;
		const limit = opts.limit && opts.limit > 0 ? opts.limit : Infinity;

		for (const cat of categories) {
			if (visible >= limit) break;
			const catKey = cat.category;
			const catLower = catKey.toLowerCase();
			const matchesCategory = !filterText || catLower.includes(filterText);
			const matchingApps = filterText
				? apps.filter((a) => a.app_name.toLowerCase().includes(filterText))
				: [];
			const visibleByApp = matchingApps.length > 0;
			if (filterText && !matchesCategory && !visibleByApp) continue;

			const expanded = state.expanded.has(catKey) || state.allExpanded;
			// If filter matched apps inside, force-expand so the user sees them
			const forceOpen = !!filterText && visibleByApp && !matchesCategory;
			const isOpen = expanded || forceOpen;

			const row = list.createDiv({
				cls: `timemd-projects-row${isOpen ? ' is-expanded' : ''}`,
			});

			const headerRow = row.createDiv({ cls: 'timemd-projects-row-header' });
			const caret = headerRow.createSpan({
				cls: 'timemd-projects-caret',
				text: isOpen ? '▾' : '▸',
			});
			void caret;

			const dot = headerRow.createSpan({ cls: 'timemd-projects-dot' });
			(dot as HTMLElement).style.background = colorFor(cat.category);

			const folder = headerRow.createSpan({
				cls: 'timemd-projects-folder',
				text: '📁',
			});
			void folder;

			headerRow.createSpan({
				cls: 'timemd-projects-name',
				text: cat.category,
			});

			// Per-category app count placeholder — we don't have an app->category map.
			// Show total app count in parentheses only when expanded indicator is helpful;
			// we omit numeric (N) since we cannot compute it.
			headerRow.createSpan({
				cls: 'timemd-projects-count',
				text: '',
			});

			const track = headerRow.createDiv({ cls: 'timemd-projects-bar-track' });
			const fill = track.createDiv({ cls: 'timemd-projects-bar-fill' });
			(fill as HTMLElement).style.width = `${Math.round((cat.total_seconds / maxSeconds) * 100)}%`;
			(fill as HTMLElement).style.background = colorFor(cat.category);

			headerRow.createSpan({
				cls: 'timemd-projects-time',
				text: formatDuration(cat.total_seconds),
			});

			const pct = totalSeconds > 0 ? Math.round((cat.total_seconds / totalSeconds) * 100) : 0;
			headerRow.createSpan({
				cls: 'timemd-projects-pct',
				text: `${pct}%`,
			});

			headerRow.addEventListener('click', () => {
				if (state.expanded.has(catKey)) state.expanded.delete(catKey);
				else state.expanded.add(catKey);
				renderList();
			});

			if (isOpen) {
				const detail = row.createDiv({ cls: 'timemd-projects-row-detail' });
				detail.createDiv({
					cls: 'timemd-projects-fallback',
					text: 'Per-app breakdown requires category mappings — not available in current export.',
				});
			}

			visible++;
		}

		if (visible === 0) {
			list.createDiv({
				cls: 'timemd-empty-inline',
				text: 'No matches.',
			});
		}
	};

	const renderRight = () => {
		rightCol.empty();
		renderDistributionCards(rightCol, categories, apps.length, totalSeconds);
	};

	search.addEventListener('input', () => {
		state.filter = search.value;
		renderList();
	});

	expandBtn.addEventListener('click', () => {
		state.allExpanded = !state.allExpanded;
		expandBtn.textContent = state.allExpanded ? 'Collapse All' : 'Expand All';
		if (!state.allExpanded) state.expanded.clear();
		renderList();
	});

	renderList();
	renderRight();
}

function addStatRow(parent: HTMLElement, label: string, value: string): void {
	const row = parent.createDiv({ cls: 'timemd-projects-stat-row' });
	row.createDiv({ cls: 'timemd-projects-stat-label', text: label });
	row.createDiv({ cls: 'timemd-projects-stat-value', text: value });
}

function renderDistributionCards(
	parent: HTMLElement,
	categories: CategoryRow[],
	totalApps: number,
	totalSeconds: number,
	opts: { showStats?: boolean; showLegend?: boolean; showLabel?: boolean } = {},
): void {
	const distCard = parent.createDiv({ cls: 'timemd-projects-card' });
	if (opts.showLabel !== false) {
		distCard.createDiv({
			cls: 'timemd-projects-section-label',
			text: 'DISTRIBUTION',
		});
	}
	const donutWrap = distCard.createDiv({ cls: 'timemd-projects-donut-wrap' });
	const donut = renderDonut(donutWrap, categories, totalSeconds);

	if (opts.showLegend !== false) {
		const legend = distCard.createDiv({ cls: 'timemd-projects-legend' });
		const itemByCategory = new Map<string, HTMLElement>();
		for (const cat of categories) {
			const item = legend.createDiv({ cls: 'timemd-projects-legend-item' });
			const dot = item.createSpan({ cls: 'timemd-projects-dot' });
			(dot as HTMLElement).style.background = colorFor(cat.category);
			item.createSpan({
				cls: 'timemd-projects-legend-name',
				text: cat.category,
			});
			item.createSpan({
				cls: 'timemd-projects-legend-time',
				text: formatDuration(cat.total_seconds),
			});
			itemByCategory.set(cat.category, item);
		}
		donut.onHover((cat) => {
			for (const [name, item] of itemByCategory) {
				item.classList.toggle('is-active', cat?.category === name);
				item.classList.toggle('is-dim', cat !== null && cat.category !== name);
			}
		});
	}

	if (opts.showStats !== false) {
		const statsCard = parent.createDiv({ cls: 'timemd-projects-card' });
		statsCard.createDiv({
			cls: 'timemd-projects-section-label',
			text: 'STATS',
		});
		const stats = statsCard.createDiv({ cls: 'timemd-projects-stats' });
		addStatRow(stats, 'Categories', String(categories.length));
		addStatRow(stats, 'Total Apps', String(totalApps));
		addStatRow(stats, 'Total Time', formatDuration(totalSeconds));
		addStatRow(stats, 'Top Project', categories[0]?.category ?? '—');
	}
}

export function renderDistributionEmbed(
	el: HTMLElement,
	store: DataStore,
	opts?: { stats?: boolean; legend?: boolean; label?: boolean },
): void {
	el.addClass('timemd-projects');
	const wrap = el.createDiv({ cls: 'timemd-projects-distribution-embed' });
	const categories = store.getCategories();
	if (categories.length === 0) {
		wrap.createDiv({
			cls: 'timemd-empty-inline',
			text: 'No categories section in the loaded exports.',
		});
		return;
	}
	renderDistributionCards(wrap, categories, store.getApps().length, store.getTotalSeconds(), {
		showStats: opts?.stats !== false,
		showLegend: opts?.legend !== false,
		showLabel: opts?.label !== false,
	});
}

interface ProjectsState {
	filter: string;
	expanded: Set<string>;
	allExpanded: boolean;
}

export class ProjectsView extends TimeMdBaseView {
	private state: ProjectsState = {
		filter: '',
		expanded: new Set<string>(),
		allExpanded: false,
	};

	constructor(leaf: WorkspaceLeaf, host: TimeMdHost) {
		super(leaf, host);
	}

	getViewType(): string {
		return VIEW_TYPE_PROJECTS;
	}

	getDisplayText(): string {
		return 'timemd-visualizor — Projects';
	}

	getIcon(): string {
		return 'folder';
	}

	renderBody(body: HTMLElement): void {
		renderProjectsContent(body, this.host.store, this.state, { showHeader: true });
	}
}

export function renderProjectsEmbed(
	el: HTMLElement,
	store: DataStore,
	opts?: { limit?: number },
): void {
	const state: ProjectsState = {
		filter: '',
		expanded: new Set<string>(),
		allExpanded: false,
	};
	renderProjectsContent(el, store, state, {
		showHeader: false,
		limit: opts?.limit,
	});
}
