import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const componentUrl = new URL(
  '../src/components/knowledge-source-evidence.tsx',
  import.meta.url,
);

test('복수 공식 근거 카드는 모두 접힌 상태로 시작하고 fragment 대상만 연다', async () => {
  const component = await readFile(componentUrl, 'utf8');

  assert.doesNotMatch(component, /<details\s+open=/u);
  assert.doesNotMatch(component, /open=\{index === 0\}/u);
  assert.match(component, /window\.addEventListener\('hashchange', revealSourceFromFragment\)/u);
  assert.match(component, /card\.querySelector<HTMLDetailsElement>\(':scope > details'\)/u);
  assert.match(component, /disclosure\.open = true/u);
  assert.match(component, /data-source-card/u);
  assert.match(component, /tabIndex=\{-1\}/u);
});

test('문언 표시 여부를 카드 제목에서 구분하고 사용자에게 내부 구현 문구를 노출하지 않는다', async () => {
  const component = await readFile(componentUrl, 'utf8');

  assert.match(component, /sourceText \? '조문 문언 포함' : '공식 원문에서 확인'/u);
  assert.match(component, /확인한 조문은 카드 안에서 바로 읽을 수 있습니다/u);
  assert.match(component, /이 자료의 원문은 아래 공식 사이트에서 확인할 수 있습니다/u);
  assert.doesNotMatch(component, /페이지 안에 문언을 옮겨 싣지 않고/u);
  assert.doesNotMatch(component, /별도 답변 패킷|패킷 검증 상태/u);
});

test('검증 문언과 공식 원문 연결은 근거 좌표별로 정확히 하나만 표시한다', async () => {
  const component = await readFile(componentUrl, 'utf8');

  assert.match(component, /const sourceText = sourceTexts\[source\.coordinate_id\]/u);
  assert.match(component, /data-source-text-state="verified_text"/u);
  assert.match(component, /data-source-text-state="link_only"/u);
  assert.match(component, /\{sourceText \? \(/u);
  assert.match(component, /<ExternalLinkIcon \/>/u);
  assert.match(component, /rel="noopener noreferrer"/u);
  assert.match(component, /target="_blank"/u);
});
