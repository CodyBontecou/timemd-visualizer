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
import { parseDate } from './utils';

export class DataStore extends Events {
	reports: Report[] = [];
	lastLoadedAt: Date | null = null;
	lastError: string | null = null;

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
			try {
				const content = await this.app.vault.cachedRead(file);
				const report = parseReport(file.path, content);
				this.reports.push(report);
			} catch (err) {
				console.warn(`[time.md] Failed to parse ${file.path}`, err);
			}
		}

		this.lastLoadedAt = new Date();
		if (this.reports.length === 0) {
			this.lastError = `No recognizable time.md exports in ${folderPath}`;
		}
		new Notice(`time.md: loaded ${this.reports.length} export${this.reports.length === 1 ? '' : 's'}`);
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
				const name = String(row['app_name'] ?? '');
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
				const name = String(row['category'] ?? '');
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
					app_name: String(row['app_name'] ?? ''),
					start_time: start,
					end_time: end,
					duration_seconds: toNumber(row['duration_seconds']),
				});
			}
		}
		return out.sort((a, b) => b.start_time.getTime() - a.start_time.getTime());
	}

	getTotalSeconds(): number {
		return this.getApps().reduce((sum, a) => sum + a.total_seconds, 0);
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

