import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const port = Number(process.env.RULELINK_JOURNEY_TEST_PORT ?? 18948);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(port), '-H', '127.0.0.1'], {
  env: {...process.env, RULELINK_PUBLIC_BUILD_CHECK: 'true'}, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', chunk => {logs += chunk;});
server.stderr.on('data', chunk => {logs += chunk;});
let browser;
try {
  for (let attempt = 0; ; attempt++) {
    try {if ((await fetch(origin)).ok) break;} catch {}
    if (attempt > 180 || server.exitCode !== null) throw new Error(`서버 시작 실패: ${logs}`);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  browser = await chromium.launch({headless: true});
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({viewport: {width, height: 900}, permissions: ['clipboard-read', 'clipboard-write']});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${origin}/ko/hubs/housing-lease-deposit`);
    await page.waitForLoadState('networkidle');
    const interactionRequests = [];
    page.on('request', request => interactionRequests.push(request.url()));
    const guide = page.locator('[data-problem-journey]');
    await guide.getByLabel('보증금을 못 받았는데 이사해야 해요', {exact: true}).check();
    const questions = guide.locator('fieldset').filter({has: page.locator('legend')}).filter({hasText: '확인할 자료·시점:'});
    assert.equal(await questions.count(), 3);
    const action = guide.locator('li').filter({has: page.getByText('관할 법원에 임차권등기명령을 신청합니다.', {exact: true})});
    await action.locator('input').isDisabled().then(value => assert.equal(value, true));
    await questions.nth(0).getByLabel('예', {exact: true}).check();
    await questions.nth(1).getByLabel('모르겠음', {exact: true}).check();
    assert.equal(await action.locator('input').isDisabled(), true);
    await questions.nth(1).getByLabel('예', {exact: true}).check();
    assert.equal(await action.locator('input').isDisabled(), false);
    await action.locator('input').check();
    await questions.nth(1).getByLabel('아니오', {exact: true}).check();
    assert.equal(await action.count(), 0);
    await questions.nth(1).getByLabel('예', {exact: true}).check();
    assert.equal(await action.locator('input').isChecked(), false);
    const sources = guide.locator('details').filter({has: page.locator('blockquote')});
    assert.ok(await sources.count() > 0, '보증금 안내에 실제 문언이 하나 이상 있어야 합니다.');
    assert.equal(await guide.locator('details[open]').count(), 0);
    const registrationSource = sources.filter({has: page.locator('blockquote').filter({hasText: '임차권등기'})}).first();
    await registrationSource.locator('summary').click();
    assert.ok((await registrationSource.locator('blockquote').innerText()).includes('임차권등기'));
    await guide.getByRole('button', {name: '가져갈 요약 미리보기'}).click();
    assert.match(await guide.getByLabel('복사할 내용').inputValue(), /확인하지 못함/);
    await guide.getByRole('button', {name: '이 내용을 복사', exact: true}).click();
    assert.match(await page.evaluate(() => navigator.clipboard.readText()), /보증금 문제/);
    const downloadEvent = page.waitForEvent('download');
    await guide.getByRole('button', {name: '텍스트로 저장'}).click();
    const downloaded = await downloadEvent;
    assert.equal(downloaded.suggestedFilename(), '법률정보-확인메모.txt');
    assert.equal(await readFile(await downloaded.path(), 'utf8'), await guide.getByLabel('복사할 내용').inputValue());
    assert.equal(await page.evaluate(() => localStorage.length), 0);
    assert.equal(new URL(page.url()).search, '');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const axe = await new AxeBuilder({page}).include('[data-problem-journey]').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    assert.deepEqual(axe.violations.map(v => ({id: v.id, impact: v.impact})), []);
    await guide.getByLabel('집이 경매에 넘어갔어요', {exact: true}).check();
    assert.equal(await guide.getByRole('textbox').count(), 0);
    assert.equal(await guide.locator('input[type=radio]:checked').count(), 1);
    await guide.getByLabel('등기를 먼저 지워야 돈을 준대요', {exact: true}).check();
    assert.equal(await guide.locator('blockquote').count(), 0); // 판례 원문 미수록을 조문처럼 꾸미지 않음
    await guide.locator('details').filter({hasText: '주요 내용과 공식 원문 확인'}).first().locator('summary').click();
    assert.ok(await guide.getByText('아래는 원문 인용이 아니라 이 안내의 설명입니다.', {exact: true}).count());
    await guide.getByLabel('임차권등기 신청을 준비하고 싶어요', {exact: true}).check();
    assert.equal(await guide.locator('input[type=radio]:checked').count(), 1);
    await guide.getByRole('button', {name: '선택·확인 표시 모두 지우기'}).click();
    assert.equal(await guide.locator('input:checked').count(), 0);
    assert.deepEqual(errors, []);
    assert.deepEqual(interactionRequests, [], '사실 선택·복사·저장은 네트워크 요청을 만들면 안 됩니다.');
    if (width === 390) {
      await guide.getByLabel('보증금을 못 받았는데 이사해야 해요', {exact: true}).check();
      await guide.evaluate(element => element.scrollIntoView({block: 'start'}));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({path: '.next-build-check/deposit-journey-mobile.png'});
      await page.locator('#journey-plan').evaluate(element => element.scrollIntoView({block: 'start'}));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({path: '.next-build-check/deposit-journey-plan-mobile.png'});
    }
    await context.close();
    console.log(`${width}px: 사실분기·조건행동·변경/초기화·문언·요약/복사/저장·개인정보·접근성 통과`);
  }
  const context = await browser.newContext({javaScriptEnabled: false});
  const page = await context.newPage();
  await page.goto(`${origin}/ko/hubs/housing-lease-deposit`);
  assert.ok(await page.locator('a[href="/ko/knowledge/move-before-deposit-refund"]').count());
  await page.goto(`${origin}/ko/knowledge/move-before-deposit-refund`);
  assert.ok(await page.getByRole('link', {name: '상황을 고르고 다음 행동 정리하기 →'}).count());
  if (process.env.RULELINK_PUBLIC_LAWYER_WORKSPACE_URL) {
    await page.goto(`${origin}/ko/lawyer-workspace`);
    assert.equal(await page.locator(`a[href="${process.env.RULELINK_PUBLIC_LAWYER_WORKSPACE_URL}"]`).count(), 1);
  }
  await context.close();
  console.log('자바스크립트 없는 전체 안내·검색 상세 진입 통과');
} finally {
  await browser?.close();
  server.kill();
}
