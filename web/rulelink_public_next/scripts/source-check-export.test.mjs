import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {sha256,sha256Canonical,validateSourceTextLibrary} from './publication-derived-core.mjs';

test('실제 원문 수출 명령은 정규화 조문만 연결하고 판본 불일치·손상 원문을 공개하지 않는다',async t=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'rulelink-source-check-export-'));
  try {
    const databasePath=path.join(directory,'law.sqlite');
    const bundlePath=path.join(directory,'bundle.json');
    const outputPath=path.join(directory,'library.json');
    const db=new DatabaseSync(databasePath);
    db.exec(`CREATE TABLE statute_laws(law_key TEXT PRIMARY KEY,law_name_ko TEXT);
      CREATE TABLE statute_articles(id TEXT PRIMARY KEY,law_key TEXT,article_no TEXT,
      article_no_normalized TEXT,article_title TEXT,article_text TEXT,effective_date TEXT,
      retrieved_at TEXT,source_hash TEXT,source_status TEXT);`);
    db.prepare('INSERT INTO statute_laws VALUES (?,?)').run('fixture-law','검증 법률');
    const rows=[
      {id:'current-17',number:'17',text:'제17조(정상) 확인한 공식 조문입니다.'},
      {id:'current-18',number:'18',text:'제18조(현재판) 기존 출판 판본과 다른 문언입니다.'},
      {id:'current-19',number:'19',text:'제19조(손상) <img src="공식이미지.gif"> 손상문자 \ufffd'},
    ];
    const insert=db.prepare('INSERT INTO statute_articles VALUES (?,?,?,?,?,?,?,?,?,?)');
    for(const row of rows) insert.run(row.id,'fixture-law',row.number,row.number.padStart(4,'0'),'검증 조문',row.text,'20261002','2026-10-20T00:00:00Z','sha256:'+sha256(row.text),'official_source_verified');
    db.close();
    const bundle={snapshot_id:'fixture-source-check-export',built_at:'2026-10-25T00:00:00Z',knowledge:{sources:rows.map(row=>({
      coordinate_id:'coord.fixture.'+row.number,
      // 정상 행도 원본 ID와 다르게 해 법명+정규화 조문 fallback을 실제 실행한다.
      source_id:'old-public-id-'+row.number,law_name_ko:'검증 법률',article_no:'제'+row.number+'조',
      source_snapshot_id:'snapshot:'+(row.number==='18'?'f'.repeat(64):sha256(row.text)),
      last_verified_at:'2026-10-20T00:00:00Z',
    }))}};
    await writeFile(bundlePath,JSON.stringify(bundle),'utf8');
    const script=fileURLToPath(new URL('./build-publication-source-text-library.mjs',import.meta.url));
    const result=spawnSync(process.execPath,['--disable-warning=ExperimentalWarning',script,'--law-db',databasePath,'--bundle',bundlePath,'--output',outputPath,'--write'],{encoding:'utf8',timeout:30000});
    assert.equal(result.status,0,result.stderr||result.stdout);
    const library=JSON.parse(await readFile(outputPath,'utf8'));
    assert.deepEqual(validateSourceTextLibrary(library,bundle),[]);
    assert.equal(library.publication_bundle_sha256,sha256Canonical(bundle));
    await t.test('DB 숫자 조문17과 공개 제17조는 정규화 fallback으로 같은 문언을 표시한다',()=>{
      assert.equal(library.bindings.length,1);
      assert.equal(library.bindings[0].coordinate_id,'coord.fixture.17');
      assert.equal(library.bindings[0].match_method,'law_name_and_article');
      assert.equal(library.texts.length,1);
      assert.equal(library.texts[0].article_no,'제17조');
      assert.equal(library.texts[0].official_text_ko,rows[0].text);
    });
    await t.test('공개 스냅샷 해시 불일치 행은 현재 DB에 있어도 문언을 수출하지 않는다',()=>{
      assert.deepEqual(library.unresolved.find(x=>x.coordinate_id==='coord.fixture.18'),{coordinate_id:'coord.fixture.18',reason:'ledger_version_mismatch'});
      assert.ok(!library.texts.some(x=>x.source_id==='current-18'));
    });
    await t.test('HTML·손상문언은 올바른 원문해시가 있어도 정리 필요 상태로 제외한다',()=>{
      assert.deepEqual(library.unresolved.find(x=>x.coordinate_id==='coord.fixture.19'),{coordinate_id:'coord.fixture.19',reason:'official_text_requires_cleanup'});
      assert.ok(!library.texts.some(x=>x.source_id==='current-19'));
      assert.deepEqual(library.coverage,{publication_statute_coordinates:3,bound_statute_coordinates:1,unique_verified_texts:1,unresolved_statute_coordinates:2});
    });
  } finally {
    // 이 시험이 mkdtemp로 직접 만든 전용 디렉터리만 회수한다.
    await rm(directory,{recursive:true,force:true});
  }
});
