import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const topicRoot = path.join(repoRoot, 'artifacts', 'publication', 'topics');

test('공개 사이트는 사건정보를 전송하지 않고 변호사 설명 게이트만 연결한다', async () => {
  const [page, workspace, gate, method, types, composer, validator, boundary] = await Promise.all([
    readFile(path.join(appRoot, 'app/ko/knowledge/[slug]/page.tsx'), 'utf8'),
    readFile(path.join(appRoot, 'src/components/knowledge-action-workspace.tsx'), 'utf8'),
    readFile(path.join(appRoot, 'app/ko/lawyer-workspace/page.tsx'), 'utf8'),
    readFile(path.join(appRoot, 'app/ko/method/page.tsx'), 'utf8'),
    readFile(path.join(appRoot, 'src/types/publication.ts'), 'utf8'),
    readFile(path.join(appRoot, 'scripts/compose-publication-knowledge.mjs'), 'utf8'),
    readFile(path.join(appRoot, 'scripts/validate-publication-bundle.mjs'), 'utf8'),
    readFile(path.join(repoRoot, 'docs/PUBLIC_INFORMATION_AND_ATTORNEY_WORKSPACE_BOUNDARY_KO.md'), 'utf8'),
  ]);
  assert.match(page, /lawyer_workspace_entry/);
  assert.match(page, /왜 변호사만 사용할 수 있나요/);
  assert.doesNotMatch(page + workspace, /buildConcierge|navigator\.clipboard|execCommand\('copy'\)/);
  assert.doesNotMatch(workspace, /\bfetch\s*\(/);
  assert.match(workspace, /window\.localStorage/);
  assert.match(gate, /자기선언 화면이 아닙니다/);
  assert.match(gate, /자격과 소속 확인/);
  assert.match(method, /구체적인 결론·승소 가능성·대응전략/);
  assert.match(types, /href: '\/ko\/lawyer-workspace'/);
  assert.match(composer + validator, /금지된 concierge_entry/);
  assert.match(boundary, /계약·보수·책임/);
});

test('공개 출판 데이터는 예전 컨시어지 필드와 작업공간 직링크를 포함하지 않는다', async () => {
  const topicNames = (await readdir(topicRoot)).filter(name => name.endsWith('.json') && name !== 'manifest.json');
  const texts = await Promise.all([
    readFile(path.join(repoRoot, 'artifacts/publication/current/bundle.json'), 'utf8'),
    ...topicNames.map(name => readFile(path.join(topicRoot, name), 'utf8')),
  ]);
  for (const text of texts) {
    assert.doesNotMatch(text, /"concierge_entry"\s*:/);
    assert.doesNotMatch(text, /"href"\s*:\s*"https:\/\/liale-review\.lolphysical\.xyz"/);
  }
  const current = JSON.parse(texts[0]);
  const linked = current.knowledge.content_entries.filter(entry => entry.lawyer_workspace_entry);
  assert.ok(linked.length > 0);
  assert.ok(linked.every(entry => (
    entry.lawyer_workspace_entry.href === '/ko/lawyer-workspace'
    && entry.lawyer_workspace_entry.audience === 'verified_attorney'
  )));
});

test('상세 법리카드는 같은 법리 문장과 결과를 이중 출력하지 않는다', async () => {
  const page = await readFile(path.join(appRoot, 'app/ko/knowledge/[slug]/page.tsx'), 'utf8');
  assert.match(page, /sameDisplayText\(rule\.proposition_ko, rule\.norm\.legal_effect_ko\)/);
  assert.match(page, /!propositionRepeatsEffect/);
});


test('공식 근거 이동은 데스크톱에서 화면을 점프하지 않는다', async () => {
  const [page, jump] = await Promise.all([
    readFile(path.join(appRoot, 'app/ko/knowledge/[slug]/page.tsx'), 'utf8'),
    readFile(path.join(appRoot, 'src/components/official-source-jump.tsx'), 'utf8'),
  ]);
  assert.match(page, /OfficialSourceJump targetId="sources"/);
  assert.doesNotMatch(page, /href="#sources"/);
  assert.match(jump, /matchMedia\('\(max-width: 800px\)'\)/);
  assert.match(jump, /scrollIntoView/);
  assert.match(jump, /classList\.add\('sourceAttention'\)/);
});
