import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('민법766조3항은 성년 피해자의 장기시효가 아니라 미성년 성적침해의 시효 진행정지다', async () => {
  const topic=JSON.parse(await readFile(new URL('../../../artifacts/publication/topics/crime-victim-response.json',import.meta.url),'utf8'));
  const entry=topic.content_entries.find(x=>x.content_id==='content.civil-damages-after-crime');
  assert.match(entry.caution_ko,/미성년자.*성적 침해.*성년이 될 때까지 진행되지/);
  assert.doesNotMatch(entry.caution_ko,/성년 대상|별도 장기시효/);
  assert.match(entry.caution_ko,/부칙/);
});
