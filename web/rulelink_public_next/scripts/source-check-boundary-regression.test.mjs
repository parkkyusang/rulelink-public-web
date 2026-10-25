import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('공개 확인 목록과 사용자가 직접 내보내는 확인 메모의 경계를 구분한다', () => {
  const topic = JSON.parse(readFileSync(new URL('../../../artifacts/publication/topics/legal-service-boundaries.json', import.meta.url), 'utf8'));
  const entries = topic.content_entries;
  const entry = entries.find((item) => item.content_id === 'content.free-service-and-ad-revenue');
  assert.ok(entry, '무료 서비스·광고 수익 안내가 존재해야 한다');
  const text = entry.body_sections[1].paragraphs_ko[0];
  assert.match(text, /기기에만 저장/);
  assert.match(text, /사용자가 미리 확인한 뒤 직접 복사·저장/);
  assert.match(text, /외부 작업공간으로 자동 전송하지 않습니다/);
  assert.doesNotMatch(text, /사건요청 초안으로 복사되거나/);
});
