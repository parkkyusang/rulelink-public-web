import type {Page} from '@playwright/test';

export type LayoutOffender = {
  clientWidth: number;
  left: number;
  lineClamp: string;
  overflowX: string;
  right: number;
  scrollWidth: number;
  selectorKey: string;
  textOverflow: string;
};

export type AuthorityLayoutMeasurement = {
  bodyScrollWidth: number;
  documentClientWidth: number;
  documentScrollWidth: number;
  offenders: LayoutOffender[];
  overflowContainers: string[];
  viewportWidth: number;
};

export async function openAllAuthorityDetails(page: Page): Promise<void> {
  await page.locator('[data-authority-reading-root] details').evaluateAll(details => {
    for (const detail of details) {
      (detail as HTMLDetailsElement).open = true;
    }
  });
}

export async function measureAuthorityLayout(
  page: Page,
): Promise<AuthorityLayoutMeasurement> {
  return page.evaluate(() => {
    const selector = [
      '[data-authority-reading-root]',
      '[data-authority-id]',
      '[data-authority-id] summary',
      '[data-authority-id] h3',
      '[data-authority-id] blockquote',
      '[data-authority-clause-target]',
      '[data-authority-official-link]',
      '[data-authority-depth-nav]',
    ].join(', ');
    const offenders = [...document.querySelectorAll<HTMLElement>(selector)]
      .filter(element => element.getClientRects().length > 0)
      .map(element => {
        const bounds = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          clientWidth: element.clientWidth,
          left: bounds.left,
          lineClamp: style.webkitLineClamp,
          overflowX: style.overflowX,
          right: bounds.right,
          scrollWidth: element.scrollWidth,
          selectorKey: element.id
            || element.dataset.authorityId
            || element.getAttribute('data-authority-clause-target')
            || element.tagName.toLowerCase(),
          textOverflow: style.textOverflow,
        };
      });
    const overflowContainers = [
      ...document.querySelectorAll<HTMLElement>('[data-authority-reading-root] *'),
    ]
      .filter(element => {
        const value = getComputedStyle(element).overflowX;
        return value === 'auto' || value === 'scroll';
      })
      .map(element => (
        element.id
        || element.getAttribute('data-authority-id')
        || element.tagName.toLowerCase()
      ));
    return {
      bodyScrollWidth: document.body.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      offenders,
      overflowContainers,
      viewportWidth: window.innerWidth,
    };
  });
}

export function authorityLayoutFailures(
  measurement: AuthorityLayoutMeasurement,
): string[] {
  const failures: string[] = [];
  const rightBoundary = measurement.documentClientWidth + 1;
  if (measurement.documentScrollWidth > rightBoundary) {
    failures.push(
      `document overflow ${measurement.documentScrollWidth}`
      + ` > ${measurement.documentClientWidth} + 1`,
    );
  }
  if (measurement.bodyScrollWidth > measurement.viewportWidth + 1) {
    failures.push(
      `body overflow ${measurement.bodyScrollWidth}`
      + ` > ${measurement.viewportWidth} + 1`,
    );
  }
  for (const offender of measurement.offenders) {
    if (offender.left < -1 || offender.right > rightBoundary) {
      failures.push(
        `${offender.selectorKey} bounds ${offender.left}..${offender.right}`
        + ` outside 0..${measurement.documentClientWidth}`,
      );
    }
    if (offender.scrollWidth > offender.clientWidth + 1) {
      failures.push(
        `${offender.selectorKey} content overflow`
        + ` ${offender.scrollWidth} > ${offender.clientWidth} + 1`,
      );
    }
    if (offender.textOverflow === 'ellipsis') {
      failures.push(`${offender.selectorKey} uses text-overflow: ellipsis`);
    }
    if (!['', 'none', '0'].includes(offender.lineClamp)) {
      failures.push(`${offender.selectorKey} uses line clamp ${offender.lineClamp}`);
    }
  }
  if (measurement.overflowContainers.length) {
    failures.push(
      `authority overflow-x containers: ${measurement.overflowContainers.join(', ')}`,
    );
  }
  return failures;
}
