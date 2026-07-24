import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const SECTION_PATTERN = /^## 현재 공개본[\s\S]*?(?=^## 최신성 일일 점검)/m;
const START_MARKER = '<!-- RULELINK_PUBLICATION_STATUS:START -->';
const END_MARKER = '<!-- RULELINK_PUBLICATION_STATUS:END -->';

export function publicationStatusCounts(bundle) {
  return {
    changeBriefs: bundle.change_briefs?.length ?? 0,
    assertions: bundle.assertions?.length ?? 0,
    knowledgeEntries: bundle.knowledge?.content_entries?.length ?? 0,
    knowledgeHubs: bundle.knowledge?.topic_hubs?.length ?? 0,
    ruleCards: bundle.knowledge?.rule_cards?.length ?? 0,
    scenarioBranches: bundle.knowledge?.scenario_branches?.length ?? 0,
    sources: bundle.knowledge?.sources?.length ?? 0,
  };
}

export function renderPublicationStatusSection(bundle) {
  const counts = publicationStatusCounts(bundle);
  const hubTitles = (bundle.knowledge?.topic_hubs ?? []).map(hub => hub.title_ko).join(', ');
  return `## 현재 공개본

${START_MARKER}
저장소의 승인 출판본 \`${bundle.snapshot_id}\`에는 다음 공개 데이터가 연결되어 있다.

- 최근 시행·시행 예정 법령변화: ${counts.changeBriefs}건
- 연결 주장: ${counts.assertions}개
- 생활법률 지식: ${counts.knowledgeEntries}개
- 주제 허브: ${counts.knowledgeHubs}개
- 법리카드: ${counts.ruleCards}개
- 사실분기: ${counts.scenarioBranches}개
- 공식 근거 좌표: ${counts.sources}개

현재 주제는 ${hubTitles || '아직 없음'}이다. 각 글은 공식 근거, 핵심 법리, 결론을 가르는 사실, 행동 순서와 보관할 자료를 제공한다. 사건별 분석이 필요한 글은 공개 사건전송 기능 대신 변호사 전용 작업공간의 이용 이유와 자격 확인 절차를 연결한다.

실제 운영 도메인의 반영 상태는 [\`publication.json\`](https://rulelink.lolphysical.xyz/publication.json)에서 확인한다.
${END_MARKER}

`;
}

export function replacePublicationStatusSection(readme, bundle) {
  const lineEnding = publicationReadmeLineEnding(readme);
  assert(SECTION_PATTERN.test(readme), 'README에서 현재 공개본 구역을 찾을 수 없습니다.');
  const rendered = renderPublicationStatusSection(bundle).replace(/\n/gu, lineEnding);
  return readme.replace(SECTION_PATTERN, rendered);
}

export function validatePublicationStatusSection(readme, bundle) {
  const lineEnding = publicationReadmeLineEnding(readme);
  const match = readme.match(SECTION_PATTERN);
  assert(match, 'README에서 현재 공개본 구역을 찾을 수 없습니다.');
  const actual = lineEnding === '\r\n' ? match[0].replace(/\r\n/gu, '\n') : match[0];
  const expected = renderPublicationStatusSection(bundle);
  assert(actual === expected, 'README의 현재 공개본 정보가 승인 번들과 다릅니다. 동기화 명령을 실행하세요.');
  assert(match[0].includes(START_MARKER) && match[0].includes(END_MARKER), 'README 자동생성 표식이 없습니다.');
}

function publicationReadmeLineEnding(readme) {
  const withoutCrlf = readme.replace(/\r\n/gu, '');
  const hasCrlf = readme.includes('\r\n');
  const hasLf = withoutCrlf.includes('\n');
  const hasBareCr = withoutCrlf.includes('\r');
  assert(!hasBareCr, 'README의 단독 CR 줄바꿈은 지원하지 않습니다.');
  assert(!(hasCrlf && hasLf), 'README에 LF와 CRLF 줄바꿈이 섞여 있습니다.');
  return hasCrlf ? '\r\n' : '\n';
}

export async function main() {
  const appRoot = process.cwd();
  const readmePath = path.resolve(appRoot, '..', '..', 'README.md');
  const bundlePath = path.resolve(appRoot, '..', '..', 'artifacts', 'publication', 'current', 'bundle.json');
  const [readme, bundleText] = await Promise.all([
    readFile(readmePath, 'utf8'),
    readFile(bundlePath, 'utf8'),
  ]);
  const bundle = JSON.parse(bundleText);

  if (process.argv.includes('--check')) {
    validatePublicationStatusSection(readme, bundle);
    process.stdout.write(`README 공개본 정보 일치: ${bundle.snapshot_id}\n`);
    return;
  }
  if (process.argv.includes('--write')) {
    const next = replacePublicationStatusSection(readme, bundle);
    if (next !== readme) await writeFile(readmePath, next, 'utf8');
    process.stdout.write(`README 공개본 정보 동기화: ${bundle.snapshot_id}\n`);
    return;
  }
  throw new Error('--check 또는 --write를 지정해야 합니다.');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
