import { fileURLToPath } from 'node:url';
export default {
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
  output: 'export',
  distDir: 'build/export',
  images: { unoptimized: true },
  devIndicators: false,
};
