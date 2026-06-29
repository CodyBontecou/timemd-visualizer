import { Report, ReportMetadata, ReportSection, Row } from '../types';
import { applyFilterMetadata, canonicalSectionName, coerceRowValue, parseDate } from '../utils';

interface NestedJson {
	title?: string;
	destination?: string;
	generated_at?: string;
	generatedAt?: string;
	date_range_start?: string;
	date_range_end?: string;
	dateRangeStart?: string;
	dateRangeEnd?: string;
	granularity?: string;
	timezone?: string;
	schema_version?: string | number;
	schemaVersion?: string | number;
	filters?: string;
	sections?: Array<{
		name?: string;
		display_name?: string;
		displayName?: string;
		headers?: string[];
		data?: Array<Record<string, unknown>>;
	}>;
}

export function parseJson(content: string, path: string): Report {
	const data = JSON.parse(content) as unknown;

	if (Array.isArray(data)) {
		const rows = normalizeRows(data as Array<Record<string, unknown>>);
		return {
			sourcePath: path,
			sourceFormat: 'json',
			metadata: { title: basename(path) },
			sections: [
				{
					name: 'unknown',
					displayName: 'Data',
					headers: rows.length > 0 ? Object.keys(rows[0] ?? {}) : [],
					rows,
				},
			],
		};
	}

	if (data && typeof data === 'object') {
		const obj = data as NestedJson;
		const metadata: ReportMetadata = {
			title: obj.title ?? basename(path),
			destination: obj.destination,
			generatedAt: parseDate(obj.generated_at ?? obj.generatedAt),
			dateRangeStart: parseDate(obj.date_range_start ?? obj.dateRangeStart),
			dateRangeEnd: parseDate(obj.date_range_end ?? obj.dateRangeEnd),
			granularity: obj.granularity,
			timezone: obj.timezone,
			schemaVersion: stringifyOptional(obj.schema_version ?? obj.schemaVersion),
			filters: obj.filters,
		};
		applyFilterMetadata(metadata);
		const sections: ReportSection[] = (obj.sections ?? []).map((s) => {
			const displayName = s.display_name ?? s.displayName ?? s.name ?? '';
			const headers = s.headers ?? (s.data && s.data.length > 0 ? Object.keys(s.data[0] ?? {}) : []);
			const rows = normalizeRows(s.data ?? [], headers);
			return {
				name: canonicalSectionName(displayName),
				displayName,
				headers,
				rows,
			};
		});
		return { sourcePath: path, sourceFormat: 'json', metadata, sections };
	}

	throw new Error(`Unrecognized JSON shape in ${path}`);
}

function normalizeRows(data: Array<Record<string, unknown>>, preferredHeaders?: string[]): Row[] {
	return data.map((item) => {
		const row: Row = {};
		const keys = new Set<string>(preferredHeaders ?? []);
		for (const key of Object.keys(item)) keys.add(key);
		for (const key of keys) row[key] = coerceRowValue(item[key], key);
		return row;
	});
}

function stringifyOptional(value: string | number | undefined): string | undefined {
	if (value == null) return undefined;
	const s = String(value).trim();
	return s ? s : undefined;
}

function basename(path: string): string {
	const parts = path.split('/');
	const name = parts[parts.length - 1] ?? path;
	return name.replace(/\.[^.]+$/, '');
}
