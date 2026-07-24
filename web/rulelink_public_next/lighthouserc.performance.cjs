const formFactor = process.env.RULELINK_LHCI_FORM_FACTOR ?? 'mobile';
const baseURL = process.env.RULELINK_PERFORMANCE_BASE_URL
  ?? 'http://127.0.0.1:8897';
const outputDir = process.env.RULELINK_LHCI_OUTPUT_DIR
  ?? 'test-results/performance/lighthouse/current';
const isDesktop = formFactor === 'desktop';

module.exports = {
  ci: {
    collect: {
      url: [`${baseURL}/`, `${baseURL}/ko/search`],
      numberOfRuns: 1,
      settings: {
        chromeFlags: '--headless --no-sandbox --disable-gpu',
        formFactor,
        onlyCategories: ['performance'],
        screenEmulation: isDesktop
          ? {
              disabled: false,
              height: 1000,
              mobile: false,
              width: 1440,
              deviceScaleFactor: 1,
            }
          : {
              disabled: false,
              height: 844,
              mobile: true,
              width: 390,
              deviceScaleFactor: 1,
            },
        throttlingMethod: 'simulate',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', {minScore: 0.7}],
        'cumulative-layout-shift': ['warn', {maxNumericValue: 0.1}],
        'largest-contentful-paint': ['warn', {maxNumericValue: 4000}],
        'total-blocking-time': ['warn', {maxNumericValue: 600}],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir,
    },
  },
};
