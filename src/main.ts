import { Plugin, TAbstractFile, WorkspaceLeaf } from 'obsidian';
import { DataStore } from './store';
import {
	DEFAULT_HEATMAP_COLOR,
	DEFAULT_SETTINGS,
	TimeMdSettings,
	TimeMdSettingTab,
} from './settings';
import { OverviewView, VIEW_TYPE_OVERVIEW } from './views/overview';
import { TrendsView, VIEW_TYPE_TRENDS } from './views/trends';
import { CalendarView, VIEW_TYPE_CALENDAR } from './views/calendar';
import { DetailsView, VIEW_TYPE_DETAILS } from './views/details';
import { AppsView, VIEW_TYPE_APPS } from './views/apps';
import { ProjectsView, VIEW_TYPE_PROJECTS } from './views/projects';
import { WebHistoryView, VIEW_TYPE_WEB_HISTORY } from './views/webHistory';
import { ReportsView, VIEW_TYPE_REPORTS } from './views/reports';
import { parseBlockParams, TimeMdBlock } from './embed';
import { hexToRgb } from './utils';

type ViewType =
	| typeof VIEW_TYPE_OVERVIEW
	| typeof VIEW_TYPE_TRENDS
	| typeof VIEW_TYPE_CALENDAR
	| typeof VIEW_TYPE_DETAILS
	| typeof VIEW_TYPE_APPS
	| typeof VIEW_TYPE_PROJECTS
	| typeof VIEW_TYPE_WEB_HISTORY
	| typeof VIEW_TYPE_REPORTS;

export default class TimeMdPlugin extends Plugin {
	settings!: TimeMdSettings;
	store!: DataStore;
	private reloadTimer: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.applyColorVars();

		this.store = new DataStore(this.app, () => this.settings.exportFolder);

		this.registerView(VIEW_TYPE_OVERVIEW, (leaf) => new OverviewView(leaf, this));
		this.registerView(VIEW_TYPE_TRENDS, (leaf) => new TrendsView(leaf, this));
		this.registerView(VIEW_TYPE_CALENDAR, (leaf) => new CalendarView(leaf, this));
		this.registerView(VIEW_TYPE_DETAILS, (leaf) => new DetailsView(leaf, this));
		this.registerView(VIEW_TYPE_APPS, (leaf) => new AppsView(leaf, this));
		this.registerView(VIEW_TYPE_PROJECTS, (leaf) => new ProjectsView(leaf, this));
		this.registerView(VIEW_TYPE_WEB_HISTORY, (leaf) => new WebHistoryView(leaf, this));
		this.registerView(VIEW_TYPE_REPORTS, (leaf) => new ReportsView(leaf, this));

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
			id: 'open-projects',
			name: 'Open Projects',
			callback: () => void this.activateView(VIEW_TYPE_PROJECTS),
		});
		this.addCommand({
			id: 'open-web-history',
			name: 'Open Web History',
			callback: () => void this.activateView(VIEW_TYPE_WEB_HISTORY),
		});
		this.addCommand({
			id: 'open-reports',
			name: 'Open Reports',
			callback: () => void this.activateView(VIEW_TYPE_REPORTS),
		});
		this.addCommand({
			id: 'reload-exports',
			name: 'Reload exports',
			callback: () => void this.store.reload(),
		});

		this.addSettingTab(new TimeMdSettingTab(this.app, this));

		this.registerMarkdownCodeBlockProcessor('timemd', (source, el, ctx) => {
			const params = parseBlockParams(source);
			ctx.addChild(new TimeMdBlock(el, this, params));
		});

		const onVaultChange = (file: TAbstractFile, oldPath?: string) => {
			if (this.isInExportFolder(file.path) || (oldPath && this.isInExportFolder(oldPath))) {
				this.scheduleReload();
			}
		};
		this.registerEvent(this.app.vault.on('create', onVaultChange));
		this.registerEvent(this.app.vault.on('modify', onVaultChange));
		this.registerEvent(this.app.vault.on('delete', onVaultChange));
		this.registerEvent(
			this.app.vault.on('rename', (file, oldPath) => onVaultChange(file, oldPath)),
		);

		this.app.workspace.onLayoutReady(() => {
			if (this.settings.autoReloadOnStartup) void this.store.reload();
		});
	}

	onunload(): void {
		if (this.reloadTimer !== null) {
			window.clearTimeout(this.reloadTimer);
			this.reloadTimer = null;
		}
		this.clearColorVars();
	}

	applyColorVars(): void {
		const root = document.body;
		const heatmapHex = this.settings.heatmapColor || DEFAULT_HEATMAP_COLOR;
		const rgb = hexToRgb(heatmapHex) ?? { r: 88, g: 101, b: 242 };
		root.style.setProperty('--timemd-heatmap-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
		if (this.settings.accentColor) {
			root.style.setProperty('--timemd-accent', this.settings.accentColor);
		} else {
			root.style.removeProperty('--timemd-accent');
		}
	}

	private clearColorVars(): void {
		const root = document.body;
		root.style.removeProperty('--timemd-heatmap-rgb');
		root.style.removeProperty('--timemd-accent');
	}

	refreshAllViews(): void {
		this.store.trigger('changed');
	}

	private isInExportFolder(path: string): boolean {
		const folder = (this.settings.exportFolder || '').trim().replace(/\/+$/, '');
		if (!folder) return false;
		return path === folder || path.startsWith(folder + '/');
	}

	private scheduleReload(): void {
		if (this.reloadTimer !== null) window.clearTimeout(this.reloadTimer);
		this.reloadTimer = window.setTimeout(() => {
			this.reloadTimer = null;
			void this.store.reload();
		}, 400);
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
