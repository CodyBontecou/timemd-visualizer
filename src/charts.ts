const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
	const el = activeDocument.createElementNS(SVG_NS, tag);
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
	return el;
}

const DEFAULT_HEATMAP_RGB = '88, 101, 242';

export function getHeatmapRgb(): string {
	try {
		const v = activeWindow.getComputedStyle(activeDocument.body).getPropertyValue('--timemd-heatmap-rgb').trim();
		return v || DEFAULT_HEATMAP_RGB;
	} catch {
		return DEFAULT_HEATMAP_RGB;
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
	opts: { width?: number; height?: number; showArea?: boolean; color?: string } = {},
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

	const labelEvery = Math.max(1, Math.ceil(data.length / 8));
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
	opts: { formatValue?: (v: number) => string; max?: number } = {},
): void {
	const wrap = parent.createDiv({ cls: 'timemd-bars' });
	if (data.length === 0) {
		wrap.createDiv({ cls: 'timemd-empty-inline', text: 'No data' });
		return;
	}
	const max = opts.max ?? Math.max(1, ...data.map((d) => d.value));
	const fmt = opts.formatValue ?? ((v: number) => String(v));
	for (const row of data) {
		const item = wrap.createDiv({ cls: 'timemd-bar-row' });
		item.createDiv({ cls: 'timemd-bar-label', text: row.label });
		const track = item.createDiv({ cls: 'timemd-bar-track' });
		const fill = track.createDiv({ cls: 'timemd-bar-fill' });
		fill.style.width = `${Math.round((row.value / max) * 100)}%`;
		item.createDiv({ cls: 'timemd-bar-value', text: fmt(row.value) });
	}
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
	const rgb = getHeatmapRgb();

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
	const rgb = getHeatmapRgb();

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
