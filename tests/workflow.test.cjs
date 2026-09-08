const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const PizZip = require('pizzip');
const { DOMParser } = require('@xmldom/xmldom');
require.extensions['.ts'] = (module, filename) => {
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS } });
  module._compile(compiled.outputText, filename);
};
const { Repository } = require('../miniprogram/core/repository.ts');
const { generateRecord } = require('../miniprogram/core/generation.ts');
const { reorder, validationErrors } = require('../miniprogram/core/model.ts');

// Exercise the shipped browser bundle without Node require, Buffer, DOM, fetch or window.
const sandbox = { module: { exports: {} }, console, setTimeout, clearTimeout, Uint8Array, Uint16Array, Uint32Array, Int16Array, Int32Array, Uint8ClampedArray, Float32Array, Float64Array, ArrayBuffer, DataView };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../miniprogram/vendor/documents.js'), 'utf8'), sandbox, { timeout: 10000 });
const { buildDocuments } = sandbox.module.exports;
const cache = path.join(__dirname, '../.cache/tests');
fs.mkdirSync(cache, { recursive: true });
const png = new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures/payment.png')));
const jpeg = new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures/invoice.jpg')));

function fixtureRepo() {
  const root = fs.mkdtempSync(path.join(cache, 'workflow-'));
  const adapter = {
    mkdir: p => fs.mkdirSync(p, { recursive: true }), readText: p => fs.readFileSync(p, 'utf8'),
    writeText: (p, t) => fs.writeFileSync(p, t), copy: (a, b) => fs.copyFileSync(a, b), rename: (a, b) => fs.renameSync(a, b),
    list: p => fs.readdirSync(p), exists: p => fs.existsSync(p),
  };
  return { repo: new Repository(adapter, root), adapter, root };
}
async function sample() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  pdf.addPage([400, 300]).drawText('INVOICE - page 1', { x: 32, y: 210, size: 24, font, color: rgb(0.1, 0.3, 0.2) });
  pdf.addPage([420, 320]).drawText('INVOICE - page 2', { x: 32, y: 230, size: 24, font });
  return new Uint8Array(await pdf.save());
}
async function prepared() {
  const context = fixtureRepo();
  const { repo } = context;
  const record = repo.create();
  const first = repo.addGroup(record.id);
  const second = repo.addGroup(record.id);
  const binary = { invoice: await sample(), attach1: png, attach2: jpeg, invoice2: jpeg };
  fs.mkdirSync(repo.path(record.id, 'originals'));
  for (const [id, bytes] of Object.entries(binary)) fs.writeFileSync(repo.path(record.id, `originals/${id}`), bytes);
  repo.edit(record.id, r => {
    r.title = '迎新报销';
    r.groups[0].description = '饮料 & 文具 <原文>\n第二行，保留 {括号} 和  空格';
    r.groups[0].invoiceIds = ['invoice']; r.groups[0].attachmentIds = ['attach1', 'attach2'];
    r.groups[1].description = '打印费用'; r.groups[1].invoiceIds = ['invoice2'];
    for (const id of Object.keys(binary)) r.assets[id] = { id, kind: id === 'invoice' ? 'pdf' : 'image', originalName: `${id}.${id === 'invoice' ? 'pdf' : 'png'}`, relativePath: `originals/${id}`, size: binary[id].length };
  });
  const io = {
    read: async asset => new Uint8Array(fs.readFileSync(repo.path(record.id, asset.relativePath))), build: buildDocuments,
    mkdir: relative => fs.mkdirSync(repo.path(record.id, relative), { recursive: true }),
    write: async (relative, bytes) => fs.writeFileSync(repo.path(record.id, relative), bytes),
    verify: async (relative, bytes) => assert.deepEqual(fs.readFileSync(repo.path(record.id, relative)), Buffer.from(bytes)),
  };
  return { ...context, record, first, second, binary, io };
}

test('AC02: shipped bundle produces five PDF pages and exact descriptions/ranges in a real DOCX', async () => {
  const { repo, record, io } = await prepared();
  const output = await generateRecord(repo, record.id, io, () => {});
  const bytes = fs.readFileSync(repo.path(record.id, output.pdfPath));
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 5);
  assert.deepEqual(pdf.getPages().slice(0, 2).map(p => [p.getWidth(), p.getHeight()]), [[400, 300], [420, 320]]);
  assert.deepEqual(JSON.parse(JSON.stringify(output.ranges.map(r => [r.startPage, r.endPage]))), [[1, 4], [5, 5]]);
  const zip = new PizZip(fs.readFileSync(repo.path(record.id, output.wordPath)));
  const xml = zip.file('word/document.xml').asText();
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  assert.equal(doc.getElementsByTagName('parsererror').length, 0);
  assert.match(xml, /第 1—4 页/);
  assert.match(xml, /第 5 页/);
  assert.match(xml, /饮料 &amp; 文具 &lt;原文&gt;/);
  assert.match(xml, /第二行，保留 \{括号\} 和  空格/);
  assert.match(xml, /w:br/);
  fs.writeFileSync(path.join(cache, 'acceptance.pdf'), bytes);
  fs.writeFileSync(path.join(cache, 'acceptance.docx'), fs.readFileSync(repo.path(record.id, output.wordPath)));
});

test('AC03: reorder changes PDF page order and the matching Word page ranges', async () => {
  const { repo, record, io, second } = await prepared();
  repo.edit(record.id, r => { r.groups = reorder(r.groups, 1, 0); });
  const result = await generateRecord(repo, record.id, io, () => {});
  assert.equal(result.ranges[0].groupId, second.id);
  assert.deepEqual(JSON.parse(JSON.stringify(result.ranges.map(r => [r.startPage, r.endPage]))), [[1, 1], [2, 5]]);
  const pdf = await PDFDocument.load(fs.readFileSync(repo.path(record.id, result.pdfPath)));
  assert.equal(pdf.getPage(1).getWidth(), 400);
});

test('AC01/05/06: saving and reopening preserves originals and independent groups', async () => {
  const { repo, record, adapter, root, binary } = await prepared();
  const firstBefore = structuredClone(repo.read(record.id).groups[0]);
  repo.edit(record.id, r => { r.groups[1].description = '修改后的打印费'; });
  const reopened = new Repository(adapter, root);
  assert.deepEqual(reopened.read(record.id).groups[0], firstBefore);
  assert.equal(reopened.list().records.length, 1);
  assert.equal(reopened.read(record.id).lastExport, null);
  assert.deepEqual(fs.readFileSync(repo.path(record.id, 'originals/invoice')), Buffer.from(binary.invoice));
});

test('AC04: incomplete drafts are saved but generation reports exact missing fields', async () => {
  const { repo } = fixtureRepo();
  const r = repo.create(); repo.addGroup(r.id);
  repo.edit(r.id, record => { record.groups[0].description = '待补发票的打印费'; });
  assert.deepEqual(validationErrors(repo.read(r.id)), ['第 1 项：请补充发票。']);
  let invoked = false;
  await assert.rejects(generateRecord(repo, r.id, { build: () => { invoked = true; } }, () => {}), /请补充发票/);
  assert.equal(invoked, false);
  assert.equal(repo.read(r.id).groups.length, 1);
});

test('AC07: corrupt PDF keeps the previous successful export and identifies its group/file', async () => {
  const { repo, record, io } = await prepared();
  const good = await generateRecord(repo, record.id, io, () => {});
  fs.writeFileSync(repo.path(record.id, 'originals/invoice'), 'broken PDF');
  await assert.rejects(generateRecord(repo, record.id, io, () => {}), /第 1 项，invoice.pdf/);
  assert.deepEqual(repo.read(record.id).lastExport, JSON.parse(JSON.stringify(good)));
  assert.ok(fs.existsSync(repo.path(record.id, good.wordPath)));
});

test('AC07: failure saving the second output leaves the last pair intact and allows retry', async () => {
  const { repo, record, io } = await prepared();
  const good = await generateRecord(repo, record.id, io, () => {});
  const faulty = { ...io, write: async (relative, bytes) => { if (relative.endsWith('.docx')) throw new Error('disk full'); await io.write(relative, bytes); } };
  await assert.rejects(generateRecord(repo, record.id, faulty, () => {}), /disk full/);
  assert.equal(repo.read(record.id).lastExport.generationId, good.generationId);
  const retried = await generateRecord(repo, record.id, io, () => {});
  assert.notEqual(retried.generationId, good.generationId);
});

test('manifest rename failure preserves the last saved draft and valid backup recovery', async () => {
  const { repo, record, adapter } = await prepared();
  const before = repo.read(record.id);
  const rename = adapter.rename;
  adapter.rename = () => { throw new Error('rename failed'); };
  assert.throws(() => repo.edit(record.id, r => { r.title = 'uncommitted'; }), /rename failed/);
  assert.deepEqual(repo.read(record.id), before);
  adapter.rename = rename;
  fs.writeFileSync(repo.path(record.id, 'project.json'), 'corrupt');
  assert.deepEqual(repo.read(record.id), before);
  repo.edit(record.id, r => { r.title = 'recovered'; });
  assert.equal(repo.read(record.id).title, 'recovered');
});

test('generation uses one snapshot and refuses a stale result if editing occurs during generation', async () => {
  const { repo, record, io } = await prepared();
  const good = await generateRecord(repo, record.id, io, () => {});
  let edited = false;
  await assert.rejects(generateRecord(repo, record.id, io, () => {
    if (!edited) { edited = true; repo.edit(record.id, r => { r.groups[0].description = '新描述'; }); }
  }), /发生了修改/);
  assert.equal(repo.read(record.id).lastExport.generationId, good.generationId);
  assert.equal(repo.read(record.id).groups[0].description, '新描述');
});

test('empty report and unsafe manifest paths are rejected', () => {
  const { repo } = fixtureRepo(); const record = repo.create();
  assert.deepEqual(validationErrors(record), ['请先添加一项报销内容。']);
  assert.throws(() => repo.path(record.id, '../outside'), /路径无效/);
  assert.throws(() => repo.path(record.id, 'C:\\outside'), /路径无效/);
});

test('AC08: reopening history omits untouched records and whitespace-only empty groups', () => {
  const { repo, adapter, root } = fixtureRepo();
  repo.create();
  const record = repo.create();
  repo.addGroup(record.id);
  repo.addGroup(record.id);
  repo.edit(record.id, r => {
    r.title = ' \t\u3000';
    r.groups[0].description = '\n \t';
    r.groups[1].description = '\u3000';
  });
  const reopened = new Repository(adapter, root);
  assert.deepEqual(reopened.list(), { records: [], unreadable: 0 });
  // Reading history must not invalidate an editor's in-progress record.
  reopened.edit(record.id, r => { r.groups[1].description = '打印费'; });
  assert.deepEqual(reopened.list().records.map(r => r.id), [record.id]);
});

test('AC09: title-only, description-only, invoice-only and attachment-only drafts remain in history', () => {
  const { repo, adapter, root } = fixtureRepo();
  const ids = [];
  for (const field of ['title', 'description', 'invoiceIds', 'attachmentIds']) {
    const record = repo.create();
    ids.push(record.id);
    repo.addGroup(record.id);
    repo.edit(record.id, r => {
      if (field === 'title') r.title = '迎新报销';
      else if (field === 'description') r.groups[0].description = '饮料费用';
      else {
        const aid = field === 'invoiceIds' ? 'invoice' : 'attachment';
        fs.mkdirSync(repo.path(r.id, 'originals'));
        fs.writeFileSync(repo.path(r.id, `originals/${aid}.png`), png);
        r.assets[aid] = { id: aid, kind: 'image', originalName: `${aid}.png`, relativePath: `originals/${aid}.png`, size: png.length };
        r.groups[0][field] = [aid];
      }
    });
  }
  const reopened = new Repository(adapter, root);
  assert.deepEqual(new Set(reopened.list().records.map(r => r.id)), new Set(ids));
  for (const record of reopened.list().records) {
    for (const asset of Object.values(record.assets)) assert.deepEqual(fs.readFileSync(repo.path(record.id, asset.relativePath)), Buffer.from(png));
  }
});

test('history omission follows cleared content without changing other drafts or deleting original bytes', async () => {
  const { repo, record, adapter, root, binary } = await prepared();
  const other = repo.create();
  repo.edit(other.id, r => { r.title = '另一条草稿'; });
  repo.edit(record.id, r => { r.title = ''; r.groups = []; });
  const reopened = new Repository(adapter, root);
  assert.deepEqual(reopened.list().records.map(r => r.id), [other.id]);
  assert.deepEqual(fs.readFileSync(repo.path(record.id, 'originals/invoice')), Buffer.from(binary.invoice));
});

test('history keeps an existing exported pair even after all current draft fields are cleared', async () => {
  const { repo, record, io, adapter, root } = await prepared();
  const exported = await generateRecord(repo, record.id, io, () => {});
  repo.edit(record.id, r => { r.title = ''; r.groups = []; });
  const reopened = new Repository(adapter, root);
  assert.deepEqual(reopened.list().records.map(r => r.id), [record.id]);
  assert.equal(reopened.read(record.id).lastExport.generationId, exported.generationId);
  assert.ok(fs.existsSync(repo.path(record.id, exported.pdfPath)));
  assert.ok(fs.existsSync(repo.path(record.id, exported.wordPath)));
});

function loadTsForTest(relative, imports, globals = {}) {
  const file = path.join(__dirname, '..', relative);
  const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS } });
  const exported = {};
  vm.runInNewContext(compiled.outputText, {
    exports: exported, setTimeout, clearTimeout,
    require: name => {
      if (Object.hasOwn(imports, name)) return imports[name];
      throw new Error(`Unexpected import: ${name}`);
    }, ...globals,
  }, { filename: file });
  return exported;
}

function pageFixture(name, repo, options = {}) {
  let definition;
  const errors = [];
  const nav = { back: 0 };
  const materials = options.materials || { getImportingGroupIds: () => [], importMaterials: async () => {} };
  const ui = { showError: error => errors.push(error), openFile: () => {}, navigate: () => {} };
  loadTsForTest(`miniprogram/pages/${name}/index.ts`, {
    '../../core/model': require('../miniprogram/core/model.ts'),
    '../../services/storage': { repository: repo },
    '../../services/ui': ui,
    '../../services/materials': materials,
    '../../services/generate': { generate: async () => { throw new Error('Unexpected generation in page navigation test'); } },
  }, {
    Page: value => { definition = value; },
    wx: { navigateBack: () => { nav.back += 1; }, pageScrollTo: () => {}, ...options.wx },
  });
  const page = { ...definition, data: structuredClone(definition.data), setData(patch) { Object.assign(this.data, patch); } };
  return { page, errors, nav };
}

test('AC10: reopening the report removes empty groups, preserves order, and still generates matching documents', async () => {
  const { repo, record, io, adapter, root } = await prepared();
  const original = repo.read(record.id).groups;
  repo.addGroup(record.id);
  const empty = repo.addGroup(record.id);
  repo.edit(record.id, r => {
    r.groups.find(g => g.id === empty.id).description = ' \n\t\u3000';
    r.groups = reorder(r.groups, 3, 0);
  });
  assert.equal(repo.list().records[0].groups.length, 2);
  const reopened = new Repository(adapter, root);
  const report = pageFixture('report', reopened);
  report.page.onLoad({ id: record.id });
  report.page.onShow();
  assert.equal(report.errors.length, 0);
  assert.equal(report.page.data.rows.length, 2);
  assert.deepEqual(reopened.read(record.id).groups, original);
  const revision = reopened.read(record.id).revision;
  report.page.onShow();
  assert.equal(reopened.read(record.id).revision, revision);
  const output = await generateRecord(reopened, record.id, io, () => {});
  assert.equal(output.pageCount, 5);
  assert.equal(output.ranges.map(r => `${r.startPage}-${r.endPage}`).join(','), '1-4,5-5');
});

test('AC11: cleanup preserves description-only, invoice-only and attachment-only groups', async () => {
  const { repo, record } = await prepared();
  repo.edit(record.id, r => {
    r.groups[0].description = '';
    r.groups[0].attachmentIds = [];
    r.groups[1].description = '';
    r.groups[1].attachmentIds = r.groups[1].invoiceIds;
    r.groups[1].invoiceIds = [];
  });
  const description = repo.addGroup(record.id);
  repo.edit(record.id, r => { r.groups.find(g => g.id === description.id).description = '未填完的文具费'; });
  const before = repo.read(record.id).groups;
  repo.addGroup(record.id);
  const cleaned = repo.removeEmptyGroups(record.id);
  assert.deepEqual(cleaned.groups, before);
  assert.deepEqual(validationErrors(cleaned), ['第 1 项：请补充项目描述。', '第 2 项：请补充项目描述、发票。', '第 3 项：请补充发票。']);
});

test('AC10: native back and Save and Return both remove the blank group when its parent becomes visible', async () => {
  for (const useButton of [false, true]) {
    const { repo, record } = await prepared();
    const before = repo.read(record.id).groups;
    const blank = repo.addGroup(record.id);
    const editor = pageFixture('group', repo);
    const report = pageFixture('report', repo);
    editor.page.onLoad({ record: record.id, group: blank.id });
    editor.page.input({ detail: { value: ' \n\u3000' } });
    if (useButton) { editor.page.back(); assert.equal(editor.nav.back, 1); }
    editor.page.onUnload();
    report.page.onLoad({ id: record.id }); report.page.onShow();
    assert.equal(editor.errors.length + report.errors.length, 0);
    assert.deepEqual(repo.read(record.id).groups, before);
    assert.equal(report.page.data.rows.length, 2);
  }
});

test('AC10: repeated Save and Add Next reuses a blank editor and preserves a filled description before advancing', () => {
  const { repo } = fixtureRepo(); const record = repo.create();
  const blank = repo.addGroup(record.id);
  const editor = pageFixture('group', repo);
  editor.page.onLoad({ record: record.id, group: blank.id });
  editor.page.input({ detail: { value: ' \t\n' } });
  editor.page.next(); editor.page.next(); editor.page.next();
  assert.equal(repo.read(record.id).groups.length, 1);
  assert.equal(editor.page.data.groupId, blank.id);
  assert.equal(editor.page.data.description, '');
  editor.page.input({ detail: { value: ' 文具费用\n保留原文 ' } });
  editor.page.next();
  assert.equal(repo.read(record.id).groups.length, 2);
  assert.equal(repo.read(record.id).groups[0].description, ' 文具费用\n保留原文 ');
  editor.page.onUnload();
  repo.removeEmptyGroups(record.id);
  assert.equal(repo.read(record.id).groups.length, 1);
  assert.equal(editor.errors.length, 0);
});

test('AC11: hiding for file selection keeps the group; an in-flight import is protected until cancellation completes', async () => {
  const { repo } = fixtureRepo(); const record = repo.create(); const blank = repo.addGroup(record.id);
  let menu;
  const materials = loadTsForTest('miniprogram/services/materials.ts', {
    '../core/model': require('../miniprogram/core/model.ts'),
    './storage': { repository: repo, ensureDirectory: () => {} },
  }, { wx: { showActionSheet: value => { menu = value; } } });
  const editor = pageFixture('group', repo, { materials });
  const report = pageFixture('report', repo, { materials });
  editor.page.onLoad({ record: record.id, group: blank.id });
  const importing = editor.page.add({ currentTarget: { dataset: { role: 'invoiceIds' } } });
  editor.page.onHide();
  assert.equal(repo.read(record.id).groups[0].id, blank.id);
  assert.equal(materials.getImportingGroupIds(record.id).length, 1);
  editor.page.onUnload();
  report.page.onLoad({ id: record.id }); report.page.onShow();
  assert.equal(repo.read(record.id).groups.length, 1);
  menu.fail({ errMsg: 'showActionSheet:fail cancel' });
  await importing;
  assert.equal(materials.getImportingGroupIds(record.id).length, 0);
  report.page.onShow();
  assert.equal(repo.read(record.id).groups.length, 0);
  assert.equal(editor.errors.length + report.errors.length, 0);
});

test('failed empty-group cleanup preserves the prior manifest, source files and exported pair', async () => {
  const { repo, record, io, adapter, binary } = await prepared();
  const output = await generateRecord(repo, record.id, io, () => {});
  repo.addGroup(record.id);
  const before = repo.read(record.id);
  adapter.rename = () => { throw new Error('cleanup write failed'); };
  assert.throws(() => repo.removeEmptyGroups(record.id), /cleanup write failed/);
  assert.deepEqual(repo.read(record.id), before);
  assert.deepEqual(fs.readFileSync(repo.path(record.id, 'originals/invoice')), Buffer.from(binary.invoice));
  assert.ok(fs.existsSync(repo.path(record.id, output.wordPath)));
});
