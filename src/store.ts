import { App, EventRef, Events, Notice, TFile, TFolder } from 'obsidian';
import { parseReport, isSupportedPath } from './parsers';
import {
	AppRow,
	AppTransitionRow,
	CategoryRow,
	ContextSwitchRow,
	CursorBin,
	DailyAppTrendRow,
	DateHourCell,
	FocusBlockRow,
	HeatmapCell,
	IntensityPoint,
	MatrixCell,
	RawKeystroke,
	RawMouseEvent,
	Report,
	ReportSection,
	Row,
	SessionRow,
	TopDomainRow,
	TrendPoint,
	TypedKeyRow,
	TypedWordRow,
} from './types';
import { formatDateISO, parseDate, stripWikiLinks, toFiniteNumber } from './utils';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB per file

export class DataStore extends Events {
	reports: Report[] = [];
	lastLoadedAt: Date | null = null;
	lastError: string | null = null;
	skippedFiles: Array<{ path: string; reason: string }> = [];

	constructor(
		private app: App,
		private getFolder: () => string,
	) {
		super();
	}

	onChange(cb: () => void): EventRef {
		return this.on('changed', cb);
	}

	async reload(): Promise<void> {
		const folderPath = (this.getFolder() || '').trim();
		this.reports = [];
		this.skippedFiles = [];
		this.lastError = null;

		if (!folderPath) {
			this.lastError = 'No export folder configured. Set one in Settings → timemd-visualizor.';
			this.trigger('changed');
			return;
		}

		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) {
			this.lastError = `Folder not found in vault: ${folderPath}`;
			this.trigger('changed');
			return;
		}

		const files: TFile[] = [];
		collectFiles(folder, files);

		for (const file of files) {
			if (!isSupportedPath(file.path)) continue;
			if (file.stat.size > MAX_FILE_SIZE_BYTES) {
				const mb = (file.stat.size / 1024 / 1024).toFixed(1);
				const reason = `skipped — ${mb} MB exceeds the 50 MB cap. Re-export with tighter filters or drop the Raw Sessions / Web History sections.`;
				this.skippedFiles.push({ path: file.path, reason });
				console.warn(`[timemd-visualizor] ${file.path}: ${reason}`);
				continue;
			}
			try {
				const content = await this.app.vault.cachedRead(file);
				const report = parseReport(file.path, content);
				this.reports.push(report);
			} catch (err) {
				console.warn(`[timemd-visualizor] Failed to parse ${file.path}`, err);
				this.skippedFiles.push({ path: file.path, reason: `parse error: ${String(err)}` });
			}
		}

		this.lastLoadedAt = new Date();
		if (this.reports.length === 0 && this.skippedFiles.length === 0) {
			this.lastError = `No recognizable time.md exports in ${folderPath}`;
		}
		const parts = [`loaded ${this.reports.length}`];
		if (this.skippedFiles.length > 0) parts.push(`skipped ${this.skippedFiles.length}`);
		new Notice(`timemd-visualizor: ${parts.join(', ')}`);
		this.trigger('changed');
	}

	hasData(): boolean {
		return this.reports.length > 0;
	}

	allSections(name: ReportSection['name']): ReportSection[] {
		return this.reports.flatMap((r) => r.sections.filter((s) => s.name === name));
	}

	getApps(): AppRow[] {
		const map = new Map<string, AppRow>();
		for (const section of this.allSections('apps')) {
			for (const row of section.rows) {
				const name = cleanName(row['app_name']);
				if (!name) continue;
				const existing = map.get(name) ?? { app_name: name, total_seconds: 0, session_count: 0 };
				existing.total_seconds += toNumber(row['total_seconds']);
				existing.session_count += toNumber(row['session_count']);
				map.set(name, existing);
			}
		}
		return [...map.values()].sort((a, b) => b.total_seconds - a.total_seconds);
	}

	getCategories(): CategoryRow[] {
		const map = new Map<string, CategoryRow>();
		for (const section of this.allSections('categories')) {
			for (const row of section.rows) {
				const name = cleanName(row['category']);
				if (!name) continue;
				const existing = map.get(name) ?? { category: name, total_seconds: 0 };
				existing.total_seconds += toNumber(row['total_seconds']);
				map.set(name, existing);
			}
		}
		return [...map.values()].sort((a, b) => b.total_seconds - a.total_seconds);
	}

	getTrend(): TrendPoint[] {
		const map = new Map<string, number>();
		for (const section of this.allSections('trend')) {
			for (const row of section.rows) {
				const date = parseDate(row['date']);
				if (!date) continue;
				const key = date.toISOString().slice(0, 10);
				map.set(key, (map.get(key) ?? 0) + toNumber(row['total_seconds']));
			}
		}
		return [...map.entries()]
			.map(([key, seconds]) => ({ date: new Date(key), total_seconds: seconds }))
			.sort((a, b) => a.date.getTime() - b.date.getTime());
	}

	getHeatmap(): HeatmapCell[] {
		const map = new Map<string, HeatmapCell>();
		for (const section of this.allSections('heatmap')) {
			for (const row of section.rows) {
				const weekday = toNumber(row['weekday']);
				const hour = toNumber(row['hour']);
				const key = `${weekday}-${hour}`;
				const cell = map.get(key) ?? { weekday, hour, total_seconds: 0 };
				cell.total_seconds += toNumber(row['total_seconds']);
				map.set(key, cell);
			}
		}
		return [...map.values()];
	}

	getTopDomains(): TopDomainRow[] {
		const map = new Map<string, TopDomainRow>();
		for (const section of this.allSections('top_domains')) {
			for (const row of section.rows) {
				const domain = cleanName(row['domain']);
				if (!domain) continue;
				const existing = map.get(domain) ?? { domain, visit_count: 0, total_duration_seconds: 0 };
				existing.visit_count += firstNumber(row, ['visit_count', 'visits', 'count']);
				existing.total_duration_seconds += firstNumber(row, ['total_duration_seconds', 'duration_seconds', 'total_seconds']);
				const lastVisit = firstDate(row, ['last_visit_time', 'visit_time', 'timestamp']);
				if (lastVisit && (!existing.last_visit_time || lastVisit > existing.last_visit_time)) {
					existing.last_visit_time = lastVisit;
				}
				map.set(domain, existing);
			}
		}
		return [...map.values()].sort((a, b) => b.total_duration_seconds - a.total_duration_seconds);
	}

	getFocusBlocks(): FocusBlockRow[] {
		const out: FocusBlockRow[] = [];
		for (const section of this.allSections('focus_blocks')) {
			for (const row of section.rows) {
				const start = firstDate(row, ['start_time', 'started_at', 'timestamp']);
				if (!start) continue;
				out.push({
					start_time: start,
					end_time: firstDate(row, ['end_time', 'ended_at']),
					duration_seconds: firstNumber(row, ['duration_seconds', 'total_seconds']),
					app_name: firstString(row, ['app_name', 'focused_app', 'primary_app']) || undefined,
					category: firstString(row, ['category']) || undefined,
					interruptions: optFirstNumber(row, ['interruptions', 'context_switches', 'switch_count']),
				});
			}
		}
		return out.sort((a, b) => b.start_time.getTime() - a.start_time.getTime());
	}

	getDailyMatrix(): MatrixCell[] {
		return this.getMatrix('daily_matrix');
	}

	getHourlyMatrix(): MatrixCell[] {
		return this.getMatrix('hourly_matrix');
	}

	private getMatrix(sectionName: 'daily_matrix' | 'hourly_matrix'): MatrixCell[] {
		const out: MatrixCell[] = [];
		for (const section of this.allSections(sectionName)) {
			for (const row of section.rows) {
				const hour = firstNumber(row, ['hour']);
				out.push({
					date: firstDate(row, ['date', 'day']),
					weekday: optFirstNumber(row, ['weekday']),
					hour,
					app_name: firstString(row, ['app_name', 'app']) || undefined,
					category: firstString(row, ['category']) || undefined,
					total_seconds: firstNumber(row, ['total_seconds', 'duration_seconds']),
				});
			}
		}
		return out;
	}

	getSessions(): SessionRow[] {
		const out: SessionRow[] = [];
		for (const section of this.allSections('sessions')) {
			for (const row of section.rows) {
				const start = parseDate(row['start_time']);
				const end = parseDate(row['end_time']);
				if (!start || !end) continue;
				out.push({
					app_name: cleanName(row['app_name']),
					start_time: start,
					end_time: end,
					duration_seconds: toNumber(row['duration_seconds']),
				});
			}
		}
		return out.sort((a, b) => b.start_time.getTime() - a.start_time.getTime());
	}

	getContextSwitches(): ContextSwitchRow[] {
		const map = new Map<string, ContextSwitchRow>();
		for (const section of this.allSections('context_switches')) {
			for (const row of section.rows) {
				const date = rowDateKey(row['date']);
				if (!date) continue;
				const hour = Math.max(0, Math.min(23, Math.trunc(toNumber(row['hour']))));
				const key = `${date}-${hour}`;
				const existing = map.get(key) ?? { date, hour, switch_count: 0 };
				existing.switch_count += toNumber(row['switch_count']);
				map.set(key, existing);
			}
		}
		return [...map.values()].sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour);
	}

	getAppTransitions(): AppTransitionRow[] {
		const map = new Map<string, AppTransitionRow>();
		for (const section of this.allSections('app_transitions')) {
			for (const row of section.rows) {
				const from = cleanName(row['from_app']) || cleanName(row['from']) || cleanName(row['source_app']);
				const to = cleanName(row['to_app']) || cleanName(row['to']) || cleanName(row['target_app']);
				if (!from || !to) continue;
				const key = `${from}\u0000${to}`;
				const existing = map.get(key) ?? { from_app: from, to_app: to, count: 0, percentage: 0 };
				existing.count += toNumber(row['count']);
				map.set(key, existing);
			}
		}
		const rows = [...map.values()].sort((a, b) => b.count - a.count);
		const total = rows.reduce((sum, row) => sum + row.count, 0);
		for (const row of rows) row.percentage = total > 0 ? (row.count / total) * 100 : 0;
		return rows;
	}

	getSummaryMetric(name: string): number | string | undefined {
		const target = normalizeMetricName(name);
		let numericTotal = 0;
		let sawNumeric = false;
		let fallback: string | undefined;
		for (const section of this.allSections('summary')) {
			for (const row of section.rows) {
				const metric = normalizeMetricName(String(row['metric'] ?? ''));
				if (metric !== target) continue;
				const rawValue = row['value'];
				const numeric = numericValue(rawValue);
				if (numeric !== undefined) {
					numericTotal += numeric;
					sawNumeric = true;
				} else if (rawValue != null) {
					fallback = String(rawValue).trim();
				}
			}
		}
		return sawNumeric ? numericTotal : fallback;
	}

	getDateHourHeatmap(): DateHourCell[] {
		const map = new Map<string, DateHourCell>();
		for (const session of this.getSessions()) {
			walkSessionByHour(session, (start, end) => {
				const dateKey = formatDateISO(start);
				const hour = clampNumber(start.getHours(), 0, 23);
				const seconds = Math.max(0, (end.getTime() - start.getTime()) / 1000);
				if (seconds <= 0) return;
				const key = `${dateKey}-${hour}`;
				const cell = map.get(key) ?? {
					date: dateFromKey(dateKey),
					hour,
					total_seconds: 0,
				};
				cell.total_seconds += seconds;
				map.set(key, cell);
			});
		}
		return [...map.values()].sort((a, b) => {
			const byDate = a.date.getTime() - b.date.getTime();
			return byDate !== 0 ? byDate : a.hour - b.hour;
		});
	}

	getDailyAppTrend(): DailyAppTrendRow[] {
		const map = new Map<string, DailyAppTrendRow>();
		for (const session of this.getSessions()) {
			const appName = session.app_name || 'Unknown';
			walkSessionByDay(session, (start, end) => {
				const dateKey = formatDateISO(start);
				const seconds = Math.max(0, (end.getTime() - start.getTime()) / 1000);
				if (seconds <= 0) return;
				const key = `${dateKey}\u0000${appName}`;
				const row = map.get(key) ?? {
					date: dateFromKey(dateKey),
					app_name: appName,
					total_seconds: 0,
				};
				row.total_seconds += seconds;
				map.set(key, row);
			});
		}
		return [...map.values()].sort((a, b) => {
			const byDate = a.date.getTime() - b.date.getTime();
			return byDate !== 0 ? byDate : b.total_seconds - a.total_seconds;
		});
	}

	getTotalSeconds(): number {
		// Prefer the authoritative summary total — recent time.md exporters truncate
		// the "Top Apps" section to a top-N subset while keeping summary and
		// categories complete, so summing apps undercounts. Fall back to the
		// larger of categories vs apps to stay coherent on older exports.
		let summaryTotal = 0;
		let sawSummary = false;
		for (const section of this.allSections('summary')) {
			for (const row of section.rows) {
				if (String(row['metric']).trim().toLowerCase() === 'total_seconds') {
					summaryTotal += toNumber(row['value']);
					sawSummary = true;
				}
			}
		}
		if (sawSummary && summaryTotal > 0) return summaryTotal;
		const appsTotal = this.getApps().reduce((sum, a) => sum + a.total_seconds, 0);
		const catsTotal = this.getCategories().reduce((sum, c) => sum + c.total_seconds, 0);
		return Math.max(appsTotal, catsTotal);
	}

	getTypedWords(): TypedWordRow[] {
		const map = new Map<string, number>();
		for (const section of this.allSections('input_top_words')) {
			for (const row of section.rows) {
				const word = String(row['word'] ?? '').trim();
				if (!word) continue;
				map.set(word, (map.get(word) ?? 0) + toNumber(row['count']));
			}
		}
		return [...map.entries()]
			.map(([word, count]) => ({ word, count }))
			.sort((a, b) => b.count - a.count);
	}

	getTypedKeys(): TypedKeyRow[] {
		const map = new Map<number, TypedKeyRow>();
		for (const section of this.allSections('input_top_keys')) {
			for (const row of section.rows) {
				const code = toNumber(row['key_code']);
				const label = String(row['key_label'] ?? '').trim() || `Key ${code}`;
				const existing = map.get(code) ?? { key_code: code, key_label: label, count: 0 };
				existing.count += toNumber(row['count']);
				map.set(code, existing);
			}
		}
		return [...map.values()].sort((a, b) => b.count - a.count);
	}

	getCursorBins(): CursorBin[] {
		const out: CursorBin[] = [];
		for (const section of this.allSections('input_cursor_heatmap')) {
			for (const row of section.rows) {
				out.push({
					screen_id: toNumber(row['screen_id']),
					bin_x: toNumber(row['bin_x']),
					bin_y: toNumber(row['bin_y']),
					samples: toNumber(row['samples']),
				});
			}
		}
		return out;
	}

	getIntensity(): IntensityPoint[] {
		const out: IntensityPoint[] = [];
		for (const section of this.allSections('input_typing_intensity')) {
			for (const row of section.rows) {
				const ts = parseDate(row['timestamp']);
				if (!ts) continue;
				out.push({ timestamp: ts, keystrokes: toNumber(row['keystrokes']) });
			}
		}
		return out.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
	}

	getRawKeystrokes(): RawKeystroke[] {
		const out: RawKeystroke[] = [];
		for (const section of this.allSections('input_raw_keystrokes')) {
			for (const row of section.rows) {
				const ts = parseDate(row['timestamp']);
				if (!ts) continue;
				out.push({
					timestamp: ts,
					bundle_id: optString(row['bundle_id']),
					app_name: optString(row['app_name']),
					key_code: toNumber(row['key_code']),
					modifiers: toNumber(row['modifiers']),
					char: optString(row['char']),
					is_word_boundary: toBoolFlag(row['is_word_boundary']),
					secure_input: toBoolFlag(row['secure_input']),
				});
			}
		}
		return out;
	}

	getRawMouseEvents(): RawMouseEvent[] {
		const out: RawMouseEvent[] = [];
		for (const section of this.allSections('input_raw_mouse_events')) {
			for (const row of section.rows) {
				const ts = parseDate(row['timestamp']);
				if (!ts) continue;
				const kindNum = toNumber(row['kind']);
				const kind = (kindNum >= 0 && kindNum <= 4 ? kindNum : 0) as RawMouseEvent['kind'];
				out.push({
					timestamp: ts,
					bundle_id: optString(row['bundle_id']),
					app_name: optString(row['app_name']),
					kind,
					button: toNumber(row['button']),
					x: toNumber(row['x']),
					y: toNumber(row['y']),
					screen_id: toNumber(row['screen_id']),
					scroll_dx: optNumber(row['scroll_dx']),
					scroll_dy: optNumber(row['scroll_dy']),
				});
			}
		}
		return out;
	}

	hasInputData(): boolean {
		return (
			this.getTypedWords().length > 0 ||
			this.getTypedKeys().length > 0 ||
			this.getCursorBins().length > 0 ||
			this.getIntensity().length > 0 ||
			this.getRawKeystrokes().length > 0 ||
			this.getRawMouseEvents().length > 0
		);
	}

	getDateRange(): { start: Date; end: Date } | null {
		let start: Date | undefined;
		let end: Date | undefined;
		for (const report of this.reports) {
			const metaStart = report.metadata.dateRangeStart;
			const metaEnd = report.metadata.dateRangeEnd;
			if (metaStart && (!start || metaStart < start)) start = metaStart;
			if (metaEnd && (!end || metaEnd > end)) end = metaEnd;
		}
		const trend = this.getTrend();
		if (trend.length > 0) {
			const trendStart = trend[0]!.date;
			const trendEnd = trend[trend.length - 1]!.date;
			if (!start || trendStart < start) start = trendStart;
			if (!end || trendEnd > end) end = trendEnd;
		}
		for (const session of this.getSessions()) {
			const sessionEnd = normalizedSessionEnd(session);
			if (!start || session.start_time < start) start = session.start_time;
			if (!end || sessionEnd > end) end = sessionEnd;
		}
		return start && end ? { start, end } : null;
	}
}

function walkSessionByHour(session: SessionRow, cb: (start: Date, end: Date) => void): void {
	walkSession(session, (cursor) => {
		const next = new Date(cursor);
		next.setMinutes(0, 0, 0);
		next.setHours(next.getHours() + 1);
		return next;
	}, cb);
}

function walkSessionByDay(session: SessionRow, cb: (start: Date, end: Date) => void): void {
	walkSession(session, (cursor) => {
		const next = new Date(cursor);
		next.setHours(24, 0, 0, 0);
		return next;
	}, cb);
}

function walkSession(
	session: SessionRow,
	nextBoundary: (cursor: Date) => Date,
	cb: (start: Date, end: Date) => void,
): void {
	let cursor = new Date(session.start_time);
	const end = normalizedSessionEnd(session);
	let guard = 0;
	while (cursor < end && guard < 10000) {
		const boundary = nextBoundary(cursor);
		const segmentEnd = boundary < end ? boundary : end;
		if (segmentEnd <= cursor) break;
		cb(cursor, segmentEnd);
		cursor = segmentEnd;
		guard += 1;
	}
}

function normalizedSessionEnd(session: SessionRow): Date {
	if (session.end_time > session.start_time) return session.end_time;
	return new Date(session.start_time.getTime() + Math.max(0, session.duration_seconds) * 1000);
}

function dateFromKey(key: string): Date {
	const [year, month, day] = key.split('-').map((part) => Number(part));
	return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function clampNumber(n: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, n));
}

function collectFiles(folder: TFolder, out: TFile[]): void {
	for (const child of folder.children) {
		if (child instanceof TFile) out.push(child);
		else if (child instanceof TFolder) collectFiles(child, out);
	}
}

function toNumber(v: Row[string] | undefined): number {
	return toFiniteNumber(v, 0);
}

function firstNumber(row: Row, keys: string[], fallback = 0): number {
	for (const key of keys) {
		if (row[key] !== undefined) return toFiniteNumber(row[key], fallback);
	}
	return fallback;
}

function optFirstNumber(row: Row, keys: string[]): number | undefined {
	for (const key of keys) {
		const value = row[key];
		if (value === undefined) continue;
		if (typeof value === 'string' && value.trim() === '') continue;
		const n = toFiniteNumber(value, Number.NaN);
		if (Number.isFinite(n)) return n;
	}
	return undefined;
}

function firstDate(row: Row, keys: string[]): Date | undefined {
	for (const key of keys) {
		const value = row[key];
		const date = parseDate(value);
		if (date) return date;
	}
	return undefined;
}

function firstString(row: Row, keys: string[]): string {
	for (const key of keys) {
		const value = cleanName(row[key]);
		if (value) return value;
	}
	return '';
}

function cleanName(v: Row[string] | undefined): string {
	if (v == null) return '';
	return stripWikiLinks(String(v)).trim();
}

function rowDateKey(v: Row[string] | undefined): string | undefined {
	if (v == null) return undefined;
	const raw = String(v).trim();
	const iso = /^\d{4}-\d{2}-\d{2}/.exec(raw);
	if (iso) return iso[0];
	const date = parseDate(v);
	return date ? formatDateISO(date) : undefined;
}

function normalizeMetricName(value: string): string {
	return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function numericValue(v: Row[string] | undefined): number | undefined {
	if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
	if (typeof v !== 'string') return undefined;
	const n = Number(v.trim());
	return Number.isFinite(n) ? n : undefined;
}

function optString(v: Row[string] | undefined): string | undefined {
	if (v == null) return undefined;
	const s = String(v).trim();
	return s ? s : undefined;
}

function optNumber(v: Row[string] | undefined): number | undefined {
	if (v == null || v === '') return undefined;
	if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
	const n = Number(v);
	return Number.isFinite(n) ? n : undefined;
}

function toBoolFlag(v: Row[string] | undefined): boolean {
	if (v == null) return false;
	if (typeof v === 'number') return v !== 0;
	const s = String(v).trim().toLowerCase();
	return s === '1' || s === 'true' || s === 'yes';
}

