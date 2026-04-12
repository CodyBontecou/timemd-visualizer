import { App, PluginSettingTab, Setting, TFolder } from 'obsidian';
import type TimeMdPlugin from './main';

export interface TimeMdSettings {
	exportFolder: string;
	autoReloadOnStartup: boolean;
}

export const DEFAULT_SETTINGS: TimeMdSettings = {
	exportFolder: '',
	autoReloadOnStartup: true,
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
