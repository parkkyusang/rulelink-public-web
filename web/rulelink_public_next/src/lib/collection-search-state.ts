export const COLLECTION_QUERY_MAX_LENGTH = 200;

type ParseCollectionSearchStateOptions<Filter extends string> = {
  allowedFilters: readonly Filter[];
  defaultFilter: Filter;
  filterParam: string;
  search: string;
};

type BuildCollectionSearchHrefOptions<Filter extends string> = {
  defaultFilter: Filter;
  filter: Filter;
  filterParam: string;
  hash?: string;
  pathname: string;
  query: string;
};

export function sanitizeCollectionQuery(value: string): string {
  return value.slice(0, COLLECTION_QUERY_MAX_LENGTH);
}

export function parseCollectionSearchState<Filter extends string>({
  allowedFilters,
  defaultFilter,
  filterParam,
  search,
}: ParseCollectionSearchStateOptions<Filter>): {query: string; filter: Filter} {
  const parameters = new URLSearchParams(search);
  const candidateFilter = parameters.get(filterParam);
  const filter = candidateFilter !== null && allowedFilters.includes(candidateFilter as Filter)
    ? candidateFilter as Filter
    : defaultFilter;
  return {
    filter,
    query: sanitizeCollectionQuery(parameters.get('q') ?? ''),
  };
}

export function buildCollectionSearchHref<Filter extends string>({
  defaultFilter,
  filter,
  filterParam,
  hash = '',
  pathname,
  query,
}: BuildCollectionSearchHrefOptions<Filter>): string {
  const parameters = new URLSearchParams();
  const normalizedQuery = sanitizeCollectionQuery(query).trim();
  if (normalizedQuery) parameters.set('q', normalizedQuery);
  if (filter !== defaultFilter) parameters.set(filterParam, filter);
  const search = parameters.toString();
  return `${pathname}${search ? `?${search}` : ''}${hash}`;
}
