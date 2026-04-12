import { Report, ReportMetadata, ReportSection, Row } from '../types';
import { canonicalSectionName, coerceNumber, parseDate, stripLeadingEmoji, stripWikiLinks } from '../utils';

export function parseMarkdown(content: string, path: string): Report {
	return parseMarkdownBody(content, path, 'markdown');
}

export function parseMarkdownBody(
	content: string,
	path: string,
	format: 'markdown' | 'obsidian',
	presetMeta?: ReportMetadata,
): Report {
	const lines = content.split(/\r?\n/);
	const metadata: ReportMetadata = presetMeta ?? { title: basename(path) };
	const sections: ReportSection[] = [];

	let i = 0;
	while (i < lines.length) {
		const line = lines[i] ?? '';

		const h1 = line.match(/^#\s+(.+?)\s*$/);
		if (h1 && h1[1] && !presetMeta?.title) {
			metadata.title = stripLeadingEmoji(h1[1]);
			i++;
			continue;
		}

		const metaGen = line.match(/\*\*Generated:\*\*\s*(.+)/);
		if (metaGen && metaGen[1]) {
			const v = stripWikiLinks(metaGen[1]).trim();
			metadata.generatedAt = parseDate(v) ?? metadata.generatedAt;
			i++;
			continue;
		}
		const metaRange = line.match(/\*\*Date Range:\*\*\s*(.+)/);
		if (metaRange && metaRange[1]) {
			const v = stripWikiLinks(metaRange[1]).trim();
			const parts = v.split(/[→\-]+/).map((s) => s.trim()).filter(Boolean);
			if (parts[0]) metadata.dateRangeStart = parseDate(parts[0]) ?? metadata.dateRangeStart;
			if (parts[1]) metadata.dateRangeEnd = parseDate(parts[1]) ?? metadata.dateRangeEnd;
			i++;
			continue;
		}
		const metaGran = line.match(/\*\*Granularity:\*\*\s*(.+)/);
		if (metaGran && metaGran[1]) {
			metadata.granularity = metaGran[1].trim();
			i++;
			continue;
		}

		const h2 = line.match(/^##\s+(.+?)\s*$/);
		if (h2 && h2[1]) {
			const displayName = stripLeadingEmoji(h2[1]);
			i++;
			while (i < lines.length) {
				const l = lines[i] ?? '';
				if (l.trim() === '') { i++; continue; }
				if (/^#{1,6}\s/.test(l)) break;
				if (l.trim().startsWith('|')) {
					const tableResult = parseTable(lines, i, format);
					if (tableResult) {
						sections.push({
							name: canonicalSectionName(displayName),
							displayName,
							headers: tableResult.headers,
							rows: tableResult.rows,
						});
						i = tableResult.nextIndex;
						break;
					}
				}
				i++;
			}
			continue;
		}

		i++;
	}

	return { sourcePath: path, sourceFormat: format, metadata, sections };
}

function parseTable(
	lines: string[],
	start: number,
	_format: 'markdown' | 'obsidian',
): { headers: string[]; rows: Row[]; nextIndex: number } | null {
	const headerLine = lines[start];
	const sepLine = lines[start + 1];
	if (!headerLine || !sepLine) return null;
	if (!/^\|[\s-:|]+\|?$/.test(sepLine.trim())) return null;

	const headers = splitPipes(headerLine);
	const rows: Row[] = [];
	let i = start + 2;
	while (i < lines.length) {
		const l = lines[i] ?? '';
		if (!l.trim().startsWith('|')) break;
		const cells = splitPipes(l);
		const row: Row = {};
		headers.forEach((h, j) => {
			let v = cells[j] ?? '';
			v = stripWikiLinks(v);
			v = v.replace(/\\\|/g, '|').trim();
			row[h] = coerceNumber(v);
		});
		rows.push(row);
		i++;
	}
	return { headers, rows, nextIndex: i };
}

function splitPipes(line: string): string[] {
	const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
	return trimmed.split('|').map((c) => c.trim());
}

function basename(path: string): string {
	const parts = path.split('/');
	const name = parts[parts.length - 1] ?? path;
	return name.replace(/\.[^.]+$/, '');
}
