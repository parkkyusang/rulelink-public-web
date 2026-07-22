import assert from 'node:assert/strict';
import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const appRoot = process.cwd();
const repoRoot = path.resolve(appRoot, '..', '..');
const contract = JSON.parse(await readFile(path.join(appRoot, 'src', 'lib', 'knowledge-content-types.json'), 'utf8'));
const canonical = new Set(Object.keys(contract.canonical));
const aliases = new Map(Object.entries(contract.aliases));

test('공개 콘텐츠 유형 계약은 표준 유형·과거 별칭·안전 대체표시를 닫는다', () => {
  assert.equal(contract.fallback_label_ko, '법률정보');
  assert.equal(canonical.size, 8);
  for (const [type, label] of Object.entries(contract.canonical)) {
    assert.match(type, /^[a-z]+(?:_[a-z]+)*$/u);
    assert.ok(label.trim(), `${type}: 한글 표시명이 없습니다.`);
  }
  for (const [alias, target] of aliases) {
    assert.ok(canonical.has(target), `${alias}: 없는 표준 유형 ${target}`);
  }
});

test('현재 정본과 모든 주제 원본에 화면에서 해석할 수 없는 콘텐츠 유형이 없다', async () => {
  const topicDirectory = path.join(repoRoot, 'artifacts', 'publication', 'topics');
  const files = (await readdir(topicDirectory)).filter(file => file.endsWith('.json') && file !== 'manifest.json');
  const unknown = [];
  for (const file of files) {
    const topic = JSON.parse(await readFile(path.join(topicDirectory, file), 'utf8'));
    for (const entry of topic.content_entries ?? []) {
      if (!canonical.has(entry.content_type) && !aliases.has(entry.content_type)) {
        unknown.push(`${file}:${entry.content_id}:${String(entry.content_type)}`);
      }
    }
  }
  const current = JSON.parse(await readFile(path.join(repoRoot, 'artifacts', 'publication', 'current', 'bundle.json'), 'utf8'));
  for (const entry of current.knowledge.content_entries) {
    if (!canonical.has(entry.content_type) && !aliases.has(entry.content_type)) {
      unknown.push(`current:${entry.content_id}:${String(entry.content_type)}`);
    }
  }
  assert.deepEqual(unknown, []);
});
