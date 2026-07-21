# 공개 지식 주제별 합성 표준

## 목적

여러 Codex 세션이 콘텐츠를 병렬 생산할 때 하나의 `current/bundle.json`을 통째로 다시 쓰면, 먼저 반영된 교정이나 다른 주제의 신규 콘텐츠가 조용히 사라질 수 있습니다. 공개 지식의 편집 원본을 주제별 파일로 분리하고 최종 공개본은 결정론적 조립기(컴포저)가 만들도록 합니다.

## 원본과 파생본

- 편집 원본: `artifacts/publication/topics/*.json`
- 조립 순서: `artifacts/publication/topics/manifest.json`
- 파생 현재본: `artifacts/publication/current/bundle.json`
- 불변 게시본: `artifacts/publication/snapshots/<snapshot_id>/bundle.json`

콘텐츠 세션은 자신이 맡은 주제 파일만 편집합니다. `current/bundle.json`의 `knowledge` 영역을 직접 편집하지 않습니다.

## 새 게시본 만드는 방법

```powershell
cd web/rulelink_public_next
npm run compose:publication -- --snapshot-id kr-knowledge-core-YYYYMMDD-NNN --built-at 2026-07-21T09:00:00+00:00 --source-snapshot-id multi-source:<식별자>
npm run validate:publication-composition
npm run test:publication
npm run typecheck
npm run build
npm run smoke:public-build
```

조립기는 다음을 한 번에 수행합니다.

1. manifest 순서로 모든 주제를 합칩니다.
2. 출처·허브·법리·사실분기·콘텐츠 식별자 중복을 차단합니다.
3. 각 주제 허브의 `content_ids`와 실제 콘텐츠 순서를 대조합니다.
4. 콘텐츠별 해시 영수증과 전체 지식 색인 영수증을 다시 계산합니다.
5. 현재본과 동일한 불변 스냅샷을 생성합니다.
6. 같은 `snapshot_id`의 내용이 이미 다르면 덮어쓰지 않고 실패합니다.

## 병렬 작업 규칙

- 한 세션은 한 주제 파일을 소유합니다.
- 새 주제는 새 파일과 manifest 항목으로 추가합니다.
- 서로 다른 세션이 같은 주제 파일을 동시에 편집하지 않습니다.
- 합성과 게시 스냅샷 생성은 통합 세션에서 한 번 수행합니다.
- PR에서는 주제 원본과 조립된 현재본·새 불변 스냅샷이 함께 변경되어야 합니다.
- 자동검증은 현재본이 모든 주제 원본의 정확한 합성 결과가 아니면 빌드를 중단합니다.

향후 콘텐츠 생산 전용 스킬은 공개 번들을 직접 쓰지 않고, 주제 파일을 만들거나 수정한 뒤 이 조립기를 호출해야 합니다.
