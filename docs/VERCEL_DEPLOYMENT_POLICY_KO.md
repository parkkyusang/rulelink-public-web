# Vercel 배포 정책

## 결론

룰링크 공개 웹은 **GitHub 축적과 운영 공개를 분리**한다.

- `codex/*`: GitHub Actions에서만 검증하며 Vercel 배포를 만들지 않는다.
- 일반 `main` 병합: 검증된 코드와 콘텐츠를 축적하지만 운영 빌드는 생략한다.
- `deploy/release.json`을 바꾼 `main` 병합: 누적된 최신 `main` 전체를 운영 배포한다.
- `preview-*`: 실제 브라우저 시각 검수를 위해 명시적으로 Vercel 미리보기를 만든다.

즉, 콘텐츠 세션과 웹 세션은 독립 PR을 계속 병합할 수 있지만 Vercel은 매 커밋을 빌드하지 않는다. 여러 검증 완료 변경을 하나의 공개 표식 커밋으로 묶어 운영에 반영한다.

## 왜 이 구조가 필요한가

Vercel 취미(Hobby) 플랜은 시간당 빌드와 하루 배포 횟수에 제한이 있다. 병렬 콘텐츠 생산 중 각 브랜치와 `main`을 모두 빌드하면 코드 오류가 없어도 `build-rate-limit`로 운영 배포가 거절될 수 있다.

- 공식 한도: <https://vercel.com/docs/limits>
- 빌드 생략 계약: <https://vercel.com/docs/project-configuration/vercel-json#ignorecommand>
- Ignored Build Step 설명: <https://vercel.com/kb/guide/how-do-i-use-the-ignored-build-step-field-on-vercel>

GitHub Actions는 모든 PR에서 공개 번들 안전성, 주제 원본 합성, 불변 스냅샷, 타입 검사, 정적 빌드, 런타임 스모크를 수행한다. 따라서 저장소 품질 검증과 운영 배포를 같은 빈도로 실행할 필요가 없다.

## 저장소 계약

### 1. 배포 대상 브랜치

`vercel.json`의 `git.deploymentEnabled`는 다음만 허용한다.

- `"**": false`: 모든 브랜치를 기본 차단한다.
- `"main": true`: 프로덕션 후보 커밋만 Vercel 진입을 허용한다.
- `"preview-*": true`: 명시적 시각 검수 브랜치만 허용한다.

`**`는 슬래시가 포함된 `codex/update-name` 같은 브랜치까지 차단한다.

### 2. 명시적 운영 공개

`vercel.json`의 `ignoreCommand`는 `scripts/should-build-vercel-release.mjs`를 실행한다.

- `main`에서 `deploy/release.json`이 바뀌지 않았으면 종료코드 0으로 빌드를 생략한다.
- `main`에서 공개 표식이 바뀌었으면 종료코드 1로 빌드를 실행한다.
- `preview-*`는 공개 표식과 무관하게 빌드한다.
- Git 비교가 실패하면 공개 누락보다 빌드를 선택하는 안전 우선 방식으로 동작한다.

### 3. 공개 표식

`deploy/release.json`은 다음을 기록한다.

- `release_id`: 운영 공개 묶음 식별자
- `snapshot_id`: 함께 배포할 승인 출판 스냅샷
- `requested_at`: 공개 요청 시각
- `summary_ko`: 이번 공개에 포함된 사용자 변화

이 파일은 승인 콘텐츠 원본이 아니라 배포 트리거다. 콘텐츠와 기능 PR을 모두 `main`에 합친 뒤 별도 공개 PR에서만 변경한다.

## 운영 순서

1. 콘텐츠·검색·화면 변경을 각각 `codex/*` 브랜치와 PR로 만든다.
2. GitHub Actions 전체 성공을 확인하고 `main`에 병합한다.
3. 공개할 변경을 모은 뒤 `deploy/release.json`의 식별자·스냅샷·요약을 갱신하는 공개 PR을 만든다.
4. 공개 PR의 GitHub Actions가 성공하면 `main`에 병합한다.
5. Vercel 프로덕션 배포 성공을 확인한다.
6. `운영 배포 실제 주소 점검`이 `publication.json`, 공개 스냅샷, 전체 공개 경로를 검증한다.

`운영 배포 실제 주소 점검`은 공개 표식이 바뀐 `main` 커밋에서만 자동 실행한다. 일반 축적 커밋에서 이전 운영본과 최신 `main`이 다르다는 이유로 불필요하게 실패하지 않는다.

## 시각 검수

색상·간격·반응형 배치처럼 실제 브라우저 확인이 필요한 변경은 `preview-*` 브랜치에서 수행한다. 검수가 끝난 코드는 일반 PR로 `main`에 합치며, 운영 반영은 다음 명시적 공개 표식에 포함한다.

## 실패 시 확인 순서

1. 최신 `main`이 일반 축적 커밋인지 공개 표식 커밋인지 확인한다.
2. 일반 축적 커밋이면 Vercel 빌드 생략이 정상이다.
3. 공개 표식 커밋이면 Vercel 상태가 `pending`, `success`, `failure` 중 무엇인지 확인한다.
4. `build-rate-limit`이면 직전 한 시간 또는 하루의 배포 빈도와 불필요한 미리보기를 확인한다.
5. 배포 성공 뒤 `publication.json`의 `snapshot_id`와 공개 표식을 대조한다.
6. 운영 실주소 검사에서 모든 콘텐츠·허브·주제·공식 근거 경로의 HTTP 성공을 확인한다.

## 변경 차단

이 정책을 바꿀 때에는 `scripts/vercel-deployment-policy.test.mjs`를 함께 갱신한다. 다음 회귀는 허용하지 않는다.

- 기본 차단을 `**`에서 `*`로 축소
- 일반 `codex/*` 미리보기 재허용
- 공개 표식 없이 모든 `main` 커밋을 다시 빌드
- 일반 축적 커밋마다 운영 실주소 점검 실행
