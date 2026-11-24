import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stageRelease } from '../service/releases.mjs';

test('a complete build selects Stream directly and a failed build keeps the previous release', async t => {
  const product = await fs.mkdtemp(path.join(os.tmpdir(), 'stream-release-'));
  t.after(() => fs.rm(product, { recursive: true, force: true }));
  for (const dir of ['build/export', 'electron', 'service', 'node_modules']) {
    await fs.mkdir(path.join(product, dir), { recursive: true });
  }
  await fs.writeFile(path.join(product, 'package.json'), '{}');
  await fs.writeFile(path.join(product, 'build/export/index.html'), 'first build');
  const version = await stageRelease(product);
  const selection = async () => JSON.parse(await fs.readFile(path.join(product, 'build/stable.json')));
  assert.deepEqual(await selection(), { version });

  await fs.writeFile(path.join(product, 'build/export/index.html'), 'second build');
  await fs.unlink(path.join(product, 'package.json'));
  await assert.rejects(stageRelease(product));
  assert.deepEqual(await selection(), { version });
  assert.equal(await fs.readFile(path.join(product, 'build/releases', version, 'out/index.html'), 'utf8'), 'first build');
});
