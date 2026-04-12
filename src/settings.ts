import { App, PluginSettingTab, Setting, TFolder } from 'obsidian';
import type TimeMdPlugin from './main';

export interface TimeMdSettings {
	exportFolder: string;
	autoReloadOnStartup: boolean;
	accentColor: string;
	heatmapColor: string;
}

export const DEFAULT_ACCENT_COLOR = '';
export const DEFAULT_HEATMAP_COLOR = '#5865f2';

export const DEFAULT_SETTINGS: TimeMdSettings = {
	exportFolder: '',
	autoReloadOnStartup: true,
	accentColor: DEFAULT_ACCENT_COLOR,
	heatmapColor: DEFAULT_HEATMAP_COLOR,
};

export class TimeMdSettingTab extends PluginSettingTab {
	plugin: TimeMdPlugin;

	constructor(app: App, plugin: TimeMdPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName('Export folder')
			.setDesc(
				'Vault-relative path to the folder containing your time.md exports (JSON, CSV, Markdown, or Obsidian). Sub-folders are searched recursively.',
			)
			.addText((text) => {
				text.setPlaceholder('e.g. time.md/exports')
					.setValue(this.plugin.settings.exportFolder)
					.onChange(async (value) => {
						this.plugin.settings.exportFolder = value.trim();
						await this.plugin.saveSettings();
					});
				const input = text.inputEl;
				input.addEventListener('blur', () => {
					void this.plugin.store.reload();
				});
			});

		new Setting(containerEl)
			.setName('Reload on startup')
			.setDesc('Re-scan the export folder automatically when Obsidian loads.')
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.autoReloadOnStartup).onChange(async (value) => {
					this.plugin.settings.autoReloadOnStartup = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName('Heatmap color')
			.setDesc('Color used for heatmap cells and the month grid intensity fill.')
			.addColorPicker((picker) =>
				picker.setValue(this.plugin.settings.heatmapColor || DEFAULT_HEATMAP_COLOR).onChange(async (value) => {
					this.plugin.settings.heatmapColor = value;
					await this.plugin.saveSettings();
					this.plugin.applyColorVars();
					this.plugin.refreshAllViews();
				}),
			)
			.addExtraButton((btn) =>
				btn
					.setIcon('rotate-ccw')
					.setTooltip('Reset to default')
					.onClick(async () => {
						this.plugin.settings.heatmapColor = DEFAULT_HEATMAP_COLOR;
						await this.plugin.saveSettings();
						this.plugin.applyColorVars();
						this.plugin.refreshAllViews();
						this.display();
					}),
			);

		new Setting(containerEl)
			.setName('Accent color')
			.setDesc('Color used for line charts and bar fills. Leave unset to follow the Obsidian theme accent.')
			.addColorPicker((picker) => {
				const current = this.plugin.settings.accentColor || readThemeAccent();
				picker.setValue(current).onChange(async (value) => {
					this.plugin.settings.accentColor = value;
					await this.plugin.saveSettings();
					this.plugin.applyColorVars();
					this.plugin.refreshAllViews();
				});
			})
			.addExtraButton((btn) =>
				btn
					.setIcon('rotate-ccw')
					.setTooltip('Use theme accent')
					.onClick(async () => {
						this.plugin.settings.accentColor = '';
						await this.plugin.saveSettings();
						this.plugin.applyColorVars();
						this.plugin.refreshAllViews();
						this.display();
					}),
			);

		new Setting(containerEl)
			.setName('Reload now')
			.setDesc('Re-scan the export folder and refresh all open views.')
			.addButton((btn) =>
				btn.setButtonText('Reload').onClick(() => {
					void this.plugin.store.reload();
				}),
			);

		const stats = containerEl.createDiv({ cls: 'timemd-settings-stats' });
		const folder = this.plugin.settings.exportFolder
			? this.app.vault.getAbstractFileByPath(this.plugin.settings.exportFolder)
			: null;
		if (this.plugin.settings.exportFolder && !(folder instanceof TFolder)) {
			stats.createEl('p', {
				text: `⚠ Folder "${this.plugin.settings.exportFolder}" not found in vault.`,
				cls: 'timemd-warning',
			});
		}
		stats.createEl('p', {
			text: `${this.plugin.store.reports.length} report(s) currently loaded.`,
		});
	}
}

function readThemeAccent(): string {
	try {
		const v = getComputedStyle(document.body).getPropertyValue('--interactive-accent').trim();
		if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return v;
	} catch {
		// fall through
	}
	return DEFAULT_HEATMAP_COLOR;
}
