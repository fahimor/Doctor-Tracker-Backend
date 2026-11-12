export interface PageQuery {
  page: number;
  limit: number;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export function toSkip({ page, limit }: PageQuery): number {
  return (page - 1) * limit;
}

export function buildPageMeta({ page, limit }: PageQuery, total: number): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}
