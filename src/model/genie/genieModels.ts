export interface RecommendationQuery {
  age?: number;
  gender?: string;
  skinType?: string;
  concerns: string[];
  preference?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  finish?: string;
  limit: number;
}

export interface FactItem {
  title: string;
  value: string;
}

export interface ProductPrice {
  current: number;
  original: number;
  currency: string;
  formattedCurrent: string;
  formattedOriginal: string;
  savingsText: string;
}

export interface ProductRanking {
  score: number;
  reasonSignals: string[];
}

export interface ProductRecommendation {
  id: string;
  productName: string;
  brand: string;
  category: string;
  description: string;
  imageUrl: string;
  productUrl: string;
  price: ProductPrice;
  finish: string;
  rating: number;
  reviewCount: number;
  badges: string[];
  tags: string[];
  ranking: ProductRanking;
  recommendation: {
    reasonShort: string;
    reasonDetail: string;
  };
  facts: FactItem[];
}

export type DisplayCardType = "featured" | "list" | "product" | "comparison" | "fallback" | "refinement";
export type PresentationMode = "featured" | "comparison" | "list" | "fallback";

export interface DisplayItem {
  cardType: DisplayCardType;
  id: string;
  rank?: number;
  eyebrow?: string;
  title: string;
  subtitle: string;
  imageUrl?: string;
  description?: string;
  recommendationReason?: string;
  reasonSignalsText?: string;
  highlightLine?: string;
  badgeLine?: string;
  tagLine?: string;
  priceText?: string;
  originalPriceText?: string;
  savingsText?: string;
  ratingText?: string;
  facts?: FactItem[];
  comparisonReason?: string;
  leftTitle?: string;
  leftSubtitle?: string;
  leftPriceText?: string;
  leftReasonText?: string;
  rightTitle?: string;
  rightSubtitle?: string;
  rightPriceText?: string;
  rightReasonText?: string;
  primaryActionTitle?: string;
  primaryActionUrl?: string;
  secondaryActionTitle?: string;
  secondaryActionUrl?: string;
  tertiaryActionTitle?: string;
  tertiaryActionUrl?: string;
}

export interface Refinement {
  id: string;
  label: string;
  url: string;
}

export interface RecommendationSummary {
  headline: string;
  recommendationReason: string;
  appliedFilters: string[];
  resultCount: number;
  presentationMode: PresentationMode;
  featuredProductId: string;
  featuredReason: string;
  refinementHint: string;
}

export interface RecommendationResults {
  status: "success" | "no_results";
  generatedAt: string;
  query: RecommendationQuery;
  summary: RecommendationSummary;
  products: ProductRecommendation[];
  displayItems: DisplayItem[];
  refinements: Refinement[];
  errors: ApiError[];
}

export interface RecommendationResponseEnvelope {
  requestId: string;
  status: "success" | "no_results" | "error";
  results: RecommendationResults;
}

export interface ApiError {
  statusCode: number;
  message: string;
  details?: string;
}

export interface ErrorEnvelope {
  requestId: string;
  status: "error";
  error: ApiError;
}

export interface HealthResponse {
  status: "ok";
  service: string;
  generatedAt: string;
  catalogSize: number;
  version: string;
  mode: string;
}

export interface ProductCatalogItem {
  id: string;
  productName: string;
  brand: string;
  category: string;
  subcategory: string;
  description: string;
  imageUrl: string;
  productUrl: string;
  price: number;
  originalPrice: number;
  currency: string;
  skinTypes: string[];
  concerns: string[];
  preferences: string[];
  finish: string;
  keyIngredient: string;
  badges: string[];
  tags: string[];
  rating: number;
  reviewCount: number;
}
