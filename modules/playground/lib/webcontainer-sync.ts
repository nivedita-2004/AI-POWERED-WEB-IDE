import { WebContainer, IFSWatcher } from "@webcontainer/api";
import { TemplateFile, TemplateFolder } from "./path-to-json";
import { findFilePath } from "./index";
import { useFileExplorer } from "../hooks/useFileExplorer";
import { SaveUpdatedCode } from "../actions";
import loader from "@monaco-editor/loader";

// Track the most recent content written by Monaco/saving to prevent circular sync
const lastMonacoWrites = new Map<string, string>();

/**
 * Record a write originating from Monaco/saving so the watcher ignores it.
 */
export function recordMonacoWrite(filePath: string, content: string): void {
  const normalized = normalizePath(filePath);
  if (normalized) {
    lastMonacoWrites.set(normalized, content);
  }
}

/**
 * Normalize paths to be forward-slash delimited without leading slashes, trailing slashes, or "./"
 */
export function normalizePath(p: string | null | undefined): string {
  if (!p || typeof p !== "string") return "";
  let clean = p.replace(/\\/g, "/").trim();
  // Strip leading ./ and /
  clean = clean.replace(/^(\.\/|\/)+/, "");
  // Strip trailing slashes
  clean = clean.replace(/\/+$/, "").trim();
  // Reject relative segments or undefined literal strings
  if (
    clean === "." ||
    clean === ".." ||
    clean === "undefined" ||
    clean === "null" ||
    clean.startsWith("./")
  ) {
    return "";
  }
  return clean;
}

/**
 * Determine if a path belongs to ignored folders (node_modules, .git, etc.)
 */
export function isIgnoredPath(p: string): boolean {
  if (!p) return true;
  const parts = p.split("/").filter(Boolean);
  if (parts.length === 0) return true;
  const first = parts[0];
  if (
    first === "node_modules" ||
    first === ".git" ||
    first === ".cache" ||
    first === ".npm" ||
    first === ".next" ||
    first === ".turbo" ||
    first === "dist" ||
    first === "build"
  ) {
    return true;
  }
  if (p.endsWith("~") || p.endsWith(".tmp") || p.endsWith(".swp")) {
    return true;
  }
  return false;
}

/**
 * Split a file name with extension into filename and fileExtension.
 * Returns null if the name is invalid, empty, or "undefined".
 */
export function splitFilenameAndExt(fileNameWithExt: string): {
  filename: string;
  fileExtension: string;
} | null {
  if (!fileNameWithExt || typeof fileNameWithExt !== "string") {
    return null;
  }
  let clean = fileNameWithExt.trim();
  if (
    !clean ||
    clean === "undefined" ||
    clean === "null" ||
    clean === "." ||
    clean === ".."
  ) {
    return null;
  }
  // Strip trailing dots
  clean = clean.replace(/\.+$/, "");
  if (!clean || clean === "undefined" || clean === "null") {
    return null;
  }

  const lastDot = clean.lastIndexOf(".");
  if (lastDot === -1 || lastDot === 0) {
    return { filename: clean, fileExtension: "" };
  }
  return {
    filename: clean.slice(0, lastDot),
    fileExtension: clean.slice(lastDot + 1),
  };
}

/**
 * Accurately determines if a path in WebContainer is a directory, a file, or deleted/non-existent.
 */
async function checkFsEntryType(
  instance: WebContainer,
  normalizedPath: string
): Promise<"file" | "directory" | "deleted"> {
  const parts = normalizedPath.split("/").filter(Boolean);
  if (parts.length === 0) return "directory"; // root

  const parentDir = parts.slice(0, -1).join("/");
  const targetName = parts[parts.length - 1];

  try {
    const entries = await instance.fs.readdir(parentDir || ".", {
      withFileTypes: true,
    });
    const match = entries.find((e) => e.name === targetName);
    if (!match) {
      return "deleted";
    }
    if (match.isDirectory()) {
      return "directory";
    }
    if (match.isFile()) {
      return "file";
    }
  } catch {
    // If reading parent dir failed, fallback to direct inspection
  }

  // Fallback: if readdir on normalizedPath succeeds, it's definitely a directory
  try {
    await instance.fs.readdir(normalizedPath);
    return "directory";
  } catch {
    try {
      await instance.fs.readFile(normalizedPath);
      return "file";
    } catch {
      return "deleted";
    }
  }
}

/**
 * Ensures a directory path exists as TemplateFolder nodes in the tree.
 * NEVER creates file nodes. Does not duplicate existing folders.
 */
export function ensureFolderInTree(
  root: TemplateFolder,
  relativePath: string
): { updatedTree: TemplateFolder; created: boolean } {
  const normalized = normalizePath(relativePath);
  if (!normalized) return { updatedTree: root, created: false };

  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return { updatedTree: root, created: false };

  for (const part of parts) {
    if (!part || part === "undefined" || part === "null" || part.endsWith(".")) {
      return { updatedTree: root, created: false };
    }
  }

  const cloned: TemplateFolder = JSON.parse(JSON.stringify(root));
  let currentFolder = cloned;
  let created = false;

  for (const part of parts) {
    let nextFolder = currentFolder.items.find(
      (item): item is TemplateFolder =>
        "folderName" in item && item.folderName === part
    );
    if (!nextFolder) {
      nextFolder = { folderName: part, items: [] };
      currentFolder.items.push(nextFolder);
      created = true;
    }
    currentFolder = nextFolder;
  }

  return { updatedTree: cloned, created };
}

/**
 * Insert or update a file in the TemplateFolder tree.
 * Rejects directory names and invalid paths.
 */
export function updateFileInTree(
  root: TemplateFolder,
  relativePath: string,
  content: string
): { updatedTree: TemplateFolder; file: TemplateFile | null } {
  const normalized = normalizePath(relativePath);
  if (!normalized) return { updatedTree: root, file: null };

  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return { updatedTree: root, file: null };

  const fileNameWithExt = parts[parts.length - 1];
  const folderParts = parts.slice(0, -1);

  const parsed = splitFilenameAndExt(fileNameWithExt);
  if (!parsed || !parsed.filename || parsed.filename === "undefined" || parsed.filename === "null") {
    return { updatedTree: root, file: null };
  }

  const { filename, fileExtension } = parsed;

  const cloned: TemplateFolder = JSON.parse(JSON.stringify(root));
  let currentFolder = cloned;

  for (const part of folderParts) {
    if (!part || part === "undefined" || part === "null") {
      return { updatedTree: root, file: null };
    }
    let nextFolder = currentFolder.items.find(
      (item): item is TemplateFolder =>
        "folderName" in item && item.folderName === part
    );
    if (!nextFolder) {
      nextFolder = { folderName: part, items: [] };
      currentFolder.items.push(nextFolder);
    }
    currentFolder = nextFolder;
  }

  // CRITICAL: If a folder with the same name already exists in this folder and extension is empty,
  // this is a directory. NEVER create a file node for it!
  const existingFolder = currentFolder.items.find(
    (item): item is TemplateFolder =>
      "folderName" in item && item.folderName === filename
  );
  if (existingFolder && !fileExtension) {
    return { updatedTree: root, file: null };
  }

  const existingIndex = currentFolder.items.findIndex(
    (item) =>
      !("folderName" in item) &&
      item.filename === filename &&
      item.fileExtension === fileExtension
  );

  const file: TemplateFile = { filename, fileExtension, content };

  if (existingIndex !== -1) {
    currentFolder.items[existingIndex] = file;
  } else {
    currentFolder.items.push(file);
  }

  return { updatedTree: cloned, file };
}

/**
 * Safely removes a file or folder from the TemplateFolder tree.
 */
export function removePathFromTree(
  root: TemplateFolder,
  relativePath: string
): { updatedTree: TemplateFolder; removed: boolean } {
  const normalized = normalizePath(relativePath);
  if (!normalized) return { updatedTree: root, removed: false };

  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return { updatedTree: root, removed: false };

  const targetName = parts[parts.length - 1];
  const folderParts = parts.slice(0, -1);
  const parsed = splitFilenameAndExt(targetName);

  const cloned: TemplateFolder = JSON.parse(JSON.stringify(root));
  let currentFolder = cloned;

  for (const part of folderParts) {
    const nextFolder = currentFolder.items.find(
      (item): item is TemplateFolder =>
        "folderName" in item && item.folderName === part
    );
    if (!nextFolder) return { updatedTree: root, removed: false };
    currentFolder = nextFolder;
  }

  const initialLen = currentFolder.items.length;
  currentFolder.items = currentFolder.items.filter((item) => {
    if ("folderName" in item) {
      return item.folderName !== targetName;
    }
    if (parsed) {
      return (
        item.filename !== parsed.filename ||
        item.fileExtension !== parsed.fileExtension
      );
    }
    return item.filename !== targetName;
  });

  return {
    updatedTree: cloned,
    removed: currentFolder.items.length < initialLen,
  };
}

export const removeFileFromTree = removePathFromTree;

function collectAllFolderNames(
  root: TemplateFolder,
  names: Set<string> = new Set()
): Set<string> {
  if (!root || !Array.isArray(root.items)) return names;
  for (const item of root.items) {
    if ("folderName" in item && item.folderName) {
      names.add(item.folderName);
      collectAllFolderNames(item, names);
    }
  }
  return names;
}

/**
 * Sanitizes a template tree by stripping any invalid/corrupted entries:
 * - Empty, "undefined", or trailing "." filenames or folder names
 * - Fake files that duplicate an existing folder name with no extension
 */
export function sanitizeTree(
  root: TemplateFolder,
  allFolderNames?: Set<string>
): TemplateFolder {
  if (!root || !Array.isArray(root.items)) return root;

  const allFolders = allFolderNames || collectAllFolderNames(root);

  const localFolderNames = new Set(
    root.items
      .filter((item) => "folderName" in item && item.folderName)
      .map((item) => (item as TemplateFolder).folderName)
  );

  const cleanedItems: (TemplateFile | TemplateFolder)[] = [];
  for (const item of root.items) {
    if ("folderName" in item) {
      if (
        !item.folderName ||
        item.folderName === "undefined" ||
        item.folderName === "null" ||
        item.folderName.endsWith(".")
      ) {
        continue;
      }
      cleanedItems.push(sanitizeTree(item, allFolders));
    } else if ("filename" in item) {
      if (
        !item.filename ||
        item.filename === "undefined" ||
        item.filename === "null" ||
        item.filename.endsWith(".")
      ) {
        continue;
      }
      if (!item.fileExtension && (localFolderNames.has(item.filename) || allFolders.has(item.filename))) {
        continue;
      }
      if (item.filename === "package" && item.fileExtension === "json" && item.content) {
        try {
          const pkg = JSON.parse(item.content);
          if (pkg?.scripts?.start === "next start") {
            pkg.scripts.start = "next dev --hostname 0.0.0.0";
            if (pkg.scripts.dev === "next dev") {
              pkg.scripts.dev = "next dev --hostname 0.0.0.0";
            }
            cleanedItems.push({
              ...item,
              content: JSON.stringify(pkg, null, 2),
            });
            continue;
          }
        } catch {}
      }
      cleanedItems.push(item);
    }
  }

  return {
    ...root,
    items: cleanedItems,
  };
}

/**
 * Directly update matching Monaco text models if Monaco is initialized.
 */
function updateMonacoModels(relativePath: string, newContent: string) {
  try {
    const monaco = loader.__getMonacoInstance();
    if (!monaco) return;
    const models = monaco.editor.getModels();
    for (const model of models) {
      const modelPath = normalizePath(model.uri.path);
      if (modelPath === relativePath || modelPath.endsWith("/" + relativePath)) {
        if (model.getValue() !== newContent) {
          model.setValue(newContent);
        }
      }
    }
  } catch (err) {
    console.warn("Failed to update Monaco models:", err);
  }
}

interface WebContainerSyncOptions {
  instance: WebContainer;
  playgroundId: string;
}

/**
 * Sets up bidirectional WebContainer filesystem -> Monaco file synchronization.
 */
export function setupWebContainerSync({
  instance,
  playgroundId,
}: WebContainerSyncOptions): () => void {
  const pendingDebounces = new Map<string, NodeJS.Timeout>();
  let isClosed = false;

  async function handleFileChange(rawPath: string) {
    if (isClosed) return;
    const normalized = normalizePath(rawPath);

    if (!normalized || isIgnoredPath(normalized)) {
      return;
    }

    try {
      const entryType = await checkFsEntryType(instance, normalized);
      if (isClosed) return;

      const {
        templateData,
        openFiles,
        activeFileId,
        setTemplateData,
        setOpenFiles,
        setEditorContent,
      } = useFileExplorer.getState();

      if (!templateData) return;

      if (entryType === "directory") {
        // Ensure folder exists in tree. NEVER create a file.
        const { updatedTree, created } = ensureFolderInTree(
          templateData,
          normalized
        );
        if (created) {
          setTemplateData(updatedTree);
          SaveUpdatedCode(playgroundId, updatedTree).catch(console.error);
        }
        return;
      }

      if (entryType === "file") {
        let content: string;
        try {
          content = await instance.fs.readFile(normalized, "utf-8");
        } catch {
          return;
        }

        if (isClosed) return;

        // Infinite loop prevention from Monaco save
        const lastWrite = lastMonacoWrites.get(normalized);
        if (lastWrite === content) {
          return;
        }
        lastMonacoWrites.set(normalized, content);

        // Check if existing file in tree already has identical content (mount quiet check)
        const parts = normalized.split("/").filter(Boolean);
        const fileNameWithExt = parts[parts.length - 1];
        const folderParts = parts.slice(0, -1);
        const parsed = splitFilenameAndExt(fileNameWithExt);
        if (!parsed) return;

        let cur = templateData;
        let foundFolder = true;
        for (const f of folderParts) {
          const next = cur.items.find(
            (i): i is TemplateFolder => "folderName" in i && i.folderName === f
          );
          if (!next) {
            foundFolder = false;
            break;
          }
          cur = next;
        }
        if (foundFolder) {
          const existing = cur.items.find(
            (i): i is TemplateFile =>
              !("folderName" in i) &&
              i.filename === parsed.filename &&
              i.fileExtension === parsed.fileExtension
          );
          if (existing && existing.content === content) {
            // Content identical, do not trigger state update or DB write
            return;
          }
        }

        const { updatedTree, file } = updateFileInTree(
          templateData,
          normalized,
          content
        );
        if (!file) return;

        setTemplateData(updatedTree);
        SaveUpdatedCode(playgroundId, updatedTree).catch((err) => {
          console.error("Failed to auto-save WebContainer external changes:", err);
        });

        // Update openFiles if the file is currently open
        let activeFileUpdated = false;
        const updatedOpenFiles = openFiles.map((openF) => {
          const filePath = findFilePath(openF, updatedTree);
          if (filePath === normalized) {
            if (openF.id === activeFileId) {
              activeFileUpdated = true;
            }
            return {
              ...openF,
              content,
              originalContent: content,
              hasUnsavedChanges: false,
            };
          }
          return openF;
        });

        if (activeFileUpdated) {
          setEditorContent(content);
        }
        setOpenFiles(updatedOpenFiles);

        // Update matching Monaco models
        updateMonacoModels(normalized, content);
      } else if (entryType === "deleted") {
        const { updatedTree, removed } = removePathFromTree(
          templateData,
          normalized
        );
        if (removed) {
          setTemplateData(updatedTree);
          SaveUpdatedCode(playgroundId, updatedTree).catch(console.error);

          const updatedOpenFiles = openFiles.filter((f) => {
            const filePath = findFilePath(f, templateData);
            return filePath !== normalized;
          });
          setOpenFiles(updatedOpenFiles);
        }
      }
    } catch (err) {
      console.error(
        `Error syncing WebContainer filesystem change ${rawPath}:`,
        err
      );
    }
  }

  function onWatchEvent(event: string, filename: string | Uint8Array | undefined | null) {
    if (isClosed || !filename) return;
    let rawPath: string;
    if (typeof filename === "string") {
      rawPath = filename;
    } else if (filename instanceof Uint8Array) {
      rawPath = new TextDecoder().decode(filename);
    } else {
      return;
    }

    const normalized = normalizePath(rawPath);
    if (!normalized || isIgnoredPath(normalized)) return;

    // Debounce rapid events (e.g. during npm install)
    const existingTimer = pendingDebounces.get(normalized);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      pendingDebounces.delete(normalized);
      handleFileChange(normalized);
    }, 150);

    pendingDebounces.set(normalized, timer);
  }

  let watcher: IFSWatcher | null = null;
  try {
    watcher = instance.fs.watch("/", { recursive: true }, onWatchEvent);
  } catch (err) {
    try {
      watcher = instance.fs.watch(".", { recursive: true }, onWatchEvent);
    } catch (err2) {
      console.error("Failed to start WebContainer fs.watch:", err, err2);
    }
  }

  return () => {
    isClosed = true;
    for (const timer of pendingDebounces.values()) {
      clearTimeout(timer);
    }
    pendingDebounces.clear();

    if (watcher) {
      try {
        watcher.close();
      } catch (err) {
        console.warn("Failed to close WebContainer fs watcher:", err);
      }
    }
  };
}
