import { DateHourCell } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
	const el = activeDocument.createElementNS(SVG_NS, tag);
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
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
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
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

	const max = Math.max(1, ...grid.flat());
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
