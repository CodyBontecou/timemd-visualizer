import { WorkspaceLeaf } from 'obsidian';
import { formatDuration } from '../utils';
import { TimeMdBaseView, TimeMdHost } from './base';

export const VIEW_TYPE_DETAILS = 'timemd-details';

export class DetailsView extends TimeMdBaseView {
	private filter = '';

	constructor(leaf: WorkspaceLeaf, host: TimeMdHost) {
		super(leaf, host);
	}

	getViewType(): string {
		return VIEW_TYPE_DETAILS;
	}

	getDisplayText(): string {
		return 'timemd-visualizor — Details';
	}

	renderBody(body: HTMLElement): void {
		const sessions = this.host.store.getSessions();
		if (sessions.length === 0) {
			body.createDiv({ cls: 'timemd-empty-inline', text: 'No raw sessions in the loaded exports.' });
			return;
		}

		const toolbar = body.createDiv({ cls: 'timemd-toolbar' });
		const input = toolbar.createEl('input', {
			type: 'text',
			placeholder: 'Filter by app name…',
			cls: 'timemd-filter-input',
		});
		input.value = this.filter;
		const count = toolbar.createDiv({ cls: 'timemd-toolbar-count' });

		const tableWrap = body.createDiv({ cls: 'timemd-table-wrap' });
		const table = tableWrap.createEl('table', { cls: 'timemd-table' });
		const head = table.createEl('thead').createEl('tr');
		head.createEl('th', { text: 'App' });
		head.createEl('th', { text: 'Start' });
		head.createEl('th', { text: 'End' });
		head.createEl('th', { text: 'Duration' });
		const tbody = table.createEl('tbody');

		const redraw = (): void => {
			tbody.empty();
			const needle = this.filter.trim().toLowerCase();
			const filtered = needle
				? sessions.filter((s) => s.app_name.toLowerCase().includes(needle))
				: sessions;
			const shown = filtered.slice(0, 2000);
			for (const s of shown) {
				const tr = tbody.createEl('tr');
				tr.createEl('td', { text: s.app_name });
				tr.createEl('td', { text: s.start_time.toLocaleString() });
				tr.createEl('td', { text: s.end_time.toLocaleString() });
				tr.createEl('td', { text: formatDuration(s.duration_seconds) });
			}
			const suffix = filtered.length > shown.length ? ` (showing first ${shown.length})` : '';
			count.setText(`${filtered.length} session${filtered.length === 1 ? '' : 's'}${suffix}`);
		};

		input.addEventListener('input', () => {
			this.filter = input.value;
			redraw();
		});

		redraw();
	}
}
