import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageRelease } from '../service/releases.mjs';

const product = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
console.log('Stream will use ' + await stageRelease(product) + ' on its next launch.');
