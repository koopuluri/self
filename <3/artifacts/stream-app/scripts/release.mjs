import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promoteRelease, stageRelease } from '../service/releases.mjs';

const product = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [action, argument] = process.argv.slice(2);
if (action === 'promote') {
  console.log('Stream will use ' + await promoteRelease(product) + ' on its next launch.');
} else if (action === 'stage') {
  console.log('Staged Preview ' + await stageRelease(product, argument && path.resolve(product, argument)));
} else {
  throw new Error('Use stage or promote.');
}
