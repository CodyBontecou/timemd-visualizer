import { WorkspaceLeaf } from 'obsidian';
import { heatmapFill, renderBarList, renderLineChart } from '../charts';
import { DataStore } from '../store';
import { CursorBin, IntensityPoint, RawKeystroke, RawMouseEvent, TypedKeyRow, TypedWordRow } from '../types';
import { formatDateISO } from '../utils';
import { TimeMdBaseView, TimeMdHost } from './base';

export const VIEW_TYPE_INPUT = 'timemd-input';

const SVG_NS = 'http://www.w3.org/2000/svg';
const HEATMAP_CANVAS_W = 720;
const HEATMAP_CANVAS_H = 420;
const RAW_KEYSTROKE_LIMIT = 200;

export interface CursorHeatmapOpts {
	bins: CursorBin[];
	clicks?: RawMouseEvent[];
	screenId?: number | null;
	bundleFilter?: string;
	bundleIds?: string[];
	width?: number;
	height?: number;
	showToolbar?: boolean;
	showNote?: boolean;
	onScreenChange?: (id: number) => void;
	onBundleChange?: (id: string) => void;
}

export interface TopWordsOpts {
	words: TypedWordRow[];
	limit?: number;
	hidden?: boolean;
	headEl?: HTMLElement;
	onToggle?: (hidden: boolean) => void;
}

export class InputView extends TimeMdBaseView {
	private wordsHidden = true;
	private charsHidden = true;
	private selectedScreen: number | null = null;
	private bundleFilter = '';

	constructor(leaf: WorkspaceLeaf, host: TimeMdHost) {
		super(leaf, host);
	}

	getViewType(): string {
		return VIEW_TYPE_INPUT;
	}

	getDisplayText(): string {
		return 'timemd-visualizor — Input Tracking';
	}

	getIcon(): string {
		return 'keyboard';
	}

	renderBody(body: HTMLElement): void {
		const store = this.host.store;
		if (!store.hasInputData()) {
			body.createDiv({
				cls: 'timemd-empty-inline',
				text: 'No input tracking data found in loaded exports. Enable "Input Tracking" in time.md and re-export with the input destination.',
			});
			return;
		}

		const intensity = store.getIntensity();
		const bins = store.getCursorBins();
		const keys = store.getTypedKeys();
		const words = store.getTypedWords();
		const rawKeys = store.getRawKeystrokes();
		const rawMouse = store.getRawMouseEvents();

		renderInputStats(body, { intensity, bins, rawMouse });

		const heatCard = body.createDiv({ cls: 'timemd-card' });
		heatCard.createEl('h3', { text: 'Cursor heatmap' });
		const bundleIds = [...new Set(rawMouse.map((e) => e.bundle_id).filter((b): b is string => !!b))].sort();
		renderCursorHeatmap(heatCard, {
			bins,
			clicks: rawMouse,
			screenId: this.selectedScreen,
			bundleFilter: this.bundleFilter,
			bundleIds,
			showToolbar: true,
			showNote: true,
			onScreenChange: (id) => {
				this.selectedScreen = id;
				this.refresh();
			},
			onBundleChange: (id) => {
				this.bundleFilter = id;
				this.refresh();
			},
		});

		const intensityCard = body.createDiv({ cls: 'timemd-card' });
		intensityCard.createEl('h3', { text: 'Typing intensity' });
		renderTypingIntensity(intensityCard, intensity);

		const keysCard = body.createDiv({ cls: 'timemd-card' });
		keysCard.createEl('h3', { text: 'Top typed keys' });
		renderTopKeys(keysCard, keys);

		const wordsCard = body.createDiv({ cls: 'timemd-card' });
		const wordsHead = wordsCard.createDiv({ cls: 'timemd-input-card-head' });
		wordsHead.createEl('h3', { text: 'Top typed words' });
		renderTopWords(wordsCard, {
			words,
			hidden: this.wordsHidden,
			headEl: wordsHead,
			onToggle: (hidden) => {
				this.wordsHidden = hidden;
				this.refresh();
			},
		});

		const activityCard = body.createDiv({ cls: 'timemd-card' });
		activityCard.createEl('h3', { text: 'Per-app click activity' });
		renderPerAppActivity(activityCard, rawMouse);

		this.renderRawKeystrokes(body, rawKeys);
	}

	private renderRawKeystrokes(body: HTMLElement, raw: RawKeystroke[]): void {
		if (raw.length === 0) return;
		const details = body.createEl('details', { cls: 'timemd-card timemd-input-raw-details' });
		const summary = details.createEl('summary');
		summary.setText(
			`Raw keystrokes (first ${Math.min(raw.length, RAW_KEYSTROKE_LIMIT)} of ${raw.length.toLocaleString()})`,
		);

		const head = details.createDiv({ cls: 'timemd-input-card-head' });
		const toggle = head.createEl('button', {
			cls: 'timemd-input-redact-toggle',
			text: this.charsHidden ? 'Reveal chars' : 'Hide chars',
		});
		toggle.addEventListener('click', (e) => {
			e.preventDefault();
			this.charsHidden = !this.charsHidden;
			this.refresh();
		});

		const wrap = details.createDiv({ cls: 'timemd-table-wrap' });
		const table = wrap.createEl('table', { cls: 'timemd-table' });
		const thead = table.createEl('thead').createEl('tr');
		thead.createEl('th', { text: 'Timestamp' });
		thead.createEl('th', { text: 'App' });
		thead.createEl('th', { text: 'Key' });
		thead.createEl('th', { text: 'Char' });
		const tbody = table.createEl('tbody');
		const slice = raw.slice(0, RAW_KEYSTROKE_LIMIT);
		for (const r of slice) {
			const tr = tbody.createEl('tr');
			tr.createEl('td', { text: r.timestamp.toLocaleString() });
			tr.createEl('td', { text: r.app_name ?? r.bundle_id ?? '' });
			tr.createEl('td', { text: keyLabel(r.key_code) });
			const char = r.secure_input ? '🔒' : (r.char ?? '');
			tr.createEl('td', { text: this.charsHidden ? mask(char) : char });
		}
	}
}

// ---------------------------------------------------------------------------
// Stateless render helpers — shared by the full view and the embed pipeline.
// ---------------------------------------------------------------------------

export function renderInputStats(
	parent: HTMLElement,
	data: { intensity: IntensityPoint[]; bins: CursorBin[]; rawMouse: RawMouseEvent[] },
): void {
	const totalKeystrokes = data.intensity.reduce((sum, p) => sum + p.keystrokes, 0);
	const peakPoint = data.intensity.reduce(
		(best: IntensityPoint | null, p) => (best && best.keystrokes >= p.keystrokes ? best : p),
		null,
	);
	const cursorSamples = data.bins.reduce((sum, b) => sum + b.samples, 0);
	const clickCount = data.rawMouse.reduce((sum, e) => (e.kind === 1 ? sum + 1 : sum), 0);
	const apps = new Set<string>();
	for (const e of data.rawMouse) if (e.bundle_id) apps.add(e.bundle_id);

	const row = parent.createDiv({ cls: 'timemd-stats-row' });
	addStat(row, 'Keystrokes', totalKeystrokes.toLocaleString());
	addStat(
		row,
		'Peak typing',
		peakPoint
			? `${formatTime(peakPoint.timestamp)} · ${peakPoint.keystrokes.toLocaleString()}`
			: '—',
	);
	addStat(row, 'Cursor samples', cursorSamples.toLocaleString());
	addStat(row, 'Clicks', clickCount.toLocaleString());
	addStat(row, 'Apps observed', String(apps.size));
}

export function renderCursorHeatmap(parent: HTMLElement, opts: CursorHeatmapOpts): void {
	const bins = opts.bins;
	const clicks = opts.clicks ?? [];
	if (bins.length === 0) {
		parent.createDiv({
			cls: 'timemd-empty-inline',
			text: 'No cursor heatmap bins in the loaded exports.',
		});
		return;
	}

	const screens = [...new Set(bins.map((b) => b.screen_id))].sort((a, b) => a - b);
	let screenId = opts.screenId ?? null;
	if (screenId === null || !screens.includes(screenId)) {
		screenId = screens[0] ?? 0;
	}

	const bundleIds = opts.bundleIds ?? [];
	const bundleFilter = opts.bundleFilter ?? '';

	if (opts.showToolbar !== false && (screens.length > 1 || bundleIds.length > 0)) {
		const toolbar = parent.createDiv({ cls: 'timemd-input-heatmap-toolbar' });

		if (screens.length > 1) {
			const tabStrip = toolbar.createDiv({ cls: 'timemd-input-screen-tabs' });
			for (const sid of screens) {
				const btn = tabStrip.createEl('button', {
					cls: 'timemd-input-screen-tab',
					text: `Screen ${sid}`,
				});
				if (sid === screenId) btn.addClass('is-active');
				btn.addEventListener('click', () => opts.onScreenChange?.(sid));
			}
		}

		if (bundleIds.length > 0 && opts.onBundleChange) {
			const select = toolbar.createEl('select', { cls: 'timemd-input-bundle-filter' });
			const noneOpt = select.createEl('option', { text: 'All apps' });
			noneOpt.value = '';
			for (const id of bundleIds) {
				const opt = select.createEl('option', { text: id });
				opt.value = id;
			}
			select.value = bundleFilter;
			select.addEventListener('change', () => opts.onBundleChange?.(select.value));
		}
	}

	const canvasWrap = parent.createDiv({ cls: 'timemd-input-heatmap-canvas' });

	const filteredBins = bins.filter((b) => b.screen_id === screenId);
	const filteredClicks = clicks.filter(
		(e) =>
			e.kind === 1 &&
			e.screen_id === screenId &&
			(!bundleFilter || e.bundle_id === bundleFilter),
	);

	drawHeatmapSvg(canvasWrap, filteredBins, filteredClicks, {
		width: opts.width ?? HEATMAP_CANVAS_W,
		height: opts.height ?? HEATMAP_CANVAS_H,
	});

	if (opts.showNote !== false) {
		const note = parent.createDiv({ cls: 'timemd-input-heatmap-note' });
		note.setText(
			`${filteredBins.length.toLocaleString()} bins · ${filteredClicks.length.toLocaleString()} click${filteredClicks.length === 1 ? '' : 's'} on screen ${screenId}`,
		);
	}
}

function drawHeatmapSvg(
	parent: HTMLElement,
	bins: CursorBin[],
	clicks: RawMouseEvent[],
	size: { width: number; height: number },
): void {
	const { width, height } = size;

	const root = document.createElementNS(SVG_NS, 'svg');
	root.setAttribute('width', String(width));
	root.setAttribute('height', String(height));
	root.setAttribute('viewBox', `0 0 ${width} ${height}`);
	root.setAttribute('class', 'timemd-chart timemd-input-heatmap-svg');
	parent.appendChild(root);

	if (bins.length === 0) {
		const txt = document.createElementNS(SVG_NS, 'text');
		txt.setAttribute('x', String(width / 2));
		txt.setAttribute('y', String(height / 2));
		txt.setAttribute('text-anchor', 'middle');
		txt.setAttribute('class', 'timemd-axis-label');
		txt.textContent = 'No data for this screen';
		root.appendChild(txt);
		return;
	}

	const bg = document.createElementNS(SVG_NS, 'rect');
	bg.setAttribute('x', '0');
	bg.setAttribute('y', '0');
	bg.setAttribute('width', String(width));
	bg.setAttribute('height', String(height));
	bg.setAttribute('class', 'timemd-input-heatmap-bg');
	root.appendChild(bg);

	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;
	let maxSamples = 0;
	for (const b of bins) {
		if (b.bin_x < minX) minX = b.bin_x;
		if (b.bin_x > maxX) maxX = b.bin_x;
		if (b.bin_y < minY) minY = b.bin_y;
		if (b.bin_y > maxY) maxY = b.bin_y;
		if (b.samples > maxSamples) maxSamples = b.samples;
	}

	const dataW = Math.max(1, maxX - minX + 1);
	const dataH = Math.max(1, maxY - minY + 1);
	const dataAspect = dataW / dataH;
	const canvasAspect = width / height;

	let drawW: number;
	let drawH: number;
	if (dataAspect > canvasAspect) {
		drawW = width;
		drawH = width / dataAspect;
	} else {
		drawH = height;
		drawW = height * dataAspect;
	}
	const offsetX = (width - drawW) / 2;
	const offsetY = (height - drawH) / 2;

	const binPxW = drawW / dataW;
	const binPxH = drawH / dataH;
	const mapX = (binX: number): number => offsetX + (binX - minX) * binPxW;
	const mapY = (binY: number): number => offsetY + (binY - minY) * binPxH;
	const pixelOffsetX = minX * 32;
	const pixelOffsetY = minY * 32;
	const mapPxX = (px: number): number =>
		offsetX + ((px - pixelOffsetX) / 32 / dataW) * drawW;
	const mapPxY = (py: number): number =>
		offsetY + ((py - pixelOffsetY) / 32 / dataH) * drawH;

	for (const b of bins) {
		const intensity = Math.sqrt(maxSamples > 0 ? b.samples / maxSamples : 0);
		const rect = document.createElementNS(SVG_NS, 'rect');
		rect.setAttribute('x', String(mapX(b.bin_x)));
		rect.setAttribute('y', String(mapY(b.bin_y)));
		// Slight overlap eliminates seams between adjacent bins.
		rect.setAttribute('width', String(binPxW + 0.5));
		rect.setAttribute('height', String(binPxH + 0.5));
		rect.setAttribute('fill', heatmapFill(intensity));
		const title = document.createElementNS(SVG_NS, 'title');
		title.textContent = `(${b.bin_x}, ${b.bin_y}) — ${b.samples.toLocaleString()} samples`;
		rect.appendChild(title);
		root.appendChild(rect);
	}

	for (const c of clicks) {
		const cx = mapPxX(c.x);
		const cy = mapPxY(c.y);
		if (cx < offsetX - 2 || cx > offsetX + drawW + 2) continue;
		if (cy < offsetY - 2 || cy > offsetY + drawH + 2) continue;
		const dot = document.createElementNS(SVG_NS, 'circle');
		dot.setAttribute('cx', String(cx));
		dot.setAttribute('cy', String(cy));
		dot.setAttribute('r', '3');
		dot.setAttribute('class', 'timemd-input-click-dot');
		const title = document.createElementNS(SVG_NS, 'title');
		const when = c.timestamp.toLocaleString();
		title.textContent = `${when} · ${c.app_name ?? c.bundle_id ?? 'click'}`;
		dot.appendChild(title);
		root.appendChild(dot);
	}
}

export function renderTypingIntensity(
	parent: HTMLElement,
	intensity: IntensityPoint[],
	opts: { height?: number } = {},
): void {
	if (intensity.length === 0) {
		parent.createDiv({
			cls: 'timemd-empty-inline',
			text: 'No typing intensity data in the loaded exports.',
		});
		return;
	}
	const sameDay = isSingleDay(intensity.map((p) => p.timestamp));
	const points = intensity.map((p) => ({
		label: sameDay ? formatTime(p.timestamp) : formatDateISO(p.timestamp).slice(5),
		value: p.keystrokes,
	}));
	renderLineChart(parent, points, { height: opts.height ?? 220 });
}

export function renderTopKeys(
	parent: HTMLElement,
	keys: TypedKeyRow[],
	opts: { limit?: number } = {},
): void {
	if (keys.length === 0) {
		parent.createDiv({
			cls: 'timemd-empty-inline',
			text: 'No keystroke counts in the loaded exports.',
		});
		return;
	}
	const limit = opts.limit ?? 25;
	renderBarList(
		parent,
		keys.slice(0, limit).map((k) => ({ label: k.key_label, value: k.count })),
	);
}

export function renderTopWords(parent: HTMLElement, opts: TopWordsOpts): void {
	if (opts.words.length === 0) {
		parent.createDiv({
			cls: 'timemd-empty-inline',
			text: 'Top words capture is opt-in in time.md (Settings → Input Tracking → Keystrokes → Full content). No words to display.',
		});
		return;
	}

	const hidden = opts.hidden ?? true;
	const headEl = opts.headEl ?? parent;

	if (opts.onToggle) {
		const toggle = headEl.createEl('button', {
			cls: 'timemd-input-redact-toggle',
			text: hidden ? 'Reveal words' : 'Hide words',
		});
		toggle.addEventListener('click', () => opts.onToggle?.(!hidden));
	}

	const limit = opts.limit ?? 50;
	const top = opts.words.slice(0, limit);
	renderBarList(
		parent,
		top.map((w) => ({
			label: hidden ? mask(w.word) : w.word,
			value: w.count,
		})),
	);
}

export function renderPerAppActivity(parent: HTMLElement, rawMouse: RawMouseEvent[]): void {
	if (rawMouse.length === 0) {
		parent.createDiv({
			cls: 'timemd-empty-inline',
			text: 'No raw mouse events in the loaded exports — enable Raw Mouse Events to see per-app clicks.',
		});
		return;
	}
	const counts = new Map<string, number>();
	for (const e of rawMouse) {
		if (e.kind !== 1) continue;
		const key = e.app_name || e.bundle_id || 'unknown';
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	const rows = [...counts.entries()]
		.map(([label, value]) => ({ label, value }))
		.sort((a, b) => b.value - a.value)
		.slice(0, 25);
	if (rows.length === 0) {
		parent.createDiv({ cls: 'timemd-empty-inline', text: 'No click events recorded.' });
		return;
	}
	renderBarList(parent, rows);
}

// ---------------------------------------------------------------------------
// Embed entry points (re-render in place when toggles change).
// ---------------------------------------------------------------------------

export interface InputEmbedOpts {
	limit?: number;
	height?: number;
	bare?: boolean;
}

export function renderInputStatsEmbed(
	el: HTMLElement,
	store: DataStore,
	_opts: InputEmbedOpts = {},
): void {
	if (!store.hasInputData()) {
		el.createDiv({ cls: 'timemd-embed-empty', text: noInputDataMessage() });
		return;
	}
	renderInputStats(el, {
		intensity: store.getIntensity(),
		bins: store.getCursorBins(),
		rawMouse: store.getRawMouseEvents(),
	});
}

export function renderCursorHeatmapEmbed(
	el: HTMLElement,
	store: DataStore,
	opts: InputEmbedOpts = {},
): void {
	const bins = store.getCursorBins();
	if (bins.length === 0) {
		el.createDiv({ cls: 'timemd-embed-empty', text: 'No cursor heatmap data in the loaded exports.' });
		return;
	}
	const rawMouse = store.getRawMouseEvents();
	const screens = [...new Set(bins.map((b) => b.screen_id))].sort((a, b) => a - b);
	let screenId = screens[0] ?? 0;
	const bundleIds = [...new Set(rawMouse.map((e) => e.bundle_id).filter((b): b is string => !!b))].sort();

	const wrap = el.createDiv();
	const draw = (): void => {
		wrap.empty();
		renderCursorHeatmap(wrap, {
			bins,
			clicks: rawMouse,
			screenId,
			bundleIds,
			height: opts.height ?? 320,
			showToolbar: true,
			showNote: true,
			onScreenChange: (id) => {
				screenId = id;
				draw();
			},
		});
	};
	draw();
}

export function renderTypingIntensityEmbed(
	el: HTMLElement,
	store: DataStore,
	opts: InputEmbedOpts = {},
): void {
	const intensity = store.getIntensity();
	if (intensity.length === 0) {
		el.createDiv({ cls: 'timemd-embed-empty', text: 'No typing intensity data in the loaded exports.' });
		return;
	}
	renderTypingIntensity(el, intensity, { height: opts.height ?? 200 });
}

export function renderTopKeysEmbed(
	el: HTMLElement,
	store: DataStore,
	opts: InputEmbedOpts = {},
): void {
	const keys = store.getTypedKeys();
	if (keys.length === 0) {
		el.createDiv({ cls: 'timemd-embed-empty', text: 'No keystroke counts in the loaded exports.' });
		return;
	}
	renderTopKeys(el, keys, { limit: opts.limit ?? 10 });
}

export function renderTopWordsEmbed(
	el: HTMLElement,
	store: DataStore,
	opts: InputEmbedOpts = {},
): void {
	const words = store.getTypedWords();
	if (words.length === 0) {
		el.createDiv({
			cls: 'timemd-embed-empty',
			text: 'Top words capture is opt-in in time.md (Settings → Input Tracking → Keystrokes → Full content).',
		});
		return;
	}
	let hidden = true;
	const head = el.createDiv({ cls: 'timemd-input-card-head' });
	const body = el.createDiv();
	const draw = (): void => {
		head.empty();
		body.empty();
		renderTopWords(body, {
			words,
			limit: opts.limit ?? 25,
			hidden,
			headEl: head,
			onToggle: (next) => {
				hidden = next;
				draw();
			},
		});
	};
	draw();
}

export function renderInputActivityEmbed(
	el: HTMLElement,
	store: DataStore,
	_opts: InputEmbedOpts = {},
): void {
	const rawMouse = store.getRawMouseEvents();
	if (rawMouse.length === 0) {
		el.createDiv({
			cls: 'timemd-embed-empty',
			text: 'No raw mouse events — enable Raw Mouse Events in time.md to see per-app clicks.',
		});
		return;
	}
	renderPerAppActivity(el, rawMouse);
}

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function addStat(row: HTMLElement, label: string, value: string): void {
	const stat = row.createDiv({ cls: 'timemd-stat' });
	stat.createDiv({ cls: 'timemd-stat-label', text: label });
	stat.createDiv({ cls: 'timemd-stat-value', text: value });
}

function formatTime(d: Date): string {
	const h = String(d.getHours()).padStart(2, '0');
	const m = String(d.getMinutes()).padStart(2, '0');
	return `${h}:${m}`;
}

function isSingleDay(dates: Date[]): boolean {
	if (dates.length === 0) return true;
	const first = formatDateISO(dates[0]!);
	for (const d of dates) if (formatDateISO(d) !== first) return false;
	return true;
}

function mask(s: string): string {
	if (!s) return '';
	const len = [...s].length;
	return '•'.repeat(Math.max(1, len));
}

function keyLabel(code: number): string {
	return `kVK ${code}`;
}

function noInputDataMessage(): string {
	return 'No input tracking data — enable Input Tracking in time.md and re-export.';
}
