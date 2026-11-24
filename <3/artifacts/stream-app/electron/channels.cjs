const fs = require('node:fs');
const path = require('node:path');

module.exports = function launch(channel) {
  const product = path.resolve(__dirname, '..');
  const preview = channel === 'preview';
  const root = preview ? path.join(product, '.runtime/preview-self') : process.env.PI_SELF_ROOT || path.resolve(product, '../../..');
  if (preview && !fs.existsSync(path.join(root, '<3/stream/metadata.json'))) {
    throw new Error('Initialize the Preview workspace with npm run preview:setup.');
  }
  let { version } = JSON.parse(fs.readFileSync(path.join(product, 'build', channel + '.json'), 'utf8'));
  if (!/^[a-f0-9-]{36}$/.test(version)) throw new Error('Invalid release pointer');
  process.env.PI_SELF_ROOT = root;
  process.env.PI_STREAM_CHANNEL = channel;
  process.env.PI_STREAM_SOURCE = product;
  delete process.env.PI_STREAM_URL;
  delete process.env.PI_STREAM_OUT;
  require(path.join(product, 'build/releases', version, 'electron/runtime.cjs'));
};
