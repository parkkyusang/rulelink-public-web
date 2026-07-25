export const performanceBudgets: {
  cls: number;
  cssTransferredBytes: number;
  initialHtmlBytes: number;
  jsTransferredBytes: number;
  lcpApproxMs: number;
  longTaskDurationMs: number;
  requestCount: number;
  searchQueryReadyMs: number;
  searchIndexBytes: number;
  totalTransferredBytes: number;
};

export function extractBuildAssetPaths(html: string): string[];
