import { fileURLToPath } from 'node:url';
export default {
  outputFileTracingRoot: fileURLToPath(new URL('.', import.meta.url)),
  output: 'export',
  images: { unoptimized: true },
  devIndicators: false,
};
