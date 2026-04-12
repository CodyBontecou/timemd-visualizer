import { ItemView, WorkspaceLeaf } from 'obsidian';
import { DataStore } from '../store';

export interface TimeMdHost {
	store: DataStore;
}

export abstract class TimeMdBaseView extends ItemView {
	host: TimeMdHost;

	constructor(leaf: WorkspaceLeaf, host: TimeMdHost) {
		super(leaf);
		this.host = host;
	}

	abstract getViewType(): string;
	abstract getDisplayText(): string;
	abstract renderBody(container: HTMLElement): void;

	getIcon(): string {
		return 'clock-3';
	}

	async onOpen(): Promise<void> {
		this.registerEvent(this.host.store.onChange(() => this.refresh()));
		this.refresh();
	}

	async onClose(): Promise<void> {
		this.contentEl.empty();
	}

	refresh(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass('timemd-view');

		const header = root.createDiv({ cls: 'timemd-view-header' });
		header.createEl('h2', { text: this.getDisplayText(), cls: 'timemd-view-title' });

		const actions = header.createDiv({ cls: 'timemd-view-actions' });
		const loaded = this.host.store.lastLoadedAt;
		if (loaded) {
			actions.createDiv({
				cls: 'timemd-view-loaded',
				text: `loaded ${loaded.toLocaleTimeString()}`,
			});
		}
		const reloadBtn = actions.createEl('button', { text: 'Reload', cls: 'timemd-btn' });
		reloadBtn.addEventListener('click', () => void this.host.store.reload());

		const skipped = this.host.store.skippedFiles;
		if (skipped.length > 0) {
			const banner = root.createDiv({ cls: 'timemd-skipped-banner' });
			banner.createDiv({
				cls: 'timemd-skipped-title',
				text: `${skipped.length} file${skipped.length === 1 ? '' : 's'} skipped`,
			});
			for (const item of skipped) {
				const line = banner.createDiv({ cls: 'timemd-skipped-item' });
				line.createSpan({ cls: 'timemd-skipped-path', text: item.path });
				line.createSpan({ cls: 'timemd-skipped-reason', text: ` — ${item.reason}` });
			}
		}

		if (!this.host.store.hasData()) {
			const empty = root.createDiv({ cls: 'timemd-empty' });
			empty.createEl('p', {
				text: this.host.store.lastError ?? 'No time.md exports loaded. Click Reload.',
			});
			return;
		}

		const body = root.createDiv({ cls: 'timemd-body' });
		this.renderBody(body);
	}
}
