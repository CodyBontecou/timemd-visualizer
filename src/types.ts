export type SourceFormat = 'json' | 'csv' | 'markdown' | 'obsidian';

export interface ReportMetadata {
	title: string;
	destination?: string;
	generatedAt?: Date;
	dateRangeStart?: Date;
	dateRangeEnd?: Date;
	granularity?: string;
	filters?: string;
	totalHours?: number;
	totalMinutes?: number;
	topApps?: string[];
	tags?: string[];
}

export type Row = Record<string, string | number>;

export interface ReportSection {
	name: SectionName;
	displayName: string;
	headers: string[];
	rows: Row[];
}

export interface Report {
	sourcePath: string;
	sourceFormat: SourceFormat;
	metadata: ReportMetadata;
	sections: ReportSection[];
}

export type SectionName =
	| 'summary'
	| 'apps'
	| 'categories'
	| 'trend'
	| 'heatmap'
	| 'sessions'
	| 'session_distribution'
	| 'browsing_history'
	| 'top_domains'
	| 'context_switches'
	| 'app_transitions'
	| 'period_comparison'
	| 'unknown';

export interface AppRow {
	app_name: string;
	total_seconds: number;
	session_count: number;
}

export interface CategoryRow {
	category: string;
	total_seconds: number;
}

export interface TrendPoint {
	date: Date;
	total_seconds: number;
}

export interface SessionRow {
	app_name: string;
	start_time: Date;
	end_time: Date;
	duration_seconds: number;
}

export interface HeatmapCell {
	weekday: number;
	hour: number;
	total_seconds: number;
}
