import { Report, ReportMetadata, ReportSection, Row } from '../types';
import { canonicalSectionName, parseDate } from '../utils';

interface NestedJson {
	title?: string;
	destination?: string;
	generated_at?: string;
	filters?: string;
	sections?: Array<{
		name?: string;
		display_name?: string;
		headers?: string[];
		data?: Row[];
	}>;
}

export function parseJson(content: string, path: string): Report {
	const data = JSON.parse(content) as unknown;

	if (Array.isArray(data)) {
		const rows = data as Row[];
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
			generatedAt: parseDate(obj.generated_at),
			filters: obj.filters,
		};
		const sections: ReportSection[] = (obj.sections ?? []).map((s) => {
			const displayName = s.display_name ?? s.name ?? '';
			const rows = s.data ?? [];
			const headers = s.headers ?? (rows.length > 0 ? Object.keys(rows[0] ?? {}) : []);
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

function basename(path: string): string {
	const parts = path.split('/');
	const name = parts[parts.length - 1] ?? path;
	return name.replace(/\.[^.]+$/, '');
}
