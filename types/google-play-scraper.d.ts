// Local type-shim for `google-play-scraper`.
//
// Why this exists: this sandbox blocks package tarball downloads, so the real
// package (which ships its own .d.ts) cannot be installed locally. Vercel's
// build servers DO install it, and once present its bundled types take
// precedence, making this shim inert. It exists only so `tsc`/`next build`
// type-checking resolves the import.
declare module "google-play-scraper" {
  interface SearchOptions {
    term: string;
    num?: number;
    lang?: string;
    country?: string;
    fullDetail?: boolean;
    price?: string;
  }

  interface AppOptions {
    appId: string;
    lang?: string;
    country?: string;
  }

  interface AppResult {
    appId?: string;
    title?: string;
    score?: number;
    scoreText?: string;
    url?: string;
    summary?: string;
    developer?: string;
    developerId?: string;
    free?: boolean;
    genre?: string;
    genreId?: string;
    familyGenre?: string;
    familyGenreId?: string;
    installs?: string;
    minInstalls?: number;
    maxInstalls?: number;
    price?: number | string;
    currency?: string;
    reviews?: number;
    ratings?: number;
    histogram?: Record<string, number>;
    description?: string;
    descriptionHTML?: string;
    updated?: string;
    released?: string;
    version?: string | null;
    recentChanges?: string;
    comments?: string[];
    privacyPolicy?: string;
    contentRating?: string;
    size?: string;
    androidVersion?: string;
    androidVersionText?: string;
    video?: string;
    screenshots?: string[];
    icon?: string;
    headerImage?: string;
    similar?: string[];
    moreBy?: string[];
  }

  const gplay: {
    search(opts: SearchOptions): Promise<AppResult[]>;
    app(opts: AppOptions): Promise<AppResult>;
    developer(opts: { devId: string; lang?: string; country?: string }): Promise<AppResult[]>;
    suggest(opts: { term: string; lang?: string; country?: string }): Promise<string[]>;
    reviews(opts: {
      appId: string;
      sort?: number;
      lang?: string;
      country?: string;
      num?: number;
      paginate?: boolean;
      nextPaginationToken?: string | null;
    }): Promise<{ data: any[]; nextPaginationToken?: string | null }>;
    permissions(opts: { appId: string; lang?: string; country?: string }): Promise<any>;
    datasafety(opts: { appId: string; lang?: string; country?: string }): Promise<any>;
    categories(opts: { country?: string }): Promise<string[]>;
    list(opts: {
      collection?: string;
      category?: string;
      age?: string;
      num?: number;
      lang?: string;
      country?: string;
      fullDetail?: boolean;
    }): Promise<AppResult[]>;
    memoized(): typeof gplay;
  };

  export default gplay;
  export type { AppResult, SearchOptions, AppOptions };
}
