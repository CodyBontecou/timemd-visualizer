export type SourceFormat = 'json' | 'csv' | 'markdown' | 'obsidian';

export interface ReportMetadata {
	title: string;
	destination?: string;
	generatedAt?: Date;
	dateRangeStart?: Date;
	dateRangeEnd?: Date;
	granularity?: string;
	timezone?: string;
	schemaVersion?: string;
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
	| 'focus_blocks'
	| 'daily_matrix'
	| 'hourly_matrix'
	| 'period_comparison'
	| 'input_top_words'
	| 'input_top_keys'
	| 'input_cursor_heatmap'
	| 'input_typing_intensity'
	| 'input_raw_keystrokes'
	| 'input_raw_mouse_events'
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

export interface TopDomainRow {
	domain: string;
	visit_count: number;
	total_duration_seconds: number;
	last_visit_time?: Date;
}

export interface ContextSwitchRow {
	date: string;
	hour: number;
	switch_count: number;
}

export interface AppTransitionRow {
	from_app: string;
	to_app: string;
	count: number;
	percentage: number;
}

export interface PeriodComparisonAppDelta {
	app_name: string;
	delta_seconds: number;
}

export interface PeriodComparisonMetrics {
	current_total_seconds?: number;
	previous_total_seconds?: number;
	percent_change?: number;
	app_deltas: PeriodComparisonAppDelta[];
}

export interface FocusBlockRow {
	start_time: Date;
	end_time?: Date;
	duration_seconds: number;
	app_name?: string;
	category?: string;
	interruptions?: number;
}

export interface MatrixCell {
	date?: Date;
	weekday?: number;
	hour: number;
	app_name?: string;
	category?: string;
	total_seconds: number;
}

export interface DateHourCell {
	date: Date;
	hour: number;
	total_seconds: number;
}

export interface DailyAppTrendRow {
	date: Date;
	app_name: string;
	total_seconds: number;
}

export interface TypedWordRow {
	word: string;
	count: number;
}

export interface TypedKeyRow {
	key_code: number;
	key_label: string;
	count: number;
}

export interface CursorBin {
	screen_id: number;
	bin_x: number;
	bin_y: number;
	samples: number;
}

export interface IntensityPoint {
	timestamp: Date;
	keystrokes: number;
}

export interface RawKeystroke {
	timestamp: Date;
	bundle_id?: string;
	app_name?: string;
	key_code: number;
	modifiers: number;
	char?: string;
	is_word_boundary: boolean;
	secure_input: boolean;
}

export interface RawMouseEvent {
	timestamp: Date;
	bundle_id?: string;
	app_name?: string;
	kind: 0 | 1 | 2 | 3 | 4;
	button: number;
	x: number;
	y: number;
	screen_id: number;
	scroll_dx?: number;
	scroll_dy?: number;
}
