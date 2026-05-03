import { App, EventRef, Events, Notice, TFile, TFolder } from 'obsidian';
import { parseReport, isSupportedPath } from './parsers';
import {
	AppRow,
	CategoryRow,
	HeatmapCell,
	Report,
	ReportSection,
	Row,
	SessionRow,
	TrendPoint,
} from './types';
import { parseDate, stripWikiLinks } from './utils';

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
			this.lastError = 'No export folder configured. Set one in Settings → time.md.';
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
				console.warn(`[time.md] ${file.path}: ${reason}`);
				continue;
			}
			try {
				const content = await this.app.vault.cachedRead(file);
				const report = parseReport(file.path, content);
				this.reports.push(report);
			} catch (err) {
				console.warn(`[time.md] Failed to parse ${file.path}`, err);
				this.skippedFiles.push({ path: file.path, reason: `parse error: ${String(err)}` });
			}
		}

		this.lastLoadedAt = new Date();
		if (this.reports.length === 0 && this.skippedFiles.length === 0) {
			this.lastError = `No recognizable time.md exports in ${folderPath}`;
		}
		const parts = [`loaded ${this.reports.length}`];
		if (this.skippedFiles.length > 0) parts.push(`skipped ${this.skippedFiles.length}`);
		new Notice(`time.md: ${parts.join(', ')}`);
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

	getDateRange(): { start: Date; end: Date } | null {
		const trend = this.getTrend();
		if (trend.length === 0) return null;
		return { start: trend[0]!.date, end: trend[trend.length - 1]!.date };
	}
}

function collectFiles(folder: TFolder, out: TFile[]): void {
	for (const child of folder.children) {
		if (child instanceof TFile) out.push(child);
		else if (child instanceof TFolder) collectFiles(child, out);
	}
}

function toNumber(v: Row[string] | undefined): number {
	if (typeof v === 'number') return v;
	if (typeof v === 'string') {
		const n = Number(v);
		return Number.isFinite(n) ? n : 0;
	}
	return 0;
}

function cleanName(v: Row[string] | undefined): string {
	if (v == null) return '';
	return stripWikiLinks(String(v)).trim();
}

