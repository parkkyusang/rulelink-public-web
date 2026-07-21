# RuleLink 콘텐츠 세션 → 공개 웹 인계 계약

이 문서는 콘텐츠 생산 세션과 공개 웹 개발 세션이 같은 파일을 동시에 수정하지 않고, 승인되지 않은 법률정보를 공개하지 않기 위한 저장소 경계다.

## 1. 역할 경계

| 역할 | 수정하는 영역 | 수정하지 않는 영역 |
|---|---|---|
| 콘텐츠 생산 세션 | 내부 저장소의 출처 좌표, 시점별 법령 스냅샷, 법리카드, 사실분기, 콘텐츠 초안과 편집 미리보기 | 이 공개 저장소의 화면 코드와 운영 출판본 |
| 법률 검토·승인 | 내부 저장소의 검토 기록과 콘텐츠 본문 정확 해시 승인 기록 | 공개 화면 코드 |
| 출판기 | 승인 기록과 현재 파일 해시를 대조하여 불변 공개 번들을 생성 | 법률 내용을 새로 작성하거나 승인 상태를 추정하는 일 |
| 공개 웹 세션 | 공개 스키마 소비 코드, 탐색 구조, 게시 차단 규칙, GitHub·Vercel 배포 | 내부 DB, 원장, 사건 파일, 승인 기록 원본 |

콘텐츠 세션이 만든 산출물은 곧바로 공개 콘텐츠가 아니다. 정확 해시 승인을 거쳐 출판기가 만든 `rulelink_published_bundle_v1`만 공개 저장소가 받는다.

## 2. 인계 단위

공개 웹이 수령하는 유일한 운영 입력은 다음 파일이다.

```text
artifacts/publication/current/bundle.json
```

앱 내부의 다음 파일은 빌드 때 복사되는 생성 파일이므로 직접 편집하지 않는다.

```text
web/rulelink_public_next/content/bundle.json
```

운영 번들은 최소한 다음 불변 좌표를 가진다.

- `snapshot_id`: 공개 출판본 식별자
- `source_snapshot_id`: 출처 원장 또는 시점 스냅샷 식별자
- `built_at`: 출판본 생성시각
- `file_hashes`: 승인 대상과 승인 기록의 해시
- 각 콘텐츠의 `reviewed_at`과 `expires_at`
- 각 근거의 공식 주소, 근거 스냅샷, 마지막 검증시각

동일한 `snapshot_id`의 내용을 덮어쓰지 않는다. 내용이 바뀌면 새 출판본 식별자를 만든다.

## 3. 병렬 작업 규칙

1. 콘텐츠 생산 세션은 내부 매니페스트와 편집 미리보기까지만 만든다.
2. 공개 웹 세션은 화면·검증기·배포 코드만 수정한다.
3. 운영 번들 갱신은 콘텐츠 생산 브랜치와 웹 기능 브랜치를 섞지 않은 별도 PR로 올린다.
4. 하나의 운영 번들 PR이 열려 있는 동안 다른 세션은 `artifacts/publication/current/bundle.json`을 수정하지 않는다.
5. 번들 PR이 병합된 뒤 다음 콘텐츠 세션은 최신 `main`에서 새 브랜치를 시작한다.
6. 공개 웹은 컨시어지 실행기나 내부 API를 호출하지 않는다. 컨시어지 연결은 허용된 별도 주소로 이동하는 링크뿐이다.

## 4. 운영 번들 수령 검사

공개 저장소는 배포 전에 다음을 모두 검사한다.

- 공개 스키마와 대한민국 관할·한국어 로케일
- 모든 문제카드·법령변화·지식 콘텐츠의 승인 상태
- 법리·사실분기·근거·허브 참조 무결성
- 내부 경로·사건 필드·프롬프트·원문 해시 누출
- 공식 정부 도메인과 허용된 컨시어지 도메인
- 공식 근거의 검증 상태와 검증시각
- 검토일과 재검토 기한
- 대한민국 표준시 기준 시행 예정·최근 시행 상태
- 타입 검사와 정적 페이지 생성

검사 실패 시 운영 번들을 임의로 고치지 않는다. 콘텐츠 생산 세션 또는 출판기로 돌려보내 새 승인본을 생성한다.

## 5. 인계 PR 필수 정보

운영 번들 PR 본문에는 다음을 적는다.

- 새 `snapshot_id`
- 기준 `source_snapshot_id`
- 추가·변경·제외된 공개 콘텐츠 수
- 현행법·구법 또는 시행 전·후 경계
- 법률 검토일과 가장 가까운 재검토 기한
- 승인 기록 해시가 현재 콘텐츠 해시와 일치한다는 확인
- 내부 편집 미리보기나 사건 데이터가 포함되지 않았다는 확인

## 6. 승인 전 변경 보고

후보 번들을 승격하기 전에 현재 운영본과 비교한 한글 검토 보고서를 만든다.

```powershell
Set-Location web\rulelink_public_next
npm run report:publication -- C:\absolute\path\candidate-bundle.json
```

기계가 읽는 JSON이 필요하면 `--json`을 붙인다. 보고서는 문제카드·법령변화·지식 콘텐츠·허브·공개 주제뿐 아니라 법리카드·사실분기·공식 근거·승인 해시 영수증의 추가·변경·제외를 구분한다. 공개 URL의 추가와 제거, 가장 가까운 재검토 기한, 기준 출처 스냅샷 변경도 함께 표시한다.

같은 `snapshot_id`인데 내용이 다른 후보나 공개 안전검증을 통과하지 못한 후보는 보고 단계에서 거부한다. 이 보고서의 내용은 운영 번들 PR 본문에 그대로 활용한다.

## 7. 승인 출판본 승격

콘텐츠 세션과 출판기가 만든 후보 번들은 먼저 검사 전용 모드로 확인한다.

```powershell
Set-Location web\rulelink_public_next
npm run promote:publication -- C:\absolute\path\candidate-bundle.json --check
```

최종 승격은 `--check`를 빼고 실행한다.

```powershell
npm run promote:publication -- C:\absolute\path\candidate-bundle.json
```

도구는 공개 검증을 먼저 통과시킨 뒤 `artifacts/publication/snapshots/<snapshot_id>/bundle.json`에 불변 보관하고, 그 내용과 동일한 경우에만 `current/bundle.json`을 교체한다. 같은 `snapshot_id`로 다른 내용을 승격하려 하면 `current`를 바꾸기 전에 실패한다. 운영 번들을 수동 복사하거나 기존 불변 스냅샷을 덮어쓰지 않는다.

## 8. 검증 명령

```powershell
Set-Location web\rulelink_public_next
npm ci
npm run test:publication
npm run typecheck
npm run build
npm run smoke:public-build
```

런타임 스모크는 빌드 서버를 실제로 기동해 승인 번들의 모든 공개 경로와 `publication.json` 스냅샷·건수·비공개 필드 부재를 확인한다. GitHub PR에서 같은 검사를 통과하고 Vercel 미리보기가 성공한 경우에만 병합한다. `main` 병합 뒤 운영 Vercel 배포 성공까지 확인해야 인계가 끝난다.
