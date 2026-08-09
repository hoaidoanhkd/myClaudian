import { type App, Notice } from 'obsidian';

export class ObsidianAgyExtensionUiRenderer {
  constructor(private readonly app: App) {}

  notify(message: string): void {
    new Notice(message);
  }
}
