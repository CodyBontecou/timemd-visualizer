import { Report, ReportMetadata, ReportSection, Row } from '../types';
import { canonicalSectionName, coerceNumber, parseDate } from '../utils';

const COMMENT_META: Array<[RegExp, keyof ReportMetadata | '__date']> = [
	[/^#\s*Title:\s*(.+)$/i, 'title'],
	[/^#\s*Destination:\s*(.+)$/i, 'destination'],
	[/^#\s*Generated At:\s*(.+)$/i, 'generatedAt'],
	[/^#\s*Filters:\s*(.+)$/i, 'filters'],
	[/^#\s*Granularity:\s*(.+)$/i, 'granularity'],
];

export function parseCsv(content: string, path: string): Report {
	const lines = content.split(/\r?\n/);
	const metadata: ReportMetadata = { title: basename(path) };
	const sections: ReportSection[] = [];

	let current: { name: string; headers: string[] | null; rows: Row[] } | null = null;

	const flush = () => {
		if (!current) return;
		sections.push({
			name: canonicalSectionName(current.name),
			displayName: current.name,
			headers: current.headers ?? [],
			rows: current.rows,
		});
		current = null;
	};

	for (const rawLine of lines) {
		const line = rawLine.trimEnd();
		if (!line.trim()) continue;

		if (line.startsWith('#')) {
			for (const [re, key] of COMMENT_META) {
				const m = line.match(re);
				if (m && m[1]) {
					const value = m[1].trim();
					if (key === 'generatedAt') metadata.generatedAt = parseDate(value);
					else if (key === 'title') metadata.title = value;
					else if (key === 'destination') metadata.destination = value;
					else if (key === 'filters') metadata.filters = value;
					else if (key === 'granularity') metadata.granularity = value;
					break;
				}
			}
			continue;
		}

		const sectionMatch = line.match(/^\[(.+)\]$/);
		if (sectionMatch && sectionMatch[1]) {
			flush();
			current = { name: sectionMatch[1].trim(), headers: null, rows: [] };
			continue;
		}

		const fields = parseCsvLine(line);
		if (!current) {
			current = { name: 'Data', headers: null, rows: [] };
		}
		if (current.headers === null) {
			current.headers = fields;
		} else {
			const row: Row = {};
			current.headers.forEach((h, i) => {
				const v = fields[i] ?? '';
				row[h] = coerceNumber(v);
			});
			current.rows.push(row);
		}
	}
	flush();

	return { sourcePath: path, sourceFormat: 'csv', metadata, sections };
}

function parseCsvLine(line: string): string[] {
	const out: string[] = [];
	let cur = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (inQuotes) {
			if (ch === '"') {
				if (line[i + 1] === '"') {
					cur += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				cur += ch;
			}
		} else {
			if (ch === '"') inQuotes = true;
			else if (ch === ',' || ch === '\t' || ch === ';' || ch === '|') {
				out.push(cur);
				cur = '';
			} else cur += ch;
		}
	}
	out.push(cur);
	return out.map((s) => s.trim());
}

function basename(path: string): string {
	const parts = path.split('/');
	const name = parts[parts.length - 1] ?? path;
	return name.replace(/\.[^.]+$/, '');
}
