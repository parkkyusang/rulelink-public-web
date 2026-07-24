export type PerformanceRouteCase = {
  id: string;
  route: string;
  state: string;
};

export const performanceWidths: readonly [390, 1440];

export function resolvePerformanceCases(bundle: unknown): {
  query: string;
  workload: {
    authorityZeroContentId: string;
    changeBriefId: string;
    hubId: string;
    knowledgeContentId: string;
    query: string;
  };
  routes: PerformanceRouteCase[];
};

export function expectedPerformanceCases(bundle: unknown): Array<
  PerformanceRouteCase & {width: number}
>;

export function performanceCaseKey(item: {
  id: string;
  route: string;
  state: string;
  width: number;
}): string;
