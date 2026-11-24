const fs = require('node:fs');
const path = require('node:path');

const product = path.resolve(__dirname, '..');
const { version } = JSON.parse(fs.readFileSync(path.join(product, 'build/stable.json'), 'utf8'));
if (!/^[a-f0-9-]{36}$/.test(version)) throw new Error('Invalid release pointer');
process.env.PI_SELF_ROOT = process.env.PI_SELF_ROOT || path.resolve(product, '../../..');
process.env.PI_STREAM_SOURCE = product;
delete process.env.PI_STREAM_URL;
delete process.env.PI_STREAM_OUT;
require(path.join(product, 'build/releases', version, 'electron/runtime.cjs'));
