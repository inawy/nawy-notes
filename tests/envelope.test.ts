// تشغيل: npm test  (Node 22.18+ يشغّل TypeScript مباشرة)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION, buildEnvelope, normalizeNote, parseEnvelope, ImportError } from '../src/data/envelope.ts';

const base = { title: '', body: '', items: [], color: 'default', pinned: false, status: 'active', createdAt: 1, updatedAt: 2, trashedAt: null };
const drawing = { width: 800, height: 600, strokes: [{ points: [[1, 1, 0.5]], color: 'ink', size: 5, pen: false }] };

test('ترحيل: رسم قديم يصبح مرفق رسم', () => {
  const n = normalizeNote({ ...base, id: 'a', type: 'draw', drawing, media: null });
  assert.equal(n.type, 'text');
  assert.equal(n.attachments.length, 1);
  assert.equal(n.attachments[0].kind, 'draw');
  assert.ok(!('drawing' in n) && !('media' in n));
});

test('ترحيل: صوت قديم يحتفظ بالـ Blob', () => {
  const blob = new Blob(['x'], { type: 'audio/webm' });
  const n = normalizeNote({ ...base, id: 'b', type: 'audio', media: blob, drawing: null });
  assert.equal(n.attachments[0].kind, 'audio');
  assert.equal(n.attachments[0].blob, blob);
});

test('ترحيل: صورة قديمة بلا وسائط لا تنتج مرفقاً', () => {
  const n = normalizeNote({ ...base, id: 'c', type: 'image', media: null, drawing: null });
  assert.equal(n.attachments.length, 0);
  assert.equal(n.type, 'text');
});

test('ترحيل: قائمة قديمة تبقى قائمة، والتحويل مرتين يعطي نفس النتيجة', () => {
  const once = normalizeNote({ ...base, id: 'd', type: 'list', items: [{ id: '1', text: 'a', done: false }] });
  assert.equal(once.type, 'list');
  assert.equal(JSON.stringify(normalizeNote(once)), JSON.stringify(once));
  const legacy = normalizeNote({ ...base, id: 'e', type: 'draw', drawing, media: null });
  assert.equal(JSON.stringify(normalizeNote(legacy)), JSON.stringify(legacy));
});

test('مغلف التصدير: شكل ناوي الموحّد', () => {
  const e = buildEnvelope([], new Date('2026-10-01T18:00:00.000Z'));
  assert.equal(e.app, 'nawy');
  assert.equal(e.product, 'note');
  assert.equal(e.schemaVersion, SCHEMA_VERSION);
  assert.equal(e.exportedAt, '2026-10-01T18:00:00.000Z');
  assert.deepEqual(e.data, { notes: [] });
});

test('تصدير ثم استيراد: ذهاب وعودة بلا فقد', () => {
  const notes = [
    { ...base, id: 'n1', type: 'text', body: 'مرحبا', attachments: [{ id: 'q', kind: 'audio', blob: 'data:audio/webm;base64,AAAA', drawing: null }] },
    { ...base, id: 'n2', type: 'list', items: [{ id: 'i', text: 'x', done: true }], attachments: [{ id: 'r', kind: 'draw', blob: null, drawing }] },
  ];
  const out = parseEnvelope(JSON.stringify(buildEnvelope(notes as never)));
  assert.equal(out.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(out.notes, notes);
});

test('استيراد: الصيغتان القديمتان (nawy-note إصدار 1 و2) مقبولتان', () => {
  const v1 = parseEnvelope(JSON.stringify({ app: 'nawy-note', version: 1, notes: [{ ...base, id: 'x', type: 'text' }] }));
  assert.equal(v1.notes.length, 1);
  const v2 = parseEnvelope(JSON.stringify({ app: 'nawy-note', version: 2, notes: [{ ...base, id: 'y', type: 'text', attachments: [] }] }));
  assert.equal(v2.schemaVersion, 2);
});

test('استيراد: يرفض إصداراً أحدث برسالة واضحة', () => {
  const file = JSON.stringify({ app: 'nawy', product: 'note', schemaVersion: SCHEMA_VERSION + 1, exportedAt: 'x', data: { notes: [] } });
  assert.throws(() => parseEnvelope(file), (e: unknown) => e instanceof ImportError && /أحدث/.test((e as Error).message));
  const legacy = JSON.stringify({ app: 'nawy-note', version: 99, notes: [] });
  assert.throws(() => parseEnvelope(legacy), ImportError);
});

test('استيراد: يرفض JSON تالفاً وملفاً من تطبيق آخر وملفاً بلا ملاحظات', () => {
  assert.throws(() => parseEnvelope('{oops'), /JSON/);
  assert.throws(() => parseEnvelope('{"app":"other"}'), ImportError);
  assert.throws(() => parseEnvelope('null'), ImportError);
  assert.throws(() => parseEnvelope('{"app":"nawy","schemaVersion":2,"data":{"tasks":[]}}'), /لا يحتوي/);
  assert.throws(() => parseEnvelope('{"app":"nawy","schemaVersion":"2","data":{"notes":[]}}'), /رقم إصدار/);
});

test('استيراد: يتجاهل العناصر التالفة ويُبقي الصالحة', () => {
  const file = JSON.stringify({ app: 'nawy', schemaVersion: 2, data: { notes: [null, 5, { id: 1 }, { id: 'ok', updatedAt: 3 }, { id: 'no-date' }] } });
  assert.deepEqual(parseEnvelope(file).notes.map((n) => n.id), ['ok']);
});
