# RuleLink 일반인용 공개 웹

이 앱은 승인된 `rulelink_published_bundle_v1` 출판본만 읽는 공개 정보관이다. RuleLink 원본 DB, Codex 실행기, 사용자 사건 폴더에는 접근하지 않는다. 콘텐츠 생산 세션과 공개 웹 세션의 병렬 작업 경계는 [콘텐츠 인계 계약](docs/CONTENT_HANDOFF_CONTRACT_KO.md)을 따르고, 주제별 원본 통합은 [공개 지식 합성 표준](docs/PUBLIC_KNOWLEDGE_COMPOSITION_STANDARD_KO.md), 화면 확장과 시각 전담 작업은 [공개 웹 시각 체계](docs/PUBLIC_VISUAL_SYSTEM_KO.md), 운영 배포는 [Vercel 배포 정책](docs/VERCEL_DEPLOYMENT_POLICY_KO.md)을 따른다.

출판본에 `rulelink_public_catalog_v1` 카탈로그를 포함하면 별도 화면 수정 없이 다음 기능이 생긴다.

- 상황·제목·긴급 신호·확인 질문 통합 검색
- 분야별 필터와 `/ko/topics/[slug]` 정적 주제 화면
- 같은 주제에 속한 관련 문제카드 자동 연결
- 카드 상세 목차와 공식 근거 표시
- 승인된 법리·사실분기·공식 근거를 잇는 지식 보관함
- 시행 예정·최근 시행 법령을 구분하는 법령 변화 라이브러리
- 문제카드·연결 지식·법령 변화를 한 번에 찾는 통합 탐색

따라서 콘텐츠 확장은 화면 파일을 복제하는 방식이 아니라 `검증된 카드 추가 -> 카탈로그에 카드 식별자 배치 -> 새 불변 출판본 생성` 순서로 한다.

## 로컬 실행

`dev`와 `build` 직전에 저장소 루트의 `artifacts/publication/current/bundle.json`을 앱 내부의 생성 파일로 복사한다. 이렇게 하면 공개 런타임은 저장소나 원본 DB에 접근하지 않는다. 다른 출판본을 시험하려면 절대경로를 지정한다.

```powershell
$env:RULELINK_PUBLICATION_BUNDLE='C:\absolute\path\bundle.json'
npm run dev
```

기본 주소는 `http://127.0.0.1:8800`이다.

## 내부 편집 미리보기

승인 전 콘텐츠의 화면 완성도는 공개 서버와 분리된 로컬 전용 주소에서 확인한다.

```powershell
.\start_editorial_preview.ps1
```

주소는 `http://127.0.0.1:8801`이다. 별도 `.next-editorial-preview` 빌드 결과를
사용하며 Cloudflare 터널을 만들지 않는다. 현재 미리보기 묶음에는 검증된 문제카드와
구법·신법 스냅샷을 가진 법령변화 브리핑이 함께 들어갈 수 있다. 브리핑 상세 화면은
주체·요건·예외·행위·법률효과·시행시점의 구법·신법 차이를 나란히 표시한다.

```powershell
.\stop_editorial_preview.ps1
```

`8801`의 미리보기 상태는 공개 승인 상태가 아니다. `8800` 공개 서버는 계속
`approved` 불변 출판 묶음만 읽는다.

내부 편집 운영 대기열은 다음 주소에서 확인한다.

```text
http://127.0.0.1:8801/editorial
```

후보 발견부터 공개까지의 현재 단계, 다음 한 가지 작업, 조문별 개정일로 검증한
공식 공포번호 기준 개정 묶음을 표시한다. 현행 XML 최상위 공포번호와 해당 조문의
개정일이 다르면 공포번호와 시행일을 확정하지 않고 `연혁 복구` 작업으로 되돌린다.
조문별 변경 이력으로 실제 시행일이 확인됐지만 Source Timeline 좌표가 아직 다르면
`원장 재구축`으로 표시하며, 해당 초안은 상세 미리보기에서도 제외한다. 교정
스냅샷과 사건이 추가되면 같은 공포 단위의 여러 조문을 하나의 이용자 중심 초안으로
연결할 수 있고, 묶음 전체가 연결된 뒤에는 다음 작업이 내용 검토·승인으로 바뀐다.
공개 서버의 `/editorial`은 404이며 공개 내비게이션에도 나타나지 않는다.
미리보기만 안전하게 재기동하려면 다음 명령을 사용한다.

```powershell
.\restart_rulelink_editorial_preview.ps1
```

## GitHub·Vercel 운영 배포

현재 운영 주소는 다음과 같다.

```text
https://rulelink.lolphysical.xyz
```

운영 배포의 기준 저장소는 `parkkyusang/rulelink-public-web`이다. 기능과 운영 번들은 별도 브랜치와 PR로 올리고, 공개 번들 차단 규칙 테스트·타입 검사·정적 빌드·공개 경로 스모크 검사가 모두 통과한 경우에만 `main`에 병합한다. 일반 `codex/*` 브랜치는 GitHub Actions만 실행하고 Vercel 미리보기를 만들지 않는다. `main`은 검증된 변경을 계속 축적하되 매 커밋을 운영 빌드하지 않는다. 실제 운영 공개는 `web/rulelink_public_next/deploy/release.json`을 갱신한 명시적 공개 PR에서만 실행하고, 이때 누적된 최신 `main` 전체와 실제 공개 스냅샷을 확인한다. 브라우저 시각 검수가 필요한 변경만 `preview-*` 브랜치를 사용한다.

운영본의 승인 출판 스냅샷과 공개 콘텐츠 수는 다음 기계 판독 주소에서 확인한다.

```text
https://rulelink.lolphysical.xyz/publication.json
```

이 응답은 공개 스냅샷 식별자, 유형별 콘텐츠 수, 최근 검토시각과 가장 가까운 재검토 기한만 제공한다. 원본 DB 좌표, 승인 파일 해시, 내부 경로는 제공하지 않는다.

## 로컬 터널 대체 경로

다음 도구는 Vercel 운영 배포와 별개인 로컬 확인 경로다. `start_rulelink_public_all.cmd`를 실행하면 Windows의 8800번 포트에 공개 웹 서버를 열고 RuleLink 전용 Cloudflare 터널 `rulelink-public`을 시작한다. 터널 실행기는 WSL에서 Windows로 연결되는 현재 게이트웨이를 자동 반영한다. `stop_rulelink_public.cmd`는 공개 웹 서버와 RuleLink 전용 터널만 종료한다.

터널을 유지한 채 새 빌드만 공개 서버에 반영하려면 다음 명령을 사용한다.

```powershell
.\restart_rulelink_public_server.ps1
```

이 명령은 Windows 프로세스 트리 공급자를 사용하지 않는다. 기록된 실행 시각과
8800번 Node 수신 프로세스를 대조한 뒤 공개 서버만 교체하므로 메모리 압박 때도
내부 미리보기와 터널을 건드리지 않는다.

공개 서버가 실행 중일 때 일반 `npm run build`는 운영 `.next`의 CSS 파일을 먼저
바꿔 현재 화면을 깨뜨릴 수 있으므로 안전검사가 이를 거부한다. 서버를 유지한 채
빌드 가능 여부만 확인하려면 격리 출력 폴더를 쓰는 다음 명령을 사용한다.

```powershell
npm run build:check
```

실제 반영은 반드시 `restart_rulelink_public_server.ps1`로 수행한다. 이 명령은
격리 빌드, 실제 빌드, 서버 기동, 공개 HTML과 CSS의 200 응답 확인을 순서대로
수행한다.

컨시어지는 별도 웹사이트다. 컨시어지의 서버, 터널, 인증, 실행·종료 과정에 RuleLink를 연결하지 않는다. 두 사이트가 공유하는 것은 정식 도메인 확정 전 사용하는 상위 도메인 `lolphysical.xyz`뿐이다.

임시 주소는 기본적으로 검색엔진 색인을 막는다. 정식 공개 시에만 다음 값을 설정하고 다시 빌드한다.

```powershell
$env:NEXT_PUBLIC_RULELINK_INDEXING='true'
```

색인을 켜면 승인된 출판 묶음에서 `/sitemap.xml`이 생성되고 `robots.txt`에 그
주소가 표시된다. `/feed.xml`은 법령변화와 연결 지식의 통합 구독 피드이며, 각 상세 화면은
정규 주소와 공식 근거 기반 구조화 데이터를 제공한다. 미승인 콘텐츠는 이 공개
발견 경로에 들어가지 않는다.

공식 근거 링크는 저장된 수집용 주소를 그대로 출력하지 않는다. 국가법령정보센터의
DRF API 주소와 현재 404인 `lawView.do` 주소를 법령명ㆍ조문번호 기반의 공개
`/법령/...` 주소로 바꾼다. 변환된 주소는 실제 브라우저 응답까지 확인한다.

## 브랜드 설정

```powershell
$env:NEXT_PUBLIC_RULELINK_SITE_NAME='RuleLink'
$env:NEXT_PUBLIC_RULELINK_SITE_URL='https://rulelink.lolphysical.xyz'
```

공개 화면에는 운영법인, 작성자, 감수자 이름을 표시하지 않는다. 브랜드명은 데이터 계약과 분리돼 있으므로 바꿔도 출판본이나 URL 식별자가 깨지지 않는다. 검수·승인 이력은 공개 화면과 분리된 내부 기록에만 남긴다.

## 컨시어지와의 경계

컨시어지에서 공개 콘텐츠 후보를 만들 수 있지만 공개 웹이 컨시어지 API를 호출하지는 않는다. 후보는 사건 본문을 포함하지 않는 내부 편집 작업표로만 전달되고, 비식별화·일반화·활성 DB 재근거화·법률검토·운영 승인을 거쳐야 출판본에 들어온다. 컨시어지 연계는 보조적인 수요 발견 경로이며, 새 법령을 먼저 포착하는 주된 경로는 별도 법령변화 후보 대기열이다.

## 현재 공개본

<!-- RULELINK_PUBLICATION_STATUS:START -->
저장소의 승인 출판본 `kr-knowledge-core-20260721-014`에는 다음 공개 데이터가 연결되어 있다.

- 최근 시행·시행 예정 법령변화: 1건
- 연결 주장: 3개
- 생활법률 지식: 75개
- 주제 허브: 8개
- 법리카드: 62개
- 사실분기: 47개
- 공식 근거 좌표: 82개

현재 주제는 행정처분과 행정심판, 소비자·온라인 계약, 가족·상속, 주택임대차와 보증금 반환, 노동·임금, 금전거래·보증, 공유자전거ㆍ공유이동 사고, 일상사고와 손해배상이다. 각 글은 공식 근거, 핵심 법리, 결론을 가르는 사실, 행동 순서, 보관할 자료와 컨시어지 진입점을 함께 제공한다.

실제 운영 도메인의 반영 상태는 [`publication.json`](https://rulelink.lolphysical.xyz/publication.json)에서 확인한다.
<!-- RULELINK_PUBLICATION_STATUS:END -->

## 최신성 일일 점검

GitHub의 `공개본 최신성 일일 점검`은 매일 한국시간 오전 7시 17분 현재 승인본을
다시 읽는다. 재검토 기한, 시행 예정ㆍ최근 시행 상태, 불변 스냅샷 일치 여부를
검증하고 콘텐츠ㆍ법리카드ㆍ사실분기ㆍ공식 근거 수와 만료 순서를 실행 요약에
남긴다. 재검토 기한이 지났거나 법령 시행 상태가 현재 날짜와 맞지 않으면 점검이
실패한다. 공개 조회계층은 매시간 다시 생성되며 재검토 기한이 도래한 문제카드ㆍ법령변화ㆍ지식 콘텐츠와 내용이 비게 된 허브ㆍ주제를 자동 제외한다. 따라서 알림 대응이 늦어도 기한 경과 콘텐츠를 계속 안내하지 않는다. 수동 점검은 GitHub Actions의 `workflow_dispatch` 또는 다음 명령으로
실행한다.

```powershell
Set-Location web\rulelink_public_next
npm run report:freshness
npm run validate-publication
```

임시 하위 도메인에서는 정식 공개 결정 전까지 검색엔진 전체 색인을 차단한다.
