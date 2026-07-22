# 공개 콘텐츠 의미중복 감사 계약

## 목적

콘텐츠 식별자와 문장이 다르더라도 같은 생활질문ㆍ절차ㆍ법률효과를 반복하면 통합 전에
차단한다. 제목 유사도만으로 다른 질문을 합치지 않고, 질문의 법적 좌표를 축별로
비교한다. 이 감사기는 콘텐츠를 수정하거나 공개 정본을 생성하지 않는다.

## 질문 서명과 점수

각 콘텐츠를 다음 100점 질문 서명으로 비교한다.

| 축 | 점수 |
| --- | ---: |
| 당사자 | 10 |
| 생활사건 | 15 |
| 사용자 목표 | 15 |
| 절차ㆍ판단기관 | 15 |
| 법률효과 | 20 |
| 적용시점 | 10 |
| 결론을 바꾸는 결정사실 | 10 |
| 정규화 법령ㆍ조문 | 5 |

명시적인 `question_signature`가 있으면 해당 축을 우선한다. 없는 축은 콘텐츠 제목,
한줄답변, 대상 상황, 행동 단계, 확인할 사실, 연결 법리카드와 사실분기에서 보수적으로
파생한다. 근거는 `coordinate_id` 접두사가 아니라 `law_name_ko + article_no`로
정규화한다.

구 법령 좌표 이름이 달라도 한쪽 근거집합의 절반 이상이 다른 쪽에 포함되고, 당사자
문맥 유사도가 0.6 이상이며 질문과 법률효과 문맥 유사도가 0.26
이상이면 같은 규율을 다른 문장으로 반복했을 가능성이 높다. 이 경우 당사자ㆍ사건ㆍ목표ㆍ
절차ㆍ효과ㆍ결정사실 축에 보수적인 하한을 적용한다. 근거 점수 자체는 여전히 5점이며,
문맥 유사도가 낮으면 하한을 적용하지 않는다. 별도 시점 표현이 없는 콘텐츠는
`현행 일반`으로 파생한다.

서로 다른 법률 조문이 같은 불복절차를 함께 규율할 수도 있다. 생활사건 0.75,
절차ㆍ기관 0.8, 법률효과 0.65, 시점 0.5 이상의 네 조건이 모두 맞으면
`동일 절차 교차근거`로 보강한다. 따라서 법령명이 다르다는 이유만으로 같은 10일ㆍ15일
불복질문을 놓치지 않는다.

## 판정

- 85점 이상: `duplicate_blocked`
- 70~84점: `containment_review`
- 50~69점: `related_required`
- 49점 이하: `distinct`

사용자 목표, 절차ㆍ기관, 법률효과, 적용시점에 명시적인 충돌이 있으면 점수가 높아도
자동 중복으로 확정하지 않는다. 직접 연결된 일반 질문과 더 좁은 사실적용 질문은
`narrower_application` 관계 후보로 보고 별도 콘텐츠를 허용한다.

## 생산 대기열 게이트

`--pr-number`를 주면 85점 이상 후보가
`artifacts/publication/production-queue.json`의 해당 항목 `overlap_decisions`에
기록됐는지 검사한다. 다른 후보 PR과 겹치면 `target_pr`, 현재 정본과 겹치면
`target_content_id`가 필요하다. 기록이 없으면 종료코드 1로 실패한다.

## 실행

~~~text
npm run audit:semantic-overlap -- \
  --pr-number 114 \
  --topic C:/tmp/pr-88/artifacts/publication/topics/personal-insolvency-recovery.json \
  --topic C:/tmp/pr-114/artifacts/publication/topics/personal-rehabilitation.json \
  --format both
~~~

`--current`, `--production-queue`, `--min-score`, `--json-out`으로 입력과 출력을 바꿀 수
있다. 기본 출력은 기계가 읽는 JSON과 사람이 읽는 한글 보고를 함께 제공한다.

`npm run prebuild`는 `--prebuild` 모드로 감사기를 실행한다. 생산 대기열의 `new_topic`
중 현재 브랜치에 실제 topic 파일이 존재하는 항목만 자동 발견한다. 85점 이상 중복은
두 PR 중 한쪽 또는 현재 정본을 대상으로 하는 `overlap_decisions`가 없으면 빌드를
실패시킨다. 아직 브랜치에 들어오지 않은 열린 PR 파일은 읽을 수 없으므로 건너뛴다.

## 역할 경계

감사기는 current, topic, manifest, snapshot, release, production-queue를 읽기만 한다.
의미중복 판정과 정본 이관은 분리하며, 통합 담당자는 최신 main과 고정된 후보 PR head를
입력으로 다시 실행한다.
