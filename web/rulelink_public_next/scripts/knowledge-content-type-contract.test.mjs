import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const appRoot = process.cwd();
const contract = JSON.parse(await readFile(path.join(appRoot, 'src', 'lib', 'knowledge-content-types.json'), 'utf8'));
const canonical = new Set(Object.keys(contract.canonical));
const aliases = new Map(Object.entries(contract.aliases));

test('콘텐츠 유형 계약은 표준 8종·허용 별칭·안전 대체표시를 단일 JSON으로 닫는다', () => {
  assert.equal(contract.schema, 'rulelink_public_content_type_contract_v1');
  assert.equal(contract.fallback_label_ko, '법률정보');
  assert.equal(canonical.size, 8);
  for (const [type, label] of Object.entries(contract.canonical)) {
    assert.match(type, /^[a-z]+(?:_[a-z]+)*$/u);
    assert.ok(label.trim(), `${type}: 한글 표시명이 없습니다.`);
  }
  for (const [alias, target] of aliases) {
    assert.ok(canonical.has(target), `${alias}: 없는 표준 유형 ${target}`);
    assert.equal(contract.canonical[target], contract.canonical[aliases.get(alias)]);
  }
});

test('화면 라벨 함수는 단일 계약의 별칭 정규화와 안전 대체표시를 사용한다', async () => {
  const source = await readFile(path.join(appRoot, 'src', 'lib', 'content-labels.ts'), 'utf8');
  assert.match(source, /knowledge-content-types\.json/u);
  assert.match(source, /aliases\[type\]/u);
  assert.match(source, /fallback_label_ko/u);
});
