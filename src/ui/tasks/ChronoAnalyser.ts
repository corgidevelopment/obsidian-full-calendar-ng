import { TFolder, Notice, App, WorkspaceLeaf } from "obsidian";

export async function revealAnalysisFolder(app: App) {
    const target = app.vault.getAbstractFileByPath("Calender");
    if (!target || !(target instanceof TFolder)) {
        new Notice("Folder “Calender” not found");
        return;
    }

    let leaf: WorkspaceLeaf | null =
        app.workspace.getLeavesOfType("file-explorer")[0] ?? null;
    if (!leaf) {
        leaf = app.workspace.getLeftLeaf(false);
        if (!leaf) {
            new Notice("Unable to open file explorer.");
            return;
        }
        await leaf.setViewState({ type: "file-explorer" });
    }

    app.workspace.revealLeaf(leaf);
    const view = leaf.view as {
        revealInFolder?: (folder: TFolder) => void;
        reveal?: (folder: TFolder) => void;
    };
    if (typeof view.revealInFolder === "function") {
        view.revealInFolder(target);
    } else if (typeof view.reveal === "function") {
        view.reveal(target);
    } else {
        new Notice("Unable to reveal folder in this version of Obsidian.");
    }
}
