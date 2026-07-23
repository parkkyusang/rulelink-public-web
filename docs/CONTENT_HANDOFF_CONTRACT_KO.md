# RuleLink 공개 콘텐츠 생산·통합·배포 계약

이 문서는 공개 법률정보를 여러 작업에서 병렬로 만들면서도 중복 콘텐츠, 구법 근거, 깨진 연결, 합성 불일치, 미배포 상태가 누적되지 않도록 하는 저장소의 상위 작업 계약이다.

핵심 원칙은 **생산 속도보다 공개 정본의 정합성**, **개별 문구 땜질보다 재사용 가능한 구조**, **사람의 기억보다 기계가 검사하는 대기열**이다.

## 1. 다섯 역할과 소유 경계

| 작업 이름 | 책임 | 수정할 수 있는 영역 | 수정하지 않는 영역 |
|---|---|---|---|
| 사이트 - 구축·통합·배포 | 공개 정본, 통합 순서, 불변 스냅샷, 운영 배포와 실주소 검증 | 생산 대기열, 주제·개념 매니페스트, current 번들, 새 snapshot, release | 내부 사건 자료와 검증되지 않은 법률 내용을 임의 작성하는 일 |
| 사이트 - 콘텐츠 생산 | 활성 DB와 검증된 공식 근거로 한 주제의 생활질문·법리·사실분기 생산 | 배정된 주제 JSON 1개와 그 주제의 전용 시험 1개 | 대기열, manifest, current, snapshot, release, 공용 실행기 |
| 사이트 - 분류체계·개념어·품질 | 허브 범위, 중복 후보, 개념어 관계, 연결 공백, 표현 품질 감사 | 명시적으로 배정된 감사 산출물 또는 개념 주제 파일 | 새 생활주제의 무단 생산, 공개 정본과 배포 파일 |
| 사이트 - 디자인·사용성 | 반응형 화면, 탐색, 검색, 팝오버, 공식근거 이용 흐름과 시각 자산 | 화면 코드, 스타일, 정적 자산, 사용성 회귀시험 | 법리·사실분기·근거 좌표·출판 상태 |
| 사이트 - 기획·사업·정책 | 제품 원칙, 지표, 공개 범위, 수익모델과 운영 정책 | 기획 문서와 측정 기준 | 콘텐츠·화면·출판 정본의 직접 수정 |

역할 이름은 담당 범위를 뜻한다. 같은 작업이 여러 역할을 겸하지 않는다. 역할 변경이 필요하면 먼저 이 표와 생산 대기열의 소유자를 바꾼다.

저장소 역할 계약에서는 `migrate_publication`이 주제 원본·manifest·current·새 snapshot과 함께 생산 대기열 및 항목 레지스트리를 갱신할 수 있다. 다만 release 파일은 수정할 수 없다. release는 통합이 끝난 뒤 `release` 역할의 별도 병합 요청에서만 바꾼다.

## 2. 공식 생산 대기열

병렬 작업의 현재 상태 정본과 삭제 방지 이력 정본은 다음 두 파일이다.

```text
artifacts/publication/production-queue.json
artifacts/publication/production-queue-registry.json
```

대기열은 열린 콘텐츠 병합 요청(PR), 주제 파일, 정확한 머리 커밋, 변경 방식, 중복 판정, 선행 의존성, 근거 최신성, 통합 전 검사와 상태를 기록한다.

항목 레지스트리는 `queue_id`와 PR 번호, 변경 방식, 주제 식별자와 주제 파일을 순서가 있는 SHA-256 영수증 체인으로 한 번만 등록한다. 동기화 명령은 새 항목만 뒤에 추가하며 기존 등록을 수정하거나 제거하지 않는다. 검증기는 저장소 이력의 직전 레지스트리를 불변 기준으로 읽어 기존 접두부가 그대로 보존됐는지도 확인한다. 따라서 항목이 `integrated`, `superseded`, `withdrawn`으로 끝나도 대기열에서 행을 삭제하지 않고 그 상태와 완료·철회 증거를 보존한다.

레지스트리가 현재 존재하면 `git rev-list`와 `git show`로 직전 불변 이력을 읽지 못하는 상태를 이력 없음으로 취급하지 않고 검증 실패로 막는다. 예외는 레지스트리 파일이 현재 HEAD에서 처음 도입되어 이전 커밋 자체가 없는 경우뿐이다. 공개 웹 검증 작업은 레지스트리 파일 하나만 바뀐 병합 요청과 main push에도 반드시 실행된다.

허용 상태는 다음과 같다.

- `planned`: 범위만 합의됨
- `claimed`: 한 생산자가 작업을 점유함
- `in_progress`: 실제 작성·검증 중
- `pr_open`: 독립 주제 병합 요청이 열림
- `ready_for_integration`: 선행조건과 통합 전 검사를 지키면 다음 합성에 포함 가능
- `migration_required`: 이미 current에 들어간 주제를 바꾸므로 주제 원본·current·새 snapshot을 함께 이관해야 함
- `needs_rework`: 중복, 근거 계보, 유형 또는 연결 문제를 고쳐야 함
- `blocked`: 선행 주제나 외부 상태가 닫히지 않음
- `merged_pending_publication`: 주제 원본은 main에 병합됐지만 current와 새 snapshot에는 아직 포함되지 않아 주제·파일 점유를 계속 유지함
- `integrated`: 새 불변 snapshot에 포함됨
- `superseded`: 다른 이관 또는 새 병합 요청으로 대체됨
- `withdrawn`: 공개 대상에서 철회됨

콘텐츠 생산자는 대기열을 직접 수정하지 않는다. 구축·통합 담당이 배정과 상태를 기록한다. 한 생산자의 `claimed` 또는 `in_progress` 항목은 동시에 1개만 허용한다. 기존 항목이 끝나기 전에는 다음 주제를 만들지 않는다.

## 3. 생산 시작 전 중복·범위 판정

새 주제는 제목만 비교해서 만들지 않는다. 다음 축을 현재 정본과 전체 대기열에 대해 정규화하여 비교한다.

1. 사용자가 실제로 묻는 질문
2. 사용자가 지금 해야 하는 행동
3. 판단 기관과 절차
4. 발생하는 법률효과
5. 기한·시점과 시행판
6. 결과를 가르는 결정사실
7. 직접 사용하는 근거 좌표와 관련 콘텐츠

비슷한 후보가 발견되면 자동으로 같은 콘텐츠라고 단정하지 않는다. 대기열에 다음 중 하나를 한글 근거와 함께 기록한다.

- `distinct`: 질문·행동·효과가 달라 별도 유지
- `merge_required`: 한 페이지나 한 허브로 합쳐야 함
- `split_required`: 겹치는 부분을 제거하고 역할을 나눠야 함
- `supersedes` 또는 `superseded_by`: 새 작업이 기존 작업을 대체함

이 판정이 없는 중복 후보는 생산을 시작하지 않는다.

## 4. 콘텐츠 생산 단위

새 독립 주제의 변경 파일은 원칙적으로 정확히 두 개다.

```text
artifacts/publication/topics/<topic>.json
web/rulelink_public_next/scripts/<topic>-topic-handoff.test.mjs
```

주제 파일은 최소한 다음을 닫아야 한다.

- 일반인이 찾는 생활질문과 대상 상황
- 법리카드와 사실분기
- 모든 법리·분기·콘텐츠에서 참조되는 공식 근거 좌표
- 실제 존재하는 관련 콘텐츠
- 표준 콘텐츠 유형 8종
- 검토일, 재검토 기한과 현행·구법·미래 시행 경계
- 작성자 이름이나 내부 사건 정보가 없는 공개 본문

선언한 근거 좌표가 어디에서도 역참조되지 않으면 실패한다. 관련 콘텐츠가 아직 대기 중인 다른 주제에 있으면 그 병합 요청을 `depends_on_prs`에 기록하고 선행 주제보다 먼저 통합하지 않는다.

## 5. 기존 주제 개정과 새 주제 추가의 차이

새 주제가 아직 manifest에 없으면 주제 파일과 전용 시험만 먼저 main에 병합할 수 있다. 이 병합은 운영 공개를 뜻하지 않는다.

이미 current에 포함된 주제 원본을 바꾸면 topic-only 병합 요청은 합성 검사에서 실패하는 것이 정상이다. 이런 변경은 `migration_required`로 표시하고 다음을 한 이관에서 함께 바꾼다.

- 해당 주제 원본
- 주제·개념 manifest
- 합성된 current 번들
- 새 식별자의 불변 snapshot
- 생산 대기열 상태

같은 snapshot 식별자의 내용을 덮어쓰지 않는다.

기존 주제 개정의 완료는 반드시 두 커밋으로 나눈다.

1. 데이터 이관 커밋: 해당 주제 원본과 전용 시험, 주제 manifest, current, 새 불변 snapshot을 함께 바꾼다.
2. 대기열 증거 커밋: 앞 데이터 이관 커밋의 실제 SHA를 `migration_commit_sha`에 기록하고 대기열 상태와 append-only 레지스트리를 갱신한다.

검증기는 `migration_commit_sha`가 실제 Git 커밋이고 현재 HEAD의 조상인지, 해당 주제·current·manifest·지정 snapshot을 실제로 바꿨는지, release 등 이관 역할 밖 파일을 건드리지 않았는지 확인한다. 또한 `migration_commit_sha..HEAD` 구간은 대기열 증거 커밋 구간이므로 `production-queue.json`과 `production-queue-registry.json` 외 파일 변경을 허용하지 않는다. 이 구간에서 주제·current·manifest·snapshot을 다시 고치거나 다른 파일을 함께 바꾸면 데이터 이관 커밋의 증거가 더 이상 최종 출판 내용을 증명하지 못하므로 즉시 실패한다. 자기 SHA를 자기 내용에 넣는 순환 구조를 피하기 위해 데이터 이관 커밋은 대기열·레지스트리를 바꾸지 않는다. 두 커밋의 이력을 보존해야 하므로 이관 병합 요청은 squash 병합하지 않는다. CI checkout은 이 조상 커밋을 검사할 수 있도록 `fetch-depth: 0`을 유지한다.

## 6. 근거 최신성과 공식 원문

공식 주소가 HTTP 200으로 열리는 것과 현재 활성 DB의 정확한 시행판·본문 해시가 일치하는 것은 별개의 검사다.

통합 전 각 근거는 다음 중 하나로 분류한다.

- `current`: 활성 DB의 현행 좌표와 일치
- `rebind_before_integration`: 내용 오류가 확인된 것은 아니지만 저장된 snapshot 해시가 현재 DB와 달라 합성 직전 재결박 필요
- `rework_required`: 시간민감 주제이거나 전체 좌표가 재현되지 않아 생산 단계로 반려
- `external_provenance_required`: 공식 주소는 있으나 활성 DB·검증 원장으로 출처 계보를 닫아야 함
- `existing_topic_revision`: 이미 공개 중인 기존 주제의 근거 기준을 승계하는 개정

미래 시행판은 현행 안내에 섞지 않는다. 법령변화 콘텐츠는 구법·신법 좌표, 시행일과 적용례를 분리한다. 공식 원문 주소의 생존 검사는 통합 때 다시 실행한다.

## 7. 통합 순서

구축·통합 담당은 다음 순서로 처리한다.

1. 대기열 검증
2. `ready_for_integration` 항목을 `integration_order`와 `depends_on_prs`에 따라 정렬
3. 각 항목의 `integration_checks` 수행
4. 새 독립 주제 파일과 전용 시험 병합
5. 전체 주제의 식별자·관련 콘텐츠·근거 역참조·콘텐츠 유형 재감사
6. manifest에 포함할 주제 확정
7. 전체 topic 원본으로 current 재합성
8. 새 불변 snapshot 생성
9. current와 snapshot의 내용 동일성 확인
10. 6~9의 주제·manifest·current·snapshot만 데이터 이관 커밋으로 기록
11. 생산 대기열을 `integrated`, `superseded` 또는 잔여 상태로 갱신하고 `migration_commit_sha`와 item registry 영수증을 후속 커밋으로 기록
12. 통합 병합 요청의 전체 시험과 정적 빌드 확인
13. 두 커밋을 보존하는 방식으로 병합

서로 의존하는 주제를 임의 순서로 병합하지 않는다. 중복 판정이 끝나지 않은 `needs_rework` 항목과 선행 항목이 닫히지 않은 `blocked` 항목은 합성에서 제외한다.

## 8. 배포와 운영 완료 조건

통합과 배포는 별도 단계다. release 파일은 `codex/release-*` 역할에서만 수정한다. main 병합만으로 운영 반영 완료라고 보고하지 않는다.

운영 완료는 실주소에서 다음이 모두 확인된 때다.

- `publication.json`의 snapshot 식별자와 수량이 main의 release와 일치
- 새 허브와 상세 페이지가 HTTP 200
- 데스크톱·모바일에서 가로 넘침과 잘린 핵심 내용 없음
- 검색, 개념어, 관련 콘텐츠와 공식근거 이동이 정상
- 공식 원문 링크가 실제 조문으로 연결
- robots와 sitemap이 현재 공개 정책과 일치
- 비공개 내부 필드와 사건 데이터가 노출되지 않음

## 9. 자동 검증

```powershell
Set-Location web\rulelink_public_next
npm run validate:production-queue
npm run sync:production-queue-publication
npm run test:publication-topics
npm run test:publication
npm run typecheck
npm run build
npm run smoke:public-build
```

`sync:production-queue-publication`은 current 표지와 append-only item registry를 각각 원자적으로 갱신한 뒤 전체 대기열을 검사한다. `predev`와 `prebuild`도 생산 대기열을 먼저 검증한다. 등록된 항목 삭제, 레지스트리 영수증 변조, `merged_pending_publication` 주제·파일의 중복 점유, 대기열에 없는 의존 PR, 중복 topic 식별자, 역할별 동시 진행량 초과, 기존 주제의 topic-only 직접 통합, 실제 이관 커밋이 아닌 완료 증거, 공식 URL 실패 잔존, 통합 순서 역전은 실패로 처리한다.

## 10. 보고 규칙

각 작업은 장문의 진행 서술 대신 다음 사실만 상호 보고한다.

- 현재 상태와 정확한 PR·커밋
- 수정한 파일
- 콘텐츠·법리·분기·근거 수
- 선행 의존성과 중복 판정
- 활성 DB 기준 근거 최신성
- 공식 URL 실검사 결과
- 통합 또는 재작업 권고
- 다음 작업이 해도 되는 일과 하면 안 되는 일

새 콘텐츠 수보다 **운영 정본과의 일치**, **깨진 연결 0**, **근거 재현 가능**, **모바일 가로 넘침 0**, **중복 노출 0**, **대기기간 단축**을 우선 지표로 본다.
