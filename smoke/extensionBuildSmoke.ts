import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

export interface ExtensionBuildManifest {
  manifest_version: number;
  permissions?: string[];
  optional_host_permissions?: string[];
  icons?: Record<string, string>;
  action?: {
    default_icon?: Record<string, string>;
    default_popup?: string;
  };
  side_panel?: {
    default_path?: string;
  };
  background?: {
    service_worker?: string;
  };
  content_scripts?: Array<{
    js?: string[];
  }>;
}

export interface ExtensionBuildSmokeResult {
  manifest: ExtensionBuildManifest;
  requiredFiles: string[];
}

const REQUIRED_FILES = [
  'manifest.json',
  'background.js',
  'popup.html',
  'dashboard.html',
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

  return {
    manifest,
    requiredFiles: [...REQUIRED_FILES],
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
