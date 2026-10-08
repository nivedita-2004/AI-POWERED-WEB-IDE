import { TemplateFile, TemplateFolder } from "./path-to-json";

export function findFilePath(
  file: TemplateFile,
  folder: TemplateFolder,
  pathSoFar: string[] = []
): string | null {
  if (!file || !folder || !Array.isArray(folder.items)) return null;
  for (const item of folder.items) {
    if ("folderName" in item) {
      const res = findFilePath(file, item, [...pathSoFar, item.folderName]);
      if (res) return res;
    } else {
      if (
        item.filename === file.filename &&
        (item.fileExtension || "") === (file.fileExtension || "")
      ) {
        return [
          ...pathSoFar,
          item.filename + (item.fileExtension ? "." + item.fileExtension : ""),
        ].join("/");
      }
    }
  }
  return null;
}

/**
 * Generates a unique file ID based on file location in folder structure
 * @param file The template file
 * @param rootFolder The root template folder containing all files
 * @returns A unique file identifier including full path
 */
export const generateFileId = (file: TemplateFile, rootFolder: TemplateFolder): string => {
  // Find the file's path in the folder structure
  const path = findFilePath(file, rootFolder)?.replace(/^\/+/, '') || '';
  if (path) return path;
  
  // Handle empty/undefined file extension
  const extension = file.fileExtension?.trim();
  const extensionSuffix = extension ? `.${extension}` : '';

  return `${file.filename}${extensionSuffix}`;
}