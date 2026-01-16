import {
    App,
    CachedMetadata,
    EventRef,
    FileManager,
    Keymap,
    MetadataCache,
    Scope,
    TAbstractFile,
    TFile,
    TFolder,
    UserEvent,
    Workspace,
} from "obsidian";
import { FileBuilder } from "./FileBuilder";
import { MockVault } from "./MockVault";

const normalizeSlashes = (value: string): string => value.replace(/\\/g, "/");
const joinPath = (...parts: string[]): string => {
    const joined = parts
        .map(normalizeSlashes)
        .filter((part, index) => part !== "" || index === 0)
        .join("/")
        .replace(/\/+/g, "/");
    return joined === "" ? "." : joined;
};
const baseName = (path: string): string => {
    const normalized = normalizeSlashes(path);
    const lastSlash = normalized.lastIndexOf("/");
    return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
};

export class MockCache implements MetadataCache {
    private cache: Map<string, CachedMetadata>;

    constructor(cache: Map<string, CachedMetadata>) {
        this.cache = cache;
    }

    getCache(path: string): CachedMetadata | null {
        return this.cache.get(joinPath("/", path)) || null;
    }

    getFileCache(file: TFile): CachedMetadata | null {
        return this.getCache(file.path);
    }

    // Below here is not implemented.

    getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null {
        throw new Error("Method not implemented.");
    }
    fileToLinktext(
        file: TFile,
        sourcePath: string,
        omitMdExtension?: boolean
    ): string {
        throw new Error("Method not implemented.");
    }
    resolvedLinks: Record<string, Record<string, number>> = {};
    unresolvedLinks: Record<string, Record<string, number>> = {};
    on(
        name: "changed",
        callback: (file: TFile, data: string, cache: CachedMetadata) => unknown,
        ctx?: unknown
    ): EventRef;
    on(
        name: "deleted",
        callback: (file: TFile, prevCache: CachedMetadata | null) => unknown,
        ctx?: unknown
    ): EventRef;
    on(name: "resolve", callback: (file: TFile) => unknown, ctx?: unknown): EventRef;
    on(name: "resolved", callback: () => unknown, ctx?: unknown): EventRef;
    on(
        name: unknown,
        callback: unknown,
        ctx?: unknown
    ): import("obsidian").EventRef {
        throw new Error("Method not implemented.");
    }
    off(name: string, callback: (...data: unknown[]) => unknown): void {
        throw new Error("Method not implemented.");
    }
    offref(ref: EventRef): void {
        throw new Error("Method not implemented.");
    }
    trigger(name: string, ...data: unknown[]): void {
        throw new Error("Method not implemented.");
    }
    tryTrigger(evt: EventRef, args: unknown[]): void {
        throw new Error("Method not implemented.");
    }
}

export class MockApp implements App {
    keymap: Keymap = {} as Keymap;
    scope: Scope = {} as Scope;
    workspace: Workspace = {} as Workspace;
    lastEvent: UserEvent | null = null;

    fileManager: FileManager = {} as FileManager;
    metadataCache: MetadataCache;
    vault: MockVault;
    loadLocalStorage(): void {
        // mock implementation
    }

    saveLocalStorage(): void {
        // mock implementation
    }
    constructor(vault: MockVault, cache: MockCache) {
        this.vault = vault;
        this.metadataCache = cache;
    }
}

interface FileTree<T> {
    [key: string]: { t: "file"; v: T } | { t: "folder"; v: FileTree<T> };
}

function toPathMap<T>(tree: FileTree<T>): Map<string, T> {
    const recurse = (t: FileTree<T>, path: string): [string, T][] =>
        Object.entries(t).flatMap(([name, v]) =>
            v.t === "file"
                ? [[joinPath(path, name), v.v]]
                : recurse(v.v, joinPath(path, name))
        );
    return new Map(recurse(tree, "/"));
}

export class MockAppBuilder {
    children: TAbstractFile[];
    metadata: FileTree<CachedMetadata>;
    contents: FileTree<string>;
    path: string;

    static make() {
        return new MockAppBuilder("/", [], {}, {});
    }

    constructor(
        path: string,
        children: TAbstractFile[] = [],
        contents: FileTree<string> = {},
        metadata: FileTree<CachedMetadata> = {}
    ) {
        this.path = joinPath("/", path);
        this.children = children;
        this.metadata = metadata;
        this.contents = contents;
    }

    file(filename: string, builder: FileBuilder): MockAppBuilder {
        let file = new TFile();
        file.name = filename;

        const [contents, metadata] = builder.done();

        return new MockAppBuilder(
            this.path,
            [...this.children, file],
            { ...this.contents, [filename]: { t: "file", v: contents } },
            { ...this.metadata, [filename]: { t: "file", v: metadata } }
        );
    }

    folder(f: MockAppBuilder) {
        return new MockAppBuilder(
            this.path,
            [...this.children, f.makeFolder()],
            { ...this.contents, [f.path]: { t: "folder", v: f.contents } },
            { ...this.metadata, [f.path]: { t: "folder", v: f.metadata } }
        );
    }

    private makeFolder(): TFolder {
        let folder = new TFolder();
        folder.name = this.path === "/" ? "" : baseName(this.path);
        if (folder.name === "") {
            (folder as unknown as { isRootVal: boolean }).isRootVal = true;
        }
        this.children.forEach((f) => (f.parent = folder));
        folder.children = [...this.children];
        return folder;
    }

    done(): MockApp {
        return new MockApp(
            new MockVault(this.makeFolder(), toPathMap(this.contents)),
            new MockCache(toPathMap(this.metadata))
        );
    }
}
