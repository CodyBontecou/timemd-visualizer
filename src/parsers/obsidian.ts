import { Report, ReportMetadata } from '../types';
import { parseDate } from '../utils';
import { parseMarkdownBody } from './markdown';

export function parseObsidian(content: string, path: string): Report {
	const { frontmatter, body, isObsidianFormat } = extractFrontmatter(content);
	const metadata: ReportMetadata = buildMetadataFromFrontmatter(frontmatter, path);
	const report = parseMarkdownBody(body, path, isObsidianFormat ? 'obsidian' : 'markdown', metadata);
	return report;
}

interface Frontmatter {
	[k: string]: string | number | string[] | undefined;
}

function extractFrontmatter(content: string): { frontmatter: Frontmatter; body: string; isObsidianFormat: boolean } {
	const lines = content.split(/\r?\n/);
	if (lines[0]?.trim() !== '---') {
		return { frontmatter: {}, body: content, isObsidianFormat: false };
	}
	let end = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i]?.trim() === '---') { end = i; break; }
	}
	if (end === -1) return { frontmatter: {}, body: content, isObsidianFormat: false };
	const fmLines = lines.slice(1, end);
	const body = lines.slice(end + 1).join('\n');
	const fm = parseSimpleYaml(fmLines);
	return { frontmatter: fm, body, isObsidianFormat: true };
}

function parseSimpleYaml(lines: string[]): Frontmatter {
	const out: Frontmatter = {};
	let i = 0;
	while (i < lines.length) {
		const line = lines[i] ?? '';
		if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }
		const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
		if (!kv) { i++; continue; }
		const key = kv[1]!;
		const rawValue = (kv[2] ?? '').trim();
		if (rawValue === '') {
			const list: string[] = [];
			i++;
			while (i < lines.length) {
				const next = lines[i] ?? '';
				const item = next.match(/^\s+-\s+(.*)$/);
				if (!item) break;
				list.push(unquote(item[1] ?? ''));
				i++;
			}
			out[key] = list;
			continue;
		}
		const inlineList = rawValue.match(/^\[(.*)\]$/);
		if (inlineList && inlineList[1] !== undefined) {
			out[key] = inlineList[1]
				.split(',')
				.map((s) => unquote(s.trim()))
				.filter(Boolean);
		} else if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
			out[key] = Number(rawValue);
		} else {
			out[key] = unquote(rawValue);
		}
		i++;
	}
	return out;
}

function unquote(s: string): string {
	if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
		return s.slice(1, -1);
	}
	return s;
}

function buildMetadataFromFrontmatter(fm: Frontmatter, path: string): ReportMetadata {
	const meta: ReportMetadata = {
		title: typeof fm.title === 'string' ? fm.title : basename(path),
	};
	if (typeof fm.date === 'string') meta.generatedAt = parseDate(fm.date);
	if (typeof fm.created === 'string') meta.generatedAt = parseDate(fm.created) ?? meta.generatedAt;
	if (typeof fm.total_hours === 'number') meta.totalHours = fm.total_hours;
	if (typeof fm.total_minutes === 'number') meta.totalMinutes = fm.total_minutes;
	if (Array.isArray(fm.top_apps)) meta.topApps = fm.top_apps;
	if (Array.isArray(fm.tags)) meta.tags = fm.tags;
	if (typeof fm.filters === 'string') meta.filters = fm.filters;
	return meta;
}

function basename(path: string): string {
	const parts = path.split('/');
	const name = parts[parts.length - 1] ?? path;
	return name.replace(/\.[^.]+$/, '');
}
