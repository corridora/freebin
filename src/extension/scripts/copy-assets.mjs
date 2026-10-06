import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(extensionRoot, 'out');

await mkdir(outputDirectory, { recursive: true });
await copyFile(
  resolve(extensionRoot, 'src', 'inspectorWebview.html'),
  resolve(outputDirectory, 'inspectorWebview.html')
);
