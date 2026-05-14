import { WorkspaceLeaf } from 'obsidian';
import { renderBarList } from '../charts';
import { formatDuration } from '../utils';
import { TimeMdBaseView, TimeMdHost } from './base';

export const VIEW_TYPE_APPS = 'timemd-apps';

export class AppsView extends TimeMdBaseView {
	constructor(leaf: WorkspaceLeaf, host: TimeMdHost) {
		super(leaf, host);
	}

	getViewType(): string {
		return VIEW_TYPE_APPS;
	}

	getDisplayText(): string {
		return 'Apps & categories';
	}

	renderBody(body: HTMLElement): void {
		const apps = this.host.store.getApps();
		const categories = this.host.store.getCategories();

		const columns = body.createDiv({ cls: 'timemd-columns' });

		const appsCard = columns.createDiv({ cls: 'timemd-card' });
		appsCard.createEl('h3', { text: `Apps (${apps.length})` });
		if (apps.length === 0) {
			appsCard.createDiv({ cls: 'timemd-empty-inline', text: 'No apps section in the loaded exports.' });
		} else {
			renderBarList(
				appsCard,
				apps.map((a) => ({ label: a.app_name, value: a.total_seconds })),
				{ formatValue: formatDuration },
			);
		}

		const catsCard = columns.createDiv({ cls: 'timemd-card' });
		catsCard.createEl('h3', { text: `Categories (${categories.length})` });
		if (categories.length === 0) {
			catsCard.createDiv({ cls: 'timemd-empty-inline', text: 'No categories section in the loaded exports.' });
		} else {
			renderBarList(
				catsCard,
				categories.map((c) => ({ label: c.category, value: c.total_seconds })),
				{ formatValue: formatDuration },
			);
		}
	}
}
