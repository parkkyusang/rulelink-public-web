import {LegalConceptText} from '@/components/legal-concept-text';
import {browserOfficialSourceUrl} from '@/lib/official-source-url';

import type {
  PublicComparisonMatrix,
  PublicConceptCard,
  PublicKnowledgeSource,
  PublicProvisionReadingCard,
  PublicSourcePinpoint,
} from '@/types/publication';

type Props = {
  comparisonMatrix?: PublicComparisonMatrix;
  concepts: PublicConceptCard[];
  provisionReadingCards: PublicProvisionReadingCard[];
  sources: PublicKnowledgeSource[];
};

export function KnowledgeReadingLayers({
  comparisonMatrix,
  concepts,
  provisionReadingCards,
  sources,
}: Props) {
  const sourceById = new Map(sources.map(source => [source.coordinate_id, source]));
  return (
    <>
      {comparisonMatrix ? (
        <section className="knowledgeSection comparisonSection" id="comparison">
          <p className="eyebrow">같은 기준으로 비교</p>
          <h2>{comparisonMatrix.title_ko}</h2>
          <div className="comparisonAxisStack">
            {comparisonMatrix.axes.map(axis => (
              <article className="comparisonAxisCard" key={axis.axis_key}>
                <h3>{axis.title_ko}</h3>
                <div className="comparisonSubjects">
                  {comparisonMatrix.subjects.map(subject => {
                    const cell = axis.cells.find(candidate => candidate.subject_id === subject.subject_id);
                    if (!cell) return null;
                    return (
                      <div className="comparisonSubject" key={subject.subject_id}>
                        <strong>{subject.label_ko}</strong>
                        <p><LegalConceptText concepts={concepts} text={cell.value_ko} /></p>
                      </div>
                    );
                  })}
                </div>
                <PinpointDetails
                  pinpoints={deduplicatePinpoints([
                    ...(axis.source_pinpoints ?? []),
                    ...axis.cells.flatMap(cell => cell.source_pinpoints),
                  ])}
                  sourceById={sourceById}
                />
              </article>
            ))}
          </div>
          <div className="comparisonPathStack">
            <h3>내 상황에서 고르는 순서</h3>
            {comparisonMatrix.selection_paths.map(path => (
              <details className="comparisonPath" key={path.path_id}>
                <summary>{path.question_ko}</summary>
                <ul>{path.decision_facts_ko.map(fact => <li key={fact}>{fact}</li>)}</ul>
                <p>{path.outcome.explanation_ko}</p>
                <PinpointLinks pinpoints={path.source_pinpoints} sourceById={sourceById} />
              </details>
            ))}
          </div>
        </section>
      ) : null}

      {provisionReadingCards.length ? (
        <section className="knowledgeSection provisionReadingSection" id="provision-reading">
          <p className="eyebrow">조문 읽기 카드</p>
          <h2>원문을 열기 전에 구조부터 확인합니다.</h2>
          {provisionReadingCards.map(card => (
            <article className="provisionReadingCard" key={card.reading_card_id}>
              <header>
                <h3>{card.title_ko}</h3>
                <p>{card.question_ko}</p>
                <strong>{card.summary_ko}</strong>
              </header>
              <div className="provisionReadingSteps">
                {card.sections.map(section => (
                  <details key={section.section_id}>
                    <summary>{section.title_ko}</summary>
                    <p><LegalConceptText concepts={concepts} text={section.explanation_ko} /></p>
                    <PinpointLinks pinpoints={section.source_pinpoints} sourceById={sourceById} />
                  </details>
                ))}
              </div>
            </article>
          ))}
        </section>
      ) : null}
    </>
  );
}

function PinpointDetails({
  pinpoints,
  sourceById,
}: {
  pinpoints: PublicSourcePinpoint[];
  sourceById: Map<string, PublicKnowledgeSource>;
}) {
  if (!pinpoints.length) return null;
  return (
    <details className="sourcePinpoints">
      <summary>이 비교축의 공식 근거</summary>
      <PinpointLinks pinpoints={pinpoints} sourceById={sourceById} />
    </details>
  );
}

function PinpointLinks({
  pinpoints,
  sourceById,
}: {
  pinpoints: PublicSourcePinpoint[];
  sourceById: Map<string, PublicKnowledgeSource>;
}) {
  const visible = deduplicatePinpoints(pinpoints)
    .map(pinpoint => ({pinpoint, source: sourceById.get(pinpoint.source_coordinate_id)}))
    .filter((item): item is {pinpoint: PublicSourcePinpoint; source: PublicKnowledgeSource} => Boolean(item.source));
  if (!visible.length) return null;
  return (
    <ul className="pinpointLinks">
      {visible.map(({pinpoint, source}) => (
        <li key={pinpointKey(pinpoint)}>
          <a href={browserOfficialSourceUrl(source) ?? source.official_url} rel="noreferrer" target="_blank">
            {sourceLabel(source)}{locatorLabel(pinpoint)} <span aria-hidden="true">↗</span>
          </a>
          {pinpoint.note_ko ? <small>{pinpoint.note_ko}</small> : null}
        </li>
      ))}
    </ul>
  );
}

function deduplicatePinpoints(pinpoints: PublicSourcePinpoint[]): PublicSourcePinpoint[] {
  return [...new Map(pinpoints.map(pinpoint => [pinpointKey(pinpoint), pinpoint])).values()];
}

function pinpointKey(pinpoint: PublicSourcePinpoint): string {
  return [
    pinpoint.source_coordinate_id,
    pinpoint.paragraph_no,
    pinpoint.item_no,
    pinpoint.subitem_no,
    pinpoint.authority_role,
  ].filter(Boolean).join(':');
}

function locatorLabel(pinpoint: PublicSourcePinpoint): string {
  const values = [pinpoint.paragraph_no, pinpoint.item_no, pinpoint.subitem_no].filter(Boolean);
  return values.length ? ` ${values.join(' ')}` : '';
}

function sourceLabel(source: PublicKnowledgeSource): string {
  if (source.source_kind === 'precedent' || source.source_kind === 'official_document') return source.title_ko;
  return `${source.law_name_ko} ${source.article_no}`;
}
