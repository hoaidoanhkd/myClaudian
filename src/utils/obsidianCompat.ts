import type { App, TFile, Workspace, WorkspaceLeaf } from 'obsidian';

export function getVaultFileByPath(app: App, filePath: string): TFile | null {
  const file = app.vault.getAbstractFileByPath(filePath);
  return isVaultFile(file) ? file : null;
}

export async function revealWorkspaceLeaf(workspace: Workspace, leaf: WorkspaceLeaf): Promise<void> {
  await workspace.revealLeaf(leaf);
}

function isVaultFile(value: unknown): value is TFile {
  return !!value && typeof value === 'object' && typeof (value as Record<string, unknown>).path === 'string' && typeof (value as Record<string, unknown>).basename === 'string';
}


