import assert from 'node:assert/strict';
import test from 'node:test';
import { listPublicTemplates, getPublicTemplateDetail } from '../tiana-api.js';

test('market pages and source prompts use stable template IDs without legacy-name fallback or signed URL disclosure', async t => {
  const originalFetch = globalThis.fetch;
  const originalOrigin = process.env.TIANA_API_ORIGIN;
  process.env.TIANA_API_ORIGIN = 'https://catalog.example.test';
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalOrigin === undefined) delete process.env.TIANA_API_ORIGIN;
    else process.env.TIANA_API_ORIGIN = originalOrigin;
  });
  const calls = [];
  let wrongVersion = false;
  const item = { template_id: 'tpl-test', display_name: 'Example', description: 'Example template',
    current_version: { version: '7', installable: true, has_source: true },
    permissions: { can_download_source: true }, category_id: '1', tags: [],
    counters: { share_install_count: '2', market_install_count: '9007199254740993', market_copy_count: '12' } };
  globalThis.fetch = async raw => {
    const url = new URL(raw);
    calls.push(url);
    if (url.pathname.endsWith('/categories')) return Response.json({ items: [{ id: '1', name: 'Tools' }] });
    assert.ok(url.pathname.startsWith('/api/v1/template-catalog'));
    assert.equal(url.searchParams.get('channel'), 'market');
    if (url.pathname.endsWith('/source')) {
      assert.equal(url.searchParams.get('version'), '7');
      return Response.json({ template_id: 'tpl-test', version: wrongVersion ? '8' : '7',
        prompt: 'Customize this template.', url: 'https://download.example.test/file?signature=private-fixture' });
    }
    if (url.pathname.endsWith('/tpl-test')) return Response.json(item);
    assert.equal(url.searchParams.get('limit'), '18');
    return Response.json({ items: [item], next_cursor: 'next-page' });
  };
  const page = await listPublicTemplates({ q: 'Example', after: 'previous-page' });
  assert.equal(page.error, null);
  assert.equal(page.items[0].name, 'tpl-test');
  assert.equal(page.items[0].counters.install_count, '9007199254740995');
  assert.equal(page.nextCursor, 'next-page');
  assert.equal(calls[0].searchParams.get('after'), 'previous-page');
  const detail = await getPublicTemplateDetail('tpl-test');
  assert.equal(detail.error, null);
  assert.match(detail.item.prompt, /templates\/tpl-test\?channel=market/);
  assert.doesNotMatch(JSON.stringify(detail), /private-fixture|download\.example/);
  wrongVersion = true;
  assert.equal((await getPublicTemplateDetail('tpl-test')).item, null);
  assert.equal(calls.some(url => url.pathname.includes('aliases')), false);
});
