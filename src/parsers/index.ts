import { Report } from '../types';
import { parseCsv } from './csv';
import { parseJson } from './json';
import { parseMarkdown } from './markdown';
import { parseObsidian } from './obsidian';

export function parseReport(path: string, content: string): Report {
	const ext = path.toLowerCase().split('.').pop();
	if (ext === 'json') return parseJson(content, path);
	if (ext === 'csv') return parseCsv(content, path);
	if (ext === 'md' || ext === 'markdown') {
		if (content.trimStart().startsWith('---')) return parseObsidian(content, path);
		return parseMarkdown(content, path);
	}
	throw new Error(`Unsupported file type for ${path}`);
}

export const SUPPORTED_EXTENSIONS = ['json', 'csv', 'md', 'markdown'] as const;

export function isSupportedPath(path: string): boolean {
	const ext = path.toLowerCase().split('.').pop();
	return SUPPORTED_EXTENSIONS.includes(ext as (typeof SUPPORTED_EXTENSIONS)[number]);
}
