import { AppTransitionRow, DateHourCell } from './types';
import { pad2 } from './utils';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
	const el = activeDocument.createElementNS(SVG_NS, tag);
	for (const key of Object.keys(attrs)) {
		const value = attrs[key];
		if (value !== undefined) el.setAttribute(key, String(value));
	}
	return el;
}

const DEFAULT_HEATMAP_RGB = '88, 101, 242';

const DEFAULT_PALETTE = [
	'#3b82f6',
	'#22c55e',
	'#f59e0b',
	'#ef4444',
	'#a855f7',
	'#14b8a6',
	'#ec4899',
	'#64748b',
	'#eab308',
	'#0ea5e9',
];

export function colorForLabel(label: string, palette: string[] = readAppPalette()): string {
	const key = label.trim().toLowerCase();
	let hash = 0;
	for (let i = 0; i < key.length; i++) {
		hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
	}
	return palette[hash % palette.length] ?? DEFAULT_PALETTE[0]!;
}

export function getHeatmapRgb(source: Element = activeDocument.body): string {
	try {
		const v = activeWindow.getComputedStyle(source).getPropertyValue('--timemd-heatmap-rgb').trim();
		return v || DEFAULT_HEATMAP_RGB;
	} catch {
		return DEFAULT_HEATMAP_RGB;
	}
}

function readAppPalette(): string[] {
	try {
		const raw = activeWindow.getComputedStyle(activeDocument.body).getPropertyValue('--timemd-app-palette').trim();
		const colors = raw.split(',').map((item) => item.trim()).filter((item) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(item));
		return colors.length > 0 ? colors : DEFAULT_PALETTE;
	} catch {
		return DEFAULT_PALETTE;
	}
}

export function heatmapFill(intensity: number): string {
	const clamped = Math.max(0, Math.min(1, intensity));
	return `rgba(${getHeatmapRgb()}, ${0.08 + clamped * 0.92})`;
}

export interface LineChartPoint {
	label: string;
	value: number;
}

export function renderLineChart(
	parent: HTMLElement,
	data: LineChartPoint[],
	opts: { width?: number; height?: number; showArea?: boolean; color?: string; maxLabels?: number } = {},
): void {
	const width = opts.width ?? 640;
	const height = opts.height ?? 220;
	const pad = { l: 48, r: 16, t: 16, b: 32 };
	const innerW = width - pad.l - pad.r;
	const innerH = height - pad.t - pad.b;
	const color = opts.color ?? 'var(--timemd-accent, var(--interactive-accent))';

	const root = svg('svg', { width, height, class: 'timemd-chart', viewBox: `0 0 ${width} ${height}` });
	parent.appendChild(root);

	if (data.length === 0) {
		const txt = svg('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'timemd-axis-label' });
		txt.textContent = 'No data';
		root.appendChild(txt);
		return;
	}

	const maxY = Math.max(1, ...data.map((d) => d.value));
	const step = data.length > 1 ? innerW / (data.length - 1) : 0;
	const xAt = (i: number) =>
		data.length === 1 ? pad.l + innerW / 2 : pad.l + i * step;
	const yAt = (v: number) => pad.t + (1 - v / maxY) * innerH;

	for (let i = 0; i <= 4; i++) {
		const y = pad.t + (i / 4) * innerH;
		root.appendChild(svg('line', { x1: pad.l, x2: pad.l + innerW, y1: y, y2: y, class: 'timemd-chart-grid' }));
	}

	if (opts.showArea !== false) {
		const areaPts = data.map((d, i) => `${xAt(i)},${yAt(d.value)}`).join(' ');
		const area = svg('polygon', {
			points: `${pad.l},${pad.t + innerH} ${areaPts} ${pad.l + (data.length - 1) * step},${pad.t + innerH}`,
			fill: color,
			'fill-opacity': '0.15',
			stroke: 'none',
		});
		root.appendChild(area);
	}

	const pathD = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i)} ${yAt(d.value)}`).join(' ');
	root.appendChild(svg('path', { d: pathD, fill: 'none', stroke: color, 'stroke-width': 2 }));

	for (let i = 0; i < data.length; i++) {
		const point = data[i]!;
		const c = svg('circle', { cx: xAt(i), cy: yAt(point.value), r: 3, fill: color });
		const title = svg('title');
		title.textContent = `${point.label}: ${point.value}`;
		c.appendChild(title);
		root.appendChild(c);
	}

	const labelEvery = Math.max(1, Math.ceil(data.length / (opts.maxLabels ?? 8)));
	for (let i = 0; i < data.length; i += labelEvery) {
		const txt = svg('text', {
			x: xAt(i),
			y: pad.t + innerH + 18,
			'text-anchor': 'middle',
			class: 'timemd-axis-label',
		});
		txt.textContent = data[i]!.label;
		root.appendChild(txt);
	}
}

export interface BarChartRow {
	label: string;
	value: number;
}

export function renderBarList(
	parent: HTMLElement,
	data: BarChartRow[],
	opts: { formatValue?: (v: number) => string; max?: number; showPercent?: boolean } = {},
): void {
	const wrap = parent.createDiv({ cls: 'timemd-bars' });
	if (data.length === 0) {
		wrap.createDiv({ cls: 'timemd-empty-inline', text: 'No data' });
		return;
	}
	const max = opts.max ?? Math.max(1, ...data.map((d) => d.value));
	const total = data.reduce((sum, d) => sum + d.value, 0);
	const fmt = opts.formatValue ?? ((v: number) => String(v));
	for (const row of data) {
		const item = wrap.createDiv({ cls: 'timemd-bar-row' });
		item.createDiv({ cls: 'timemd-bar-label', text: row.label });
		const track = item.createDiv({ cls: 'timemd-bar-track' });
		const fill = track.createDiv({ cls: 'timemd-bar-fill' });
		fill.style.width = `${Math.round((row.value / max) * 100)}%`;
		const value = opts.showPercent && total > 0
			? `${fmt(row.value)} · ${((row.value / total) * 100).toFixed(0)}%`
			: fmt(row.value);
		item.createDiv({ cls: 'timemd-bar-value', text: value });
	}
}

export function renderVerticalBarChart(
	parent: HTMLElement,
	data: BarChartRow[],
	opts: {
		width?: number;
		height?: number;
		formatValue?: (v: number) => string;
		color?: string;
		showValues?: boolean;
		maxLabels?: number;
		formatAxis?: (v: number) => string;
	} = {},
): void {
	const width = opts.width ?? 720;
	const height = opts.height ?? 240;
	const pad = { l: 42, r: 14, t: 18, b: 34 };
	const innerW = width - pad.l - pad.r;
	const innerH = height - pad.t - pad.b;
	const color = opts.color ?? 'var(--timemd-accent, var(--interactive-accent))';
	const fmt = opts.formatValue ?? ((v: number) => String(v));
	const axisFmt = opts.formatAxis ?? compactDuration;
	const root = svg('svg', {
		width,
		height,
		class: 'timemd-chart timemd-vbar-chart',
		viewBox: `0 0 ${width} ${height}`,
		preserveAspectRatio: 'none',
	});
	parent.appendChild(root);

	if (data.length === 0) {
		const txt = svg('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'timemd-axis-label' });
		txt.textContent = 'No data';
		root.appendChild(txt);
		return;
	}

	const maxY = niceMax(Math.max(1, ...data.map((d) => d.value)));
	for (let i = 0; i <= 4; i++) {
		const t = i / 4;
		const y = pad.t + (1 - t) * innerH;
		root.appendChild(svg('line', { x1: pad.l, x2: pad.l + innerW, y1: y, y2: y, class: 'timemd-chart-grid' }));
		const lbl = svg('text', { x: pad.l - 6, y: y + 4, 'text-anchor': 'end', class: 'timemd-axis-label' });
		lbl.textContent = axisFmt(maxY * t);
		root.appendChild(lbl);
	}

	const slot = innerW / data.length;
	const barW = Math.max(3, Math.min(slot * 0.72, 34));
	for (let i = 0; i < data.length; i++) {
		const d = data[i]!;
		const h = (d.value / maxY) * innerH;
		const x = pad.l + i * slot + (slot - barW) / 2;
		const y = pad.t + innerH - h;
		const rect = svg('rect', { x, y, width: barW, height: Math.max(0, h), rx: 3, fill: color, class: 'timemd-vbar' });
		const title = svg('title');
		title.textContent = `${d.label}: ${fmt(d.value)}`;
		rect.appendChild(title);
		root.appendChild(rect);
		if (opts.showValues && d.value > 0) {
			const txt = svg('text', { x: x + barW / 2, y: y - 4, 'text-anchor': 'middle', class: 'timemd-axis-label timemd-vbar-value' });
			txt.textContent = fmt(d.value);
			root.appendChild(txt);
		}
	}

	const maxLabels = opts.maxLabels ?? 8;
	const labelEvery = Math.max(1, Math.ceil(data.length / maxLabels));
	for (let i = 0; i < data.length; i++) {
		if (i % labelEvery !== 0 && i !== data.length - 1) continue;
		const t = svg('text', {
			x: pad.l + i * slot + slot / 2,
			y: pad.t + innerH + 18,
			'text-anchor': 'middle',
			class: 'timemd-axis-label',
		});
		t.textContent = data[i]!.label;
		root.appendChild(t);
	}
}

export interface StackedBarSegment {
	label: string;
	value: number;
	color?: string;
}

export interface StackedBarRow {
	label: string;
	segments: StackedBarSegment[];
}

export function renderStackedBarChart(
	parent: HTMLElement,
	rows: StackedBarRow[],
	opts: { height?: number; formatValue?: (v: number) => string; maxLabels?: number } = {},
): void {
	const width = 720;
	const height = opts.height ?? 260;
	const pad = { l: 42, r: 14, t: 18, b: 34 };
	const innerW = width - pad.l - pad.r;
	const innerH = height - pad.t - pad.b;
	const fmt = opts.formatValue ?? ((v: number) => String(v));
	const root = svg('svg', {
		width,
		height,
		class: 'timemd-chart timemd-stacked-chart',
		viewBox: `0 0 ${width} ${height}`,
		preserveAspectRatio: 'none',
	});
	parent.appendChild(root);

	if (rows.length === 0) {
		const txt = svg('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'timemd-axis-label' });
		txt.textContent = 'No data';
		root.appendChild(txt);
		return;
	}

	const totals = rows.map((r) => r.segments.reduce((sum, s) => sum + s.value, 0));
	const maxY = niceMax(Math.max(1, ...totals));
	for (let i = 0; i <= 4; i++) {
		const t = i / 4;
		const y = pad.t + (1 - t) * innerH;
		root.appendChild(svg('line', { x1: pad.l, x2: pad.l + innerW, y1: y, y2: y, class: 'timemd-chart-grid' }));
		const lbl = svg('text', { x: pad.l - 6, y: y + 4, 'text-anchor': 'end', class: 'timemd-axis-label' });
		lbl.textContent = compactDuration(maxY * t);
		root.appendChild(lbl);
	}

	const slot = innerW / rows.length;
	const barW = Math.max(4, Math.min(slot * 0.72, 34));
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]!;
		let acc = 0;
		for (const seg of row.segments) {
			if (seg.value <= 0) continue;
			const yTop = pad.t + innerH - ((acc + seg.value) / maxY) * innerH;
			const yBottom = pad.t + innerH - (acc / maxY) * innerH;
			const rect = svg('rect', {
				x: pad.l + i * slot + (slot - barW) / 2,
				y: yTop,
				width: barW,
				height: Math.max(0, yBottom - yTop),
				fill: seg.color ?? colorForLabel(seg.label),
				class: 'timemd-stacked-segment',
			});
			const title = svg('title');
			title.textContent = `${row.label} · ${seg.label}: ${fmt(seg.value)}`;
			rect.appendChild(title);
			root.appendChild(rect);
			acc += seg.value;
		}
	}

	const labelEvery = Math.max(1, Math.ceil(rows.length / (opts.maxLabels ?? 8)));
	for (let i = 0; i < rows.length; i++) {
		if (i % labelEvery !== 0 && i !== rows.length - 1) continue;
		const t = svg('text', {
			x: pad.l + i * slot + slot / 2,
			y: pad.t + innerH + 18,
			'text-anchor': 'middle',
			class: 'timemd-axis-label',
		});
		t.textContent = rows[i]!.label;
		root.appendChild(t);
	}
}

export interface TransitionSankeyOptions {
	width?: number;
	height?: number;
	maxApps?: number;
	maxTransitions?: number;
	formatApp?: (app: string) => string;
}

interface SankeyLink {
	from: string;
	to: string;
	count: number;
	percentage: number;
}

interface SankeyNode {
	key: string;
	total: number;
	x: number;
	y: number;
	height: number;
	color: string;
}

const OTHER_APP_LABEL = 'Other';

export function renderTransitionSankey(
	parent: HTMLElement,
	transitions: AppTransitionRow[],
	opts: TransitionSankeyOptions = {},
): void {
	const width = opts.width ?? 720;
	const height = opts.height ?? 260;
	const pad = { l: 18, r: 18, t: 28, b: 14 };
	const labelW = 118;
	const nodeW = 12;
	const leftNodeX = pad.l + labelW;
	const rightNodeX = width - pad.r - labelW - nodeW;
	const innerH = height - pad.t - pad.b;
	const fmtApp = opts.formatApp ?? ((app: string) => app || 'Unknown');
	const root = svg('svg', {
		width,
		height,
		class: 'timemd-chart timemd-transition-sankey',
		viewBox: `0 0 ${width} ${height}`,
	});
	parent.appendChild(root);

	const links = buildTransitionSankeyLinks(transitions, opts.maxApps ?? 8, opts.maxTransitions ?? 18);
	if (links.length === 0) {
		const txt = svg('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'timemd-axis-label' });
		txt.textContent = 'No transition data';
		root.appendChild(txt);
		return;
	}

	const leftTotals = sumLinksBy(links, 'from');
	const rightTotals = sumLinksBy(links, 'to');
	const leftNodes = layoutSankeyNodes(leftTotals, leftNodeX, pad.t, innerH, true);
	const rightNodes = layoutSankeyNodes(rightTotals, rightNodeX, pad.t, innerH, false);
	const sourceOffsets = new Map<string, number>();
	const targetOffsets = new Map<string, number>();

	const headingFrom = svg('text', { x: leftNodeX, y: 13, 'text-anchor': 'middle', class: 'timemd-axis-label timemd-sankey-heading' });
	headingFrom.textContent = 'From';
	root.appendChild(headingFrom);
	const headingTo = svg('text', { x: rightNodeX + nodeW, y: 13, 'text-anchor': 'middle', class: 'timemd-axis-label timemd-sankey-heading' });
	headingTo.textContent = 'To';
	root.appendChild(headingTo);

	const sortedLinks = [...links].sort((a, b) => b.count - a.count);
	for (const link of sortedLinks) {
		const source = leftNodes.get(link.from);
		const target = rightNodes.get(link.to);
		if (!source || !target) continue;
		const sourceH = (link.count / Math.max(1, source.total)) * source.height;
		const targetH = (link.count / Math.max(1, target.total)) * target.height;
		const sourceOffset = sourceOffsets.get(link.from) ?? 0;
		const targetOffset = targetOffsets.get(link.to) ?? 0;
		const y1 = source.y + sourceOffset + sourceH / 2;
		const y2 = target.y + targetOffset + targetH / 2;
		sourceOffsets.set(link.from, sourceOffset + sourceH);
		targetOffsets.set(link.to, targetOffset + targetH);
		const strokeW = Math.max(1.5, Math.min(sourceH, targetH));
		const midX = (leftNodeX + nodeW + rightNodeX) / 2;
		const path = svg('path', {
			d: `M ${leftNodeX + nodeW} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${rightNodeX} ${y2}`,
			fill: 'none',
			stroke: colorForLabel(link.from),
			'stroke-width': strokeW,
			class: 'timemd-sankey-link',
		});
		const title = svg('title');
		title.textContent = `${fmtApp(link.from)} → ${fmtApp(link.to)} · ${link.count.toLocaleString()} transitions · ${link.percentage.toFixed(1)}%`;
		path.appendChild(title);
		root.appendChild(path);
	}

	drawSankeyNodes(root, leftNodes, fmtApp, leftNodeX, nodeW, 'left');
	drawSankeyNodes(root, rightNodes, fmtApp, rightNodeX, nodeW, 'right');
}

function buildTransitionSankeyLinks(transitions: AppTransitionRow[], maxApps: number, maxTransitions: number): SankeyLink[] {
	const valid = transitions
		.filter((row) => row.count > 0)
		.sort((a, b) => b.count - a.count);
	if (valid.length === 0) return [];

	const appTotals = new Map<string, number>();
	let totalCount = 0;
	let totalPercentage = 0;
	for (const row of valid) {
		const from = cleanAppLabel(row.from_app);
		const to = cleanAppLabel(row.to_app);
		appTotals.set(from, (appTotals.get(from) ?? 0) + row.count);
		appTotals.set(to, (appTotals.get(to) ?? 0) + row.count);
		totalCount += row.count;
		totalPercentage += row.percentage;
	}

	const topApps = new Set(
		[...appTotals.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, Math.max(1, maxApps))
			.map(([app]) => app),
	);
	const usePercentages = totalPercentage > 0;
	const aggregate = new Map<string, SankeyLink>();
	for (const row of valid) {
		const rawFrom = cleanAppLabel(row.from_app);
		const rawTo = cleanAppLabel(row.to_app);
		const from = topApps.has(rawFrom) ? rawFrom : OTHER_APP_LABEL;
		const to = topApps.has(rawTo) ? rawTo : OTHER_APP_LABEL;
		const key = `${from}\u0000${to}`;
		const existing = aggregate.get(key);
		const percentage = usePercentages ? row.percentage : (row.count / Math.max(1, totalCount)) * 100;
		if (existing) {
			existing.count += row.count;
			existing.percentage += percentage;
		} else {
			aggregate.set(key, { from, to, count: row.count, percentage });
		}
	}

	const links = [...aggregate.values()].sort((a, b) => b.count - a.count);
	if (links.length <= maxTransitions) return links;

	const keepCount = Math.max(1, maxTransitions - 1);
	const visible = links.slice(0, keepCount);
	const rest = links.slice(keepCount);
	const other = rest.reduce<SankeyLink>((acc, link) => ({
		from: OTHER_APP_LABEL,
		to: OTHER_APP_LABEL,
		count: acc.count + link.count,
		percentage: acc.percentage + link.percentage,
	}), { from: OTHER_APP_LABEL, to: OTHER_APP_LABEL, count: 0, percentage: 0 });
	if (other.count > 0) visible.push(other);
	return visible;
}

function sumLinksBy(links: SankeyLink[], side: 'from' | 'to'): Map<string, number> {
	const totals = new Map<string, number>();
	for (const link of links) {
		const key = side === 'from' ? link.from : link.to;
		totals.set(key, (totals.get(key) ?? 0) + link.count);
	}
	return totals;
}

function layoutSankeyNodes(totals: Map<string, number>, x: number, top: number, height: number, leftSide: boolean): Map<string, SankeyNode> {
	const entries = [...totals.entries()].sort((a, b) => {
		if (a[0] === OTHER_APP_LABEL) return 1;
		if (b[0] === OTHER_APP_LABEL) return -1;
		return b[1] - a[1];
	});
	const gap = entries.length > 1 ? 10 : 0;
	const available = Math.max(1, height - gap * Math.max(0, entries.length - 1));
	const total = Math.max(1, entries.reduce((sum, [, value]) => sum + value, 0));
	let heights = entries.map(([, value]) => Math.max(6, (value / total) * available));
	const heightSum = heights.reduce((sum, value) => sum + value, 0);
	if (heightSum > available) heights = heights.map((value) => Math.max(2, value * (available / heightSum)));
	const used = heights.reduce((sum, value) => sum + value, 0) + gap * Math.max(0, entries.length - 1);
	let y = top + Math.max(0, (height - used) / 2);
	const nodes = new Map<string, SankeyNode>();
	for (let i = 0; i < entries.length; i++) {
		const entry = entries[i];
		if (!entry) continue;
		const [key, totalValue] = entry;
		const nodeHeight = heights[i] ?? 2;
		nodes.set(key, {
			key,
			total: totalValue,
			x,
			y,
			height: nodeHeight,
			color: colorForLabel(leftSide ? key : `${key}:to`),
		});
		y += nodeHeight + gap;
	}
	return nodes;
}

function drawSankeyNodes(
	root: SVGElement,
	nodes: Map<string, SankeyNode>,
	formatApp: (app: string) => string,
	x: number,
	nodeW: number,
	side: 'left' | 'right',
): void {
	for (const node of nodes.values()) {
		const rect = svg('rect', {
			x,
			y: node.y,
			width: nodeW,
			height: Math.max(2, node.height),
			rx: 3,
			fill: node.color,
			class: 'timemd-sankey-node',
		});
		const title = svg('title');
		title.textContent = `${formatApp(node.key)} · ${node.total.toLocaleString()} transitions`;
		rect.appendChild(title);
		root.appendChild(rect);

		const label = svg('text', {
			x: side === 'left' ? x - 8 : x + nodeW + 8,
			y: node.y + node.height / 2 + 4,
			'text-anchor': side === 'left' ? 'end' : 'start',
			class: 'timemd-axis-label timemd-sankey-label',
		});
		label.textContent = truncateSvgLabel(formatApp(node.key), 18);
		const labelTitle = svg('title');
		labelTitle.textContent = formatApp(node.key);
		label.appendChild(labelTitle);
		root.appendChild(label);
	}
}

function cleanAppLabel(app: string): string {
	const trimmed = app.trim();
	return trimmed || 'Unknown';
}

function truncateSvgLabel(label: string, maxLength: number): string {
	if (label.length <= maxLength) return label;
	if (maxLength <= 1) return '…';
	return `${label.slice(0, maxLength - 1)}…`;
}

function niceMax(v: number): number {
	if (v <= 0) return 1;
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

function compactDuration(seconds: number): string {
	if (seconds <= 0) return '0';
	const hours = seconds / 3600;
	if (hours >= 1) {
		const rounded = Math.round(hours * 10) / 10;
		return `${rounded}h`;
	}
	return `${Math.round(seconds / 60)}m`;
}

export interface ContributionDay {
	date: Date;
	value: number;
}

export interface DayAnnotation {
	highContextSwitches?: number;
	focusBlocks?: number;
}

function annotationText(annotation: DayAnnotation | undefined): string[] {
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

export function renderContributionHeatmap(
	parent: HTMLElement,
	days: ContributionDay[],
	opts: {
		formatValue?: (v: number) => string;
		dayAnnotations?: Map<string, DayAnnotation>;
		selectedDate?: string | null;
		onDayClick?: (date: Date) => void;
	} = {},
): void {
	const fmt = opts.formatValue ?? ((v: number) => String(v));
	const wrap = parent.createDiv({ cls: 'timemd-contribution-wrap' });
	if (days.length === 0) {
		wrap.createDiv({ cls: 'timemd-empty-inline', text: 'No trend data' });
		return;
	}

	const sorted = [...days].sort((a, b) => a.date.getTime() - b.date.getTime());
	const first = sorted[0]!;
	const last = sorted[sorted.length - 1]!;
	const dataStart = startOfDay(first.date);
	const dataEnd = startOfDay(last.date);
	const start = startOfWeek(dataStart);
	const end = endOfWeek(dataEnd);
	const totalDays = Math.max(1, daysBetween(start, end) + 1);
	const weeks = Math.ceil(totalDays / 7);
	const cell = weeks > 42 ? 10 : 12;
	const gap = 3;
	const pad = { l: 34, r: 10, t: 22, b: 8 };
	const width = pad.l + weeks * (cell + gap) - gap + pad.r;
	const height = pad.t + 7 * (cell + gap) - gap + pad.b;
	const max = Math.max(1, ...sorted.map((d) => d.value));
	const byDate = new Map(sorted.map((d) => [dateKey(d.date), d.value]));
	const rgb = getHeatmapRgb(parent);

	const root = svg('svg', {
		width,
		height,
		class: 'timemd-chart timemd-contribution-chart',
		viewBox: `0 0 ${width} ${height}`,
	});
	wrap.appendChild(root);

	const daysOfWeek = ['Mon', '', 'Wed', '', 'Fri', '', ''];
	for (let d = 0; d < 7; d++) {
		if (!daysOfWeek[d]) continue;
		const label = svg('text', {
			x: pad.l - 8,
			y: pad.t + d * (cell + gap) + cell / 2 + 4,
			'text-anchor': 'end',
			class: 'timemd-axis-label',
		});
		label.textContent = daysOfWeek[d]!;
		root.appendChild(label);
	}

	let lastMonth = -1;
	for (let i = 0; i < totalDays; i++) {
		const date = addDays(start, i);
		const week = Math.floor(i / 7);
		const dow = mondayIndex(date);
		const key = dateKey(date);
		const value = byDate.get(key) ?? 0;
		const inRange = date >= dataStart && date <= dataEnd;
		const intensity = value / max;
		if (date.getDate() <= 7 && date.getMonth() !== lastMonth) {
			const month = svg('text', {
				x: pad.l + week * (cell + gap),
				y: 12,
				class: 'timemd-axis-label timemd-contribution-month',
			});
			month.textContent = date.toLocaleDateString(undefined, { month: 'short' });
			root.appendChild(month);
			lastMonth = date.getMonth();
		}
		const x = pad.l + week * (cell + gap);
		const y = pad.t + dow * (cell + gap);
		const annotation = opts.dayAnnotations?.get(key);
		const annotationClasses = [
			annotation?.highContextSwitches !== undefined ? 'has-high-context' : '',
			annotation?.focusBlocks !== undefined ? 'has-focus-block' : '',
			opts.selectedDate === key ? 'is-selected' : '',
		].filter(Boolean).join(' ');
		const rect = svg('rect', {
			x,
			y,
			width: cell,
			height: cell,
			rx: 2,
			class: `${inRange ? 'timemd-contribution-cell' : 'timemd-contribution-cell is-outside-range'}${annotationClasses ? ` ${annotationClasses}` : ''}`,
		});
		rect.setAttribute('fill', inRange ? `rgba(${rgb}, ${0.08 + intensity * 0.92})` : 'transparent');
		if (opts.onDayClick && inRange) {
			rect.addEventListener('click', () => opts.onDayClick?.(date));
			rect.setAttribute('tabindex', '0');
			rect.setAttribute('role', 'button');
		}
		const title = svg('title');
		const lines = [`${key} — ${fmt(value)}`, ...annotationText(annotation)];
		title.textContent = lines.join('\n');
		rect.appendChild(title);
		root.appendChild(rect);
		if (annotation?.highContextSwitches !== undefined || opts.selectedDate === key) {
			const ring = svg('rect', {
				x: x + 0.75,
				y: y + 0.75,
				width: Math.max(0, cell - 1.5),
				height: Math.max(0, cell - 1.5),
				rx: 2.5,
				class: `timemd-day-marker-ring${opts.selectedDate === key ? ' is-selected' : ''}`,
			});
			root.appendChild(ring);
		}
		if (annotation?.focusBlocks !== undefined) {
			root.appendChild(svg('circle', {
				cx: x + cell - 3,
				cy: y + cell - 3,
				r: 2,
				class: 'timemd-day-marker-dot',
			}));
		}
	}
}

export function renderDateHourHeatmap(
	parent: HTMLElement,
	cells: DateHourCell[],
	opts: { formatValue?: (v: number) => string; start?: Date; end?: Date; dayAnnotations?: Map<string, DayAnnotation> } = {},
): void {
	const fmt = opts.formatValue ?? ((v: number) => String(v));
	const wrap = parent.createDiv({ cls: 'timemd-date-hour-wrap' });
	if (cells.length === 0) {
		wrap.createDiv({ cls: 'timemd-empty-inline', text: 'No date × hour data' });
		return;
	}

	const sorted = [...cells].sort((a, b) => {
		const byDate = a.date.getTime() - b.date.getTime();
		return byDate !== 0 ? byDate : a.hour - b.hour;
	});
	const first = startOfDay(opts.start ?? sorted[0]!.date);
	const last = startOfDay(opts.end ?? sorted[sorted.length - 1]!.date);
	const rowCount = Math.max(1, daysBetween(first, last) + 1);
	const cellW = rowCount > 120 ? 16 : 20;
	const cellH = rowCount > 120 ? 9 : rowCount > 45 ? 11 : 16;
	const gap = 2;
	const pad = { l: 78, r: 12, t: 28, b: 10 };
	const width = pad.l + 24 * (cellW + gap) - gap + pad.r;
	const height = pad.t + rowCount * (cellH + gap) - gap + pad.b;
	const byKey = new Map<string, number>();
	for (const cell of sorted) {
		const key = `${dateKey(cell.date)}-${cell.hour}`;
		byKey.set(key, (byKey.get(key) ?? 0) + cell.total_seconds);
	}
	const max = Math.max(1, ...byKey.values());
	const rgb = getHeatmapRgb(parent);

	const root = svg('svg', {
		width,
		height,
		class: 'timemd-chart timemd-date-hour-chart',
		viewBox: `0 0 ${width} ${height}`,
	});
	wrap.appendChild(root);

	for (let h = 0; h < 24; h += 3) {
		const label = svg('text', {
			x: pad.l + h * (cellW + gap) + cellW / 2,
			y: 16,
			'text-anchor': 'middle',
			class: 'timemd-axis-label',
		});
		label.textContent = `${h}:00`;
		root.appendChild(label);
	}

	const labelEvery = rowCount <= 45 ? 1 : rowCount <= 120 ? 7 : 30;
	for (let row = 0; row < rowCount; row++) {
		const date = addDays(first, row);
		const dateText = dateKey(date);
		if (row % labelEvery === 0 || row === rowCount - 1) {
			const label = svg('text', {
				x: pad.l - 8,
				y: pad.t + row * (cellH + gap) + cellH / 2 + 4,
				'text-anchor': 'end',
				class: 'timemd-axis-label',
			});
			label.textContent = rowCount > 120 ? dateText.slice(5) : dateText;
			root.appendChild(label);
		}
		const annotation = opts.dayAnnotations?.get(dateText);
		const annotationClasses = [
			annotation?.highContextSwitches !== undefined ? 'has-high-context' : '',
			annotation?.focusBlocks !== undefined ? 'has-focus-block' : '',
		].filter(Boolean).join(' ');
		for (let h = 0; h < 24; h++) {
			const value = byKey.get(`${dateText}-${h}`) ?? 0;
			const rect = svg('rect', {
				x: pad.l + h * (cellW + gap),
				y: pad.t + row * (cellH + gap),
				width: cellW,
				height: cellH,
				rx: 2,
				class: `timemd-date-hour-cell${annotationClasses ? ` ${annotationClasses}` : ''}`,
			});
			rect.setAttribute('fill', `rgba(${rgb}, ${0.06 + (value / max) * 0.94})`);
			const title = svg('title');
			const lines = [`${dateText} ${h}:00 — ${fmt(value)}`, ...annotationText(annotation)];
			title.textContent = lines.join('\n');
			rect.appendChild(title);
			root.appendChild(rect);
		}
	}
}

function startOfDay(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function daysBetween(start: Date, end: Date): number {
	return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000);
}

function mondayIndex(date: Date): number {
	return (date.getDay() + 6) % 7;
}

function startOfWeek(date: Date): Date {
	return addDays(startOfDay(date), -mondayIndex(date));
}

function endOfWeek(date: Date): Date {
	return addDays(startOfWeek(date), 6);
}

function dateKey(date: Date): string {
	const y = date.getFullYear();
	const m = pad2(date.getMonth() + 1);
	const d = pad2(date.getDate());
	return `${y}-${m}-${d}`;
}

export function renderHeatmap(
	parent: HTMLElement,
	grid: number[][],
	opts: { formatValue?: (v: number) => string } = {},
): void {
	const fmt = opts.formatValue ?? ((v: number) => String(v));
	const cell = 22;
	const pad = { l: 56, t: 28, r: 8, b: 8 };
	const width = pad.l + 24 * cell + pad.r;
	const height = pad.t + 7 * cell + pad.b;
	const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

	const root = svg('svg', { width, height, class: 'timemd-chart timemd-heatmap', viewBox: `0 0 ${width} ${height}` });
	parent.appendChild(root);

	let max = 1;
	for (const row of grid) {
		for (const value of row) max = Math.max(max, value);
	}
	const rgb = getHeatmapRgb(parent);

	for (let d = 0; d < 7; d++) {
		for (let h = 0; h < 24; h++) {
			const v = grid[d]?.[h] ?? 0;
			const intensity = v / max;
			const rect = svg('rect', {
				x: pad.l + h * cell,
				y: pad.t + d * cell,
				width: cell - 2,
				height: cell - 2,
				rx: 3,
				class: 'timemd-heatmap-cell',
			});
			rect.setAttribute('fill', `rgba(${rgb}, ${0.08 + intensity * 0.92})`);
			const title = svg('title');
			title.textContent = `${days[d]} ${h}:00 — ${fmt(v)}`;
			rect.appendChild(title);
			root.appendChild(rect);
		}
	}

	for (let i = 0; i < 7; i++) {
		const t = svg('text', {
			x: pad.l - 10,
			y: pad.t + i * cell + cell / 2 + 4,
			'text-anchor': 'end',
			class: 'timemd-axis-label',
		});
		t.textContent = days[i]!;
		root.appendChild(t);
	}

	for (let h = 0; h < 24; h += 3) {
		const t = svg('text', {
			x: pad.l + h * cell + cell / 2,
			y: pad.t - 10,
			'text-anchor': 'middle',
			class: 'timemd-axis-label',
		});
		t.textContent = `${h}:00`;
		root.appendChild(t);
	}
}

export function renderHourStrip(
	parent: HTMLElement,
	hours: number[],
	opts: { label?: string; formatValue?: (v: number) => string } = {},
): void {
	const fmt = opts.formatValue ?? ((v: number) => String(v));
	const cell = 22;
	const pad = { l: opts.label ? 96 : 16, t: 28, r: 8, b: 8 };
	const width = pad.l + 24 * cell + pad.r;
	const height = pad.t + cell + pad.b;

	const root = svg('svg', {
		width,
		height,
		class: 'timemd-chart timemd-heatmap',
		viewBox: `0 0 ${width} ${height}`,
	});
	parent.appendChild(root);

	const max = Math.max(1, ...hours);
	const rgb = getHeatmapRgb(parent);

	for (let h = 0; h < 24; h++) {
		const v = hours[h] ?? 0;
		const intensity = v / max;
		const rect = svg('rect', {
			x: pad.l + h * cell,
			y: pad.t,
			width: cell - 2,
			height: cell - 2,
			rx: 3,
			class: 'timemd-heatmap-cell',
		});
		rect.setAttribute('fill', `rgba(${rgb}, ${0.08 + intensity * 0.92})`);
		const title = svg('title');
		title.textContent = `${h}:00 — ${fmt(v)}`;
		rect.appendChild(title);
		root.appendChild(rect);
	}

	if (opts.label) {
		const t = svg('text', {
			x: pad.l - 10,
			y: pad.t + cell / 2 + 4,
			'text-anchor': 'end',
			class: 'timemd-axis-label',
		});
		t.textContent = opts.label;
		root.appendChild(t);
	}

	for (let h = 0; h < 24; h += 3) {
		const t = svg('text', {
			x: pad.l + h * cell + cell / 2,
			y: pad.t - 10,
			'text-anchor': 'middle',
			class: 'timemd-axis-label',
		});
		t.textContent = `${h}:00`;
		root.appendChild(t);
	}
}

export interface AppHourHeatmapRow {
	label: string;
	hours: number[];
	color?: string;
}

export function renderAppHourHeatmap(
	parent: HTMLElement,
	rows: AppHourHeatmapRow[],
	opts: { formatValue?: (v: number) => string; maxRows?: number } = {},
): void {
	const fmt = opts.formatValue ?? ((v: number) => String(v));
	const visibleRows = rows.slice(0, opts.maxRows ?? rows.length);
	const wrap = parent.createDiv({ cls: 'timemd-app-rhythm-wrap' });
	if (visibleRows.length === 0) {
		wrap.createDiv({ cls: 'timemd-empty-inline', text: 'No app/hour data' });
		return;
	}

	const cellW = 24;
	const cellH = visibleRows.length > 8 ? 16 : 20;
	const gap = 2;
	const pad = { l: 134, r: 12, t: 30, b: 8 };
	const width = pad.l + 24 * (cellW + gap) - gap + pad.r;
	const height = pad.t + visibleRows.length * (cellH + gap) - gap + pad.b;
	let max = 1;
	for (const row of visibleRows) {
		for (const value of row.hours) max = Math.max(max, value);
	}
	const root = svg('svg', {
		width,
		height,
		class: 'timemd-chart timemd-app-rhythm-chart',
		viewBox: `0 0 ${width} ${height}`,
	});
	wrap.appendChild(root);

	for (let h = 0; h < 24; h += 3) {
		const label = svg('text', {
			x: pad.l + h * (cellW + gap) + cellW / 2,
			y: 18,
			'text-anchor': 'middle',
			class: 'timemd-axis-label',
		});
		label.textContent = `${h}:00`;
		root.appendChild(label);
	}

	for (let rowIndex = 0; rowIndex < visibleRows.length; rowIndex++) {
		const row = visibleRows[rowIndex]!;
		const y = pad.t + rowIndex * (cellH + gap);
		const label = svg('text', {
			x: pad.l - 10,
			y: y + cellH / 2 + 4,
			'text-anchor': 'end',
			class: 'timemd-axis-label timemd-app-rhythm-label',
		});
		label.textContent = truncateLabel(row.label, 22);
		const labelTitle = svg('title');
		labelTitle.textContent = row.label;
		label.appendChild(labelTitle);
		root.appendChild(label);

		for (let h = 0; h < 24; h++) {
			const value = row.hours[h] ?? 0;
			const rect = svg('rect', {
				x: pad.l + h * (cellW + gap),
				y,
				width: cellW,
				height: cellH,
				rx: 3,
				fill: row.color ?? colorForLabel(row.label),
				'fill-opacity': 0.07 + (value / max) * 0.93,
				class: 'timemd-app-rhythm-cell',
			});
			const title = svg('title');
			title.textContent = `${row.label} · ${h}:00 — ${fmt(value)}`;
			rect.appendChild(title);
			root.appendChild(rect);
		}
	}
}

export interface ScatterPoint {
	label: string;
	x: number;
	y: number;
	size: number;
	color?: string;
	title?: string;
}

export function renderScatterPlot(
	parent: HTMLElement,
	points: ScatterPoint[],
	opts: {
		width?: number;
		height?: number;
		formatX?: (v: number) => string;
		formatY?: (v: number) => string;
		xLabel?: string;
		yLabel?: string;
	} = {},
): void {
	const width = opts.width ?? 720;
	const height = opts.height ?? 300;
	const pad = { l: 58, r: 18, t: 18, b: 48 };
	const innerW = width - pad.l - pad.r;
	const innerH = height - pad.t - pad.b;
	const fmtX = opts.formatX ?? ((v: number) => String(v));
	const fmtY = opts.formatY ?? ((v: number) => String(v));
	const root = svg('svg', {
		width,
		height,
		class: 'timemd-chart timemd-scatter-chart',
		viewBox: `0 0 ${width} ${height}`,
		preserveAspectRatio: 'none',
	});
	parent.appendChild(root);

	if (points.length === 0) {
		const txt = svg('text', { x: width / 2, y: height / 2, 'text-anchor': 'middle', class: 'timemd-axis-label' });
		txt.textContent = 'No scatter data';
		root.appendChild(txt);
		return;
	}

	const maxX = niceMax(Math.max(1, ...points.map((p) => p.x)));
	const maxY = niceMax(Math.max(1, ...points.map((p) => p.y)));
	const maxSize = Math.max(1, ...points.map((p) => p.size));
	const xAt = (v: number) => pad.l + (Math.max(0, Math.min(maxX, v)) / maxX) * innerW;
	const yAt = (v: number) => pad.t + (1 - Math.max(0, Math.min(maxY, v)) / maxY) * innerH;

	for (let i = 0; i <= 4; i++) {
		const t = i / 4;
		const x = pad.l + t * innerW;
		const y = pad.t + (1 - t) * innerH;
		root.appendChild(svg('line', { x1: x, x2: x, y1: pad.t, y2: pad.t + innerH, class: 'timemd-chart-grid' }));
		root.appendChild(svg('line', { x1: pad.l, x2: pad.l + innerW, y1: y, y2: y, class: 'timemd-chart-grid' }));
		const xLbl = svg('text', { x, y: pad.t + innerH + 18, 'text-anchor': 'middle', class: 'timemd-axis-label' });
		xLbl.textContent = fmtX(maxX * t);
		root.appendChild(xLbl);
		const yLbl = svg('text', { x: pad.l - 8, y: y + 4, 'text-anchor': 'end', class: 'timemd-axis-label' });
		yLbl.textContent = fmtY(maxY * t);
		root.appendChild(yLbl);
	}

	for (const point of points) {
		const radius = 4 + Math.sqrt(Math.max(0, point.size) / maxSize) * 10;
		const circle = svg('circle', {
			cx: xAt(point.x),
			cy: yAt(point.y),
			r: radius,
			fill: point.color ?? 'var(--timemd-accent, var(--interactive-accent))',
			'fill-opacity': 0.78,
			stroke: 'var(--background-primary)',
			'stroke-width': 1.5,
			class: 'timemd-scatter-point',
		});
		const title = svg('title');
		title.textContent = point.title ?? `${point.label}: ${fmtX(point.x)}, ${fmtY(point.y)}`;
		circle.appendChild(title);
		root.appendChild(circle);
	}

	if (opts.xLabel) {
		const xAxis = svg('text', { x: pad.l + innerW / 2, y: height - 8, 'text-anchor': 'middle', class: 'timemd-axis-label' });
		xAxis.textContent = opts.xLabel;
		root.appendChild(xAxis);
	}
	if (opts.yLabel) {
		const yAxis = svg('text', {
			x: 14,
			y: pad.t + innerH / 2,
			'text-anchor': 'middle',
			class: 'timemd-axis-label',
			transform: `rotate(-90 14 ${pad.t + innerH / 2})`,
		});
		yAxis.textContent = opts.yLabel;
		root.appendChild(yAxis);
	}
}

function truncateLabel(label: string, maxChars: number): string {
	return label.length > maxChars ? `${label.slice(0, Math.max(0, maxChars - 1))}…` : label;
}
