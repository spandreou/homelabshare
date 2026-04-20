type DisplayNameInput = {
  originalName?: string | null;
  storagePath?: string | null;
};

function formatFallbackFileName(rawName: string): string {
  const trimmed = rawName.trim();

  if (!trimmed) {
    return "Untitled";
  }

  let baseName = trimmed;
  let extension = "";
  const lastDotIndex = trimmed.lastIndexOf(".");

  if (lastDotIndex > 0 && lastDotIndex < trimmed.length - 1) {
    baseName = trimmed.slice(0, lastDotIndex);
    extension = trimmed.slice(lastDotIndex);
  }

  const cleanedBase = baseName
    .trim()
    .replace(/^[_.-]+|[_.-]+$/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const safeBase = cleanedBase || "Untitled";
  const capitalizedBase = safeBase.charAt(0).toUpperCase() + safeBase.slice(1);

  return `${capitalizedBase}${extension}`;
}

function extractBaseNameFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  return last.trim();
}

function stripStoragePrefix(name: string): string {
  // Matches: 1713551455123-550e8400-e29b-41d4-a716-446655440000-filename.pdf
  return name.replace(/^\d{10,}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "");
}

function shouldUseFallbackDisplay(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) {
    return true;
  }

  const dotIndex = trimmed.lastIndexOf(".");
  const base = dotIndex > 0 ? trimmed.slice(0, dotIndex) : trimmed;

  if (!base || /^[_\-.]+$/.test(base)) {
    return true;
  }
  if (/^[_\-.]/.test(base) || /[_\-.]$/.test(base)) {
    return true;
  }
  if (!/\s/.test(base) && /_{2,}/.test(base)) {
    return true;
  }

  return false;
}

export function resolveDisplayFileName({ originalName, storagePath }: DisplayNameInput): string {
  const trimmedOriginal = String(originalName ?? "").trim();
  if (trimmedOriginal) {
    return shouldUseFallbackDisplay(trimmedOriginal)
      ? formatFallbackFileName(trimmedOriginal)
      : trimmedOriginal;
  }

  const storageBase = stripStoragePrefix(extractBaseNameFromPath(String(storagePath ?? "")));
  if (storageBase) {
    return formatFallbackFileName(storageBase);
  }

  return "Untitled";
}

// Backward-compatible alias for existing call sites.
export const formatDisplayFileName = formatFallbackFileName;
