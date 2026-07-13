export interface MantleModelRecord {
  readonly id: string;
  readonly object?: string;
  readonly created?: number;
  readonly ownedBy?: string;
}

export type MantleFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface DiscoverMantleModelsOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly fetch?: MantleFetch;
  readonly signal?: AbortSignal;
}
