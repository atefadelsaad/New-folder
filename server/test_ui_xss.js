'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'it-warehouse_1.html'), 'utf8');
const line = html.split(/\r?\n/).find((entry) => entry.trimStart().startsWith('const e='));
assert(line, 'escape helper e() should be present');

// Evaluate only the helper expression from the page: "const e=s=>EXPR;".
const expression = line.trim().replace(/^const e=/, '').replace(/;$/, '');
const helper = new Function('s', 'return (' + expression + ')(s);');

assert.strictEqual(helper("<b>x</b> العربية"), '&lt;b&gt;x&lt;/b&gt; العربية');
assert.strictEqual(helper("a'b"), 'a&#39;b');
assert.strictEqual(helper('a\\b'), 'a&#92;b');
assert.strictEqual(helper('&"<>'), '&amp;&quot;&lt;&gt;');

// QA scenario I2: a branch manager saved with this payload must stay inert text.
const payload = "',x:globalThis.__qaXss=1,y:'";
const rendered = helper(payload);
assert(!rendered.includes("'"), 'single quotes must not survive escaping');
assert.strictEqual(rendered, '&#39;,x:globalThis.__qaXss=1,y:&#39;');
assert.strictEqual(helper('C:\\temp\\file'), 'C:&#92;temp&#92;file');

// The branch edit action must not embed server data in an inline JS string anymore.
assert(!html.includes("onclick=\"branchEditState={id:"), 'branch edit must not build an inline onclick handler');
assert(html.includes('data-branch-edit="${b.id}"'), 'branch edit button should use a data attribute');
assert(html.includes("closest('[data-branch-edit]')"), 'delegated branch-edit handler should exist');
assert(!html.includes("onclick=\"openInspectionPhoto('${e(photo.id)}')\""), 'photo clicks should use data attributes');
assert(html.includes("closest('[data-photo-id]')"), 'delegated photo handler should exist');

console.log('UI escaping tests passed (quotes, backslash, HTML, no data in inline onclick)');
