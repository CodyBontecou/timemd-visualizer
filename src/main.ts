import { Plugin, WorkspaceLeaf } from 'obsidian';
import { DataStore } from './store';
import { DEFAULT_SETTINGS, TimeMdSettings, TimeMdSettingTab } from './settings';
import { OverviewView, VIEW_TYPE_OVERVIEW } from './views/overview';
import { TrendsView, VIEW_TYPE_TRENDS } from './views/trends';
import { CalendarView, VIEW_TYPE_CALENDAR } from './views/calendar';
import { DetailsView, VIEW_TYPE_DETAILS } from './views/details';
import { AppsView, VIEW_TYPE_APPS } from './views/apps';

type ViewType =
	| typeof VIEW_TYPE_OVERVIEW
	| typeof VIEW_TYPE_TRENDS
	| typeof VIEW_TYPE_CALENDAR
	| typeof VIEW_TYPE_DETAILS
	| typeof VIEW_TYPE_APPS;

export default class TimeMdPlugin extends Plugin {
	settings!: TimeMdSettings;
	store!: DataStore;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.store = new DataStore(this.app, () => this.settings.exportFolder);

		this.registerView(VIEW_TYPE_OVERVIEW, (leaf) => new OverviewView(leaf, this));
		this.registerView(VIEW_TYPE_TRENDS, (leaf) => new TrendsView(leaf, this));
		this.registerView(VIEW_TYPE_CALENDAR, (leaf) => new CalendarView(leaf, this));
		this.registerView(VIEW_TYPE_DETAILS, (leaf) => new DetailsView(leaf, this));
		this.registerView(VIEW_TYPE_APPS, (leaf) => new AppsView(leaf, this));

		this.addRibbonIcon('clock-3', 'time.md: Open Overview', () => {
			void this.activateView(VIEW_TYPE_OVERVIEW);
		});

		this.addCommand({
			id: 'open-overview',
			name: 'Open Overview',
			callback: () => void this.activateView(VIEW_TYPE_OVERVIEW),
		});
		this.addCommand({
			id: 'open-trends',
			name: 'Open Trends',
			callback: () => void this.activateView(VIEW_TYPE_TRENDS),
		});
		this.addCommand({
			id: 'open-calendar',
			name: 'Open Calendar',
			callback: () => void this.activateView(VIEW_TYPE_CALENDAR),
		});
		this.addCommand({
			id: 'open-details',
			name: 'Open Details',
			callback: () => void this.activateView(VIEW_TYPE_DETAILS),
		});
		this.addCommand({
			id: 'open-apps',
			name: 'Open Apps & Categories',
			callback: () => void this.activateView(VIEW_TYPE_APPS),
		});
		this.addCommand({
			id: 'reload-exports',
			name: 'Reload exports',
			callback: () => void this.store.reload(),
		});

		this.addSettingTab(new TimeMdSettingTab(this.app, this));

		this.app.workspace.onLayoutReady(() => {
			if (this.settings.autoReloadOnStartup) void this.store.reload();
		});
	}

	onunload(): void {
		// Leaves are automatically cleaned up by Obsidian on plugin unload.
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<TimeMdSettings>,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	async activateView(type: ViewType): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(type);
		let leaf: WorkspaceLeaf | null = existing[0] ?? null;
		if (!leaf) {
			leaf = workspace.getLeaf('tab');
			await leaf.setViewState({ type, active: true });
		}
		workspace.revealLeaf(leaf);
	}
}
