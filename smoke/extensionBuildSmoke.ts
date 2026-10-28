import { access, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface ExtensionBuildManifest {
  manifest_version: number;
  permissions?: string[];
  host_permissions?: string[];
  mime_types_handler?: Record<string, {
    handler_url?: string;
    can_embed?: boolean;
  }>;
  icons?: Record<string, string>;
  action?: {
    default_icon?: Record<string, string>;
    default_popup?: string;
  };
  side_panel?: {
    default_path?: string;
  };
  content_security_policy?: {
    extension_pages?: string;
  };
  background?: {
    service_worker?: string;
  };
  content_scripts?: Array<{
    js?: string[];
    matches?: string[];
  }>;
  web_accessible_resources?: Array<{
    resources?: string[];
    matches?: string[];
    use_dynamic_url?: boolean;
  }>;
}

export interface ExtensionBuildSmokeResult {
  manifest: ExtensionBuildManifest;
  requiredFiles: string[];
  wasmFiles: string[];
}

const REQUIRED_FILES = [
  'LICENSE',
  'LICENSES/PolyForm-Strict-1.0.0.txt',
  'CONTRIBUTING.md',
  'manifest.json',
  'background.js',
  'popup.html',
  'dashboard.html',
  'pdf-reader.html',
  'sidepanel.html',
  'content-scripts/content.js',
  'logo.svg',
  'icon/16.png',
  'icon/24.png',
  'icon/32.png',
  'icon/48.png',
  'icon/96.png',
  'icon/128.png',
] as const;

export async function validateChromeMv3Build(outputDir: string): Promise<ExtensionBuildSmokeResult> {
  const manifest = await readManifest(outputDir);

  for (const file of REQUIRED_FILES) {
    await assertFileExists(path.join(outputDir, file));
  }

  const wasmFiles = await findFilesWithExtension(outputDir, '.wasm');
  if (wasmFiles.length === 0) {
    throw new Error(`Chrome MV3 build does not contain a bundled WASM asset: ${outputDir}`);
  }

  return {
    manifest,
    requiredFiles: [...REQUIRED_FILES],
    wasmFiles,
  };
}

async function readManifest(outputDir: string): Promise<ExtensionBuildManifest> {
  const manifestPath = path.join(outputDir, 'manifest.json');
  const rawManifest = await readFile(manifestPath, 'utf8');

  return JSON.parse(rawManifest) as ExtensionBuildManifest;
}

async function assertFileExists(filePath: string): Promise<void> {
  await access(filePath);
}

async function findFilesWithExtension(
  rootDir: string,
  extension: string,
  currentDir = rootDir,
): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const matches = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      return findFilesWithExtension(rootDir, extension, entryPath);
    }
    if (!entry.isFile() || path.extname(entry.name) !== extension) return [];
    return [path.relative(rootDir, entryPath)];
  }));

  return matches.flat().sort();
}
