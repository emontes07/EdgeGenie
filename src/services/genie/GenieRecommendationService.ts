import { randomUUID } from "crypto";
import GenieConfigService from "./GenieConfig";
import { PRODUCT_CATALOG } from "./GenieCatalog";
import {
  ApiError,
  DisplayItem,
  ErrorEnvelope,
  FactItem,
  HealthResponse,
  PresentationMode,
  ProductCatalogItem,
  ProductRecommendation,
  RecommendationQuery,
  RecommendationResponseEnvelope,
  RecommendationSummary,
  Refinement,
} from "../../model/genie/genieModels";

class GenieRecommendationService {
  normalizeQuery(rawQuery: Record<string, unknown> = {}): RecommendationQuery {
    const concerns = this.dedupe(this.splitValues(rawQuery.concerns));
    const normalized: RecommendationQuery = {
      age: rawQuery.age ? Number(rawQuery.age) : undefined,
      gender: rawQuery.gender ? String(rawQuery.gender).trim().toLowerCase() : undefined,
      skinType: rawQuery.skinType ? String(rawQuery.skinType).trim().toLowerCase() : undefined,
      concerns,
      preference: rawQuery.preference ? String(rawQuery.preference).trim().toLowerCase() : undefined,
      brand: rawQuery.brand ? String(rawQuery.brand).trim().toLowerCase() : undefined,
      minPrice: rawQuery.minPrice ? Number(rawQuery.minPrice) : undefined,
      maxPrice: rawQuery.maxPrice ? Number(rawQuery.maxPrice) : undefined,
      finish: rawQuery.finish ? String(rawQuery.finish).trim().toLowerCase() : undefined,
      limit: rawQuery.limit ? Math.min(Math.max(Number(rawQuery.limit), 1), 6) : 3,
    };

    if (Number.isNaN(normalized.age!)) normalized.age = undefined;
    if (Number.isNaN(normalized.minPrice!)) normalized.minPrice = undefined;
    if (Number.isNaN(normalized.maxPrice!)) normalized.maxPrice = undefined;
    if (Number.isNaN(normalized.limit)) normalized.limit = 3;

    return normalized;
  }

  buildRecommendationsResponse(rawQuery: Record<string, unknown> = {}): RecommendationResponseEnvelope {
    const query = this.normalizeQuery(rawQuery);
    const refinements = this.createRefinements(query);
    const rankedProducts = this.filterCatalog(query)
      .map((product) => this.buildProductRecommendation(product, query))
      .filter((product) => product.ranking.score > 0 || (!query.skinType && query.concerns.length === 0 && !query.preference))
      .sort((left, right) => right.ranking.score - left.ranking.score || right.rating - left.rating || left.price.current - right.price.current)
      .slice(0, query.limit);

    const summary = this.buildSummary(query, rankedProducts);
    const displayItems: DisplayItem[] = [];
    const shouldShowRefinement = refinements.length > 0 && (this.hasActiveConstraints(query) || rankedProducts.length === 0);

    if (rankedProducts.length > 0) {
      switch (summary.presentationMode) {
        case "featured":
          displayItems.push(this.createFeaturedDisplayItem(rankedProducts[0], summary));
          if (rankedProducts[1]) {
            displayItems.push(this.createProductDisplayItem(rankedProducts[1], 1, "compact"));
          }
          break;
        case "comparison": {
          const comparisonItem = this.createComparisonDisplayItem(rankedProducts, summary);
          if (comparisonItem) {
            displayItems.push(comparisonItem);
          }
          rankedProducts.slice(0, 2).forEach((product, index) => {
            displayItems.push(this.createProductDisplayItem(product, index, "compact"));
          });
          break;
        }
        default:
          displayItems.push(this.createRecommendationsListDisplayItem(rankedProducts, summary));
          rankedProducts.slice(0, 2).forEach((product, index) => {
            displayItems.push(this.createProductDisplayItem(product, index, "compact"));
          });
          break;
      }
      if (shouldShowRefinement) {
        displayItems.push(this.createRefinementDisplayItem(summary, refinements, query, "results"));
      }
    } else {
      displayItems.push(this.createFallbackDisplayItem(query, refinements));
      if (shouldShowRefinement) {
        displayItems.push(this.createRefinementDisplayItem(summary, refinements, query, "fallback"));
      }
    }

    return {
      requestId: randomUUID(),
      status: rankedProducts.length > 0 ? "success" : "no_results",
      results: {
        status: rankedProducts.length > 0 ? "success" : "no_results",
        generatedAt: new Date().toISOString(),
        query,
        summary,
        products: rankedProducts,
        displayItems,
        refinements,
        errors: [],
      },
    };
  }

  buildHealthResponse(): HealthResponse {
    const config = GenieConfigService.getConfig();
    return {
      status: "ok",
      service: config.serviceName,
      generatedAt: new Date().toISOString(),
      catalogSize: PRODUCT_CATALOG.length,
      version: config.version,
      mode: config.mode,
    };
  }

  buildErrorResponse(statusCode: number, message: string, details?: string): ErrorEnvelope {
    const error: ApiError = { statusCode, message, details };
    return {
      requestId: randomUUID(),
      status: "error",
      error,
    };
  }

  private splitValues(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.flatMap((item) => this.splitValues(item));
    }
    return String(value)
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  private dedupe(values: string[]): string[] {
    return [...new Set(values.filter(Boolean))];
  }

  private toTitleCase(value: string): string {
    return value
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  private formatMoney(amount: number, currency = "USD"): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  private buildSearchUrl(queryText: string): string {
    const config = GenieConfigService.getConfig();
    return `${config.shopBaseUrl}/search?search=${encodeURIComponent(queryText)}`;
  }

  private scoreProduct(product: ProductCatalogItem, query: RecommendationQuery): { score: number; signals: string[] } {
    let score = 0;
    const signals: string[] = [];

    if (query.skinType && product.skinTypes.includes(query.skinType)) {
      score += 3;
      signals.push(`${this.toTitleCase(query.skinType)} skin support`);
    }
    if (query.finish && product.finish === query.finish) {
      score += 2;
      signals.push(`${this.toTitleCase(query.finish)} finish`);
    }
    if (query.preference) {
      const preferenceMatch = product.preferences.find((item) => item.includes(query.preference!));
      if (preferenceMatch) {
        score += 2;
        signals.push(this.toTitleCase(preferenceMatch));
      }
    }
    if (query.concerns.length > 0) {
      const concernMatches = query.concerns.filter((concern) => product.concerns.some((item) => item.includes(concern)));
      if (concernMatches.length > 0) {
        score += concernMatches.length * 2;
        signals.push(...concernMatches.map((concern) => this.toTitleCase(concern)));
      }
    }
    if (typeof query.age === "number" && query.age >= 40) {
      const matureSkinMatch = ["aging", "fine lines", "barrier support", "dehydration"].some((tag) => product.concerns.includes(tag));
      if (matureSkinMatch) {
        score += 1;
        signals.push("Supports visible aging concerns");
      }
    }

    score += Math.max(0, Math.round(product.rating - 4));

    return { score, signals: this.dedupe(signals) };
  }

  private filterCatalog(query: RecommendationQuery): ProductCatalogItem[] {
    return PRODUCT_CATALOG.filter((product) => {
      if (query.brand && product.brand.toLowerCase() !== query.brand) return false;
      if (typeof query.minPrice === "number" && product.price < query.minPrice) return false;
      if (typeof query.maxPrice === "number" && product.price > query.maxPrice) return false;
      if (query.finish && product.finish !== query.finish) return false;
      return true;
    });
  }

  private buildProductRecommendation(product: ProductCatalogItem, query: RecommendationQuery): ProductRecommendation {
    const ranking = this.scoreProduct(product, query);
    const price = {
      current: product.price,
      original: product.originalPrice,
      currency: product.currency,
      formattedCurrent: this.formatMoney(product.price, product.currency),
      formattedOriginal: product.originalPrice > product.price ? this.formatMoney(product.originalPrice, product.currency) : "",
      savingsText: product.originalPrice > product.price ? `Save ${this.formatMoney(product.originalPrice - product.price, product.currency)}` : "",
    };

    const reasonParts: string[] = [];
    if (query.skinType && product.skinTypes.includes(query.skinType)) {
      reasonParts.push(`supports ${query.skinType} skin`);
    }
    if (query.concerns.length > 0) {
      const concernMatch = query.concerns.filter((concern) => product.concerns.includes(concern));
      if (concernMatch.length > 0) {
        reasonParts.push(`targets ${concernMatch.join(" and ")}`);
      }
    }
    if (query.preference && product.preferences.some((item) => item.includes(query.preference!))) {
      reasonParts.push(`matches a ${query.preference} preference`);
    }
    if (reasonParts.length === 0) {
      reasonParts.push("balances strong reviews, price, and fit for the request");
    }

    return {
      id: product.id,
      productName: product.productName,
      brand: product.brand,
      category: product.subcategory,
      description: product.description,
      imageUrl: product.imageUrl,
      productUrl: product.productUrl,
      price,
      finish: product.finish,
      rating: product.rating,
      reviewCount: product.reviewCount,
      badges: product.badges,
      tags: product.tags,
      ranking: {
        score: ranking.score,
        reasonSignals: ranking.signals,
      },
      recommendation: {
        reasonShort: `Recommended because it ${reasonParts.join(", ")}.`,
        reasonDetail: ranking.signals.join(" • "),
      },
      facts: [
        { title: "Best for", value: product.skinTypes.map((value) => this.toTitleCase(value)).join(", ") },
        { title: "Finish", value: this.toTitleCase(product.finish) },
        { title: "Key ingredient", value: product.keyIngredient },
      ],
    };
  }

  private createProductDisplayItem(product: ProductRecommendation, index: number, variant: "full" | "compact"): DisplayItem {
    const isCompact = variant === "compact";
    return {
      cardType: "product",
      id: `product-${product.id}`,
      rank: index + 1,
      title: product.productName,
      subtitle: `${product.brand} • ${product.category}`,
      imageUrl: product.imageUrl,
      description: product.description,
      recommendationReason: product.recommendation.reasonShort,
      reasonSignalsText: isCompact ? "" : product.recommendation.reasonDetail,
      badgeLine: isCompact ? product.badges.slice(0, 1).join(" • ") : product.badges.join(" • "),
      tagLine: isCompact ? product.tags.slice(0, 2).join(" • ") : product.tags.join(" • "),
      priceText: product.price.formattedCurrent,
      originalPriceText: product.price.formattedOriginal,
      savingsText: product.price.savingsText,
      ratingText: `${product.rating.toFixed(1)} stars (${product.reviewCount.toLocaleString()} reviews)`,
      facts: isCompact ? product.facts.slice(0, 2) : product.facts,
      primaryActionTitle: "View product",
      primaryActionUrl: product.productUrl,
      secondaryActionTitle: "Shop similar",
      secondaryActionUrl: this.buildSearchUrl(`${product.brand} ${product.category}`),
      tertiaryActionTitle: "",
      tertiaryActionUrl: "",
    };
  }

  private createFeaturedDisplayItem(product: ProductRecommendation, summary: RecommendationSummary): DisplayItem {
    return {
      cardType: "featured",
      id: `featured-${product.id}`,
      eyebrow: "Featured match",
      title: product.productName,
      subtitle: `${product.brand} • ${product.category}`,
      imageUrl: product.imageUrl,
      description: product.description,
      recommendationReason: product.recommendation.reasonShort,
      reasonSignalsText: product.recommendation.reasonDetail,
      highlightLine: summary.featuredReason,
      badgeLine: product.badges.join(" • "),
      tagLine: product.tags.join(" • "),
      priceText: product.price.formattedCurrent,
      originalPriceText: product.price.formattedOriginal,
      savingsText: product.price.savingsText,
      ratingText: `${product.rating.toFixed(1)} stars (${product.reviewCount.toLocaleString()} reviews)`,
      facts: product.facts,
      primaryActionTitle: "View featured pick",
      primaryActionUrl: product.productUrl,
      secondaryActionTitle: "Browse similar",
      secondaryActionUrl: this.buildSearchUrl(`${product.brand} ${product.category}`),
      tertiaryActionTitle: summary.resultCount > 1 ? "See all picks" : "",
      tertiaryActionUrl: summary.resultCount > 1 ? this.buildSearchUrl(summary.headline) : "",
    };
  }

  private createRecommendationsListDisplayItem(products: ProductRecommendation[], summary: RecommendationSummary): DisplayItem {
    return {
      cardType: "list",
      id: "recommendations-list",
      eyebrow: "At a glance",
      title: "Top recommendations",
      subtitle: `${products.length} curated match${products.length === 1 ? "" : "es"}`,
      description: summary.headline,
      recommendationReason: summary.recommendationReason,
      facts: products.map((product, index) => ({
        title: `#${index + 1}`,
        value: `${product.productName} • ${product.price.formattedCurrent} • ${product.recommendation.reasonDetail || product.recommendation.reasonShort}`,
      })),
      tagLine: summary.appliedFilters.join(" • "),
      primaryActionTitle: "Browse all picks",
      primaryActionUrl: this.buildSearchUrl(summary.headline),
      secondaryActionTitle: products[1] ? "Compare top 2" : "Open featured pick",
      secondaryActionUrl: products[1] ? this.buildSearchUrl(`${products[0].productName} ${products[1].productName}`) : products[0].productUrl,
      tertiaryActionTitle: "",
      tertiaryActionUrl: "",
    };
  }

  private createComparisonDisplayItem(products: ProductRecommendation[], summary: RecommendationSummary): DisplayItem | null {
    if (products.length < 2) return null;
    const [first, second] = products;
    return {
      cardType: "comparison",
      id: "comparison-top-2",
      title: "Compare your top matches",
      subtitle: summary.headline,
      comparisonReason: `${first.productName} leads on overall fit, while ${second.productName} offers a strong alternative on price or finish.`,
      leftTitle: first.productName,
      leftSubtitle: `${first.brand} • ${first.category}`,
      leftPriceText: first.price.formattedCurrent,
      leftReasonText: first.recommendation.reasonDetail || "Strong overall fit",
      rightTitle: second.productName,
      rightSubtitle: `${second.brand} • ${second.category}`,
      rightPriceText: second.price.formattedCurrent,
      rightReasonText: second.recommendation.reasonDetail || "Strong alternative",
      primaryActionTitle: "Browse top picks",
      primaryActionUrl: this.buildSearchUrl(summary.headline),
    };
  }

  private buildAppliedFilters(query: RecommendationQuery): string[] {
    const filters: string[] = [];
    if (query.skinType) filters.push(this.toTitleCase(query.skinType));
    if (query.concerns.length > 0) filters.push(...query.concerns.map((value) => this.toTitleCase(value)));
    if (query.preference) filters.push(this.toTitleCase(query.preference));
    if (query.finish) filters.push(this.toTitleCase(query.finish));
    if (query.brand) filters.push(`Brand: ${this.toTitleCase(query.brand)}`);
    if (typeof query.maxPrice === "number") filters.push(`Under ${this.formatMoney(query.maxPrice)}`);
    if (typeof query.minPrice === "number") filters.push(`Over ${this.formatMoney(query.minPrice)}`);
    return filters;
  }

  private createFallbackDisplayItem(query: RecommendationQuery, refinements: Refinement[]): DisplayItem {
    return {
      cardType: "fallback",
      id: "fallback-no-results",
      title: "No exact matches yet",
      subtitle: this.buildAppliedFilters(query).length > 0 ? `Tried filters: ${this.buildAppliedFilters(query).join(", ")}` : "Try broadening the request",
      description: "The current filters are likely too narrow for the mock catalog. A broader query usually returns stronger recommendations.",
      recommendationReason: "Try removing one filter, widening the price range, or switching to a broader concern such as hydration or glow.",
      badgeLine: "Refine your search",
      tagLine: refinements.map((item) => item.label).join(" • "),
      primaryActionTitle: refinements[0]?.label || "Browse skincare",
      primaryActionUrl: refinements[0]?.url || this.buildSearchUrl("hydrating skincare"),
      secondaryActionTitle: refinements[1]?.label || "Browse makeup",
      secondaryActionUrl: refinements[1]?.url || this.buildSearchUrl("dewy skin tint"),
      tertiaryActionTitle: refinements[2]?.label || "",
      tertiaryActionUrl: refinements[2]?.url || "",
      facts: this.buildAppliedFilters(query).map((filter, index) => ({ title: index === 0 ? "Tried" : "", value: filter })),
    };
  }

  private createRefinements(query: RecommendationQuery): Refinement[] {
    const refinements: Refinement[] = [];
    if (query.skinType) {
      refinements.push({
        id: "broaden-skin-type",
        label: `Broaden beyond ${this.toTitleCase(query.skinType)}`,
        url: this.buildSearchUrl(`${query.skinType} skincare`),
      });
    }
    refinements.push(
      { id: "hydrating-picks", label: "Try hydrating picks", url: this.buildSearchUrl("hydrating skincare") },
      { id: "under-35", label: "See top products under $35", url: this.buildSearchUrl("best beauty products under 35") },
      { id: "sensitive-safe", label: "Explore sensitive-safe options", url: this.buildSearchUrl("sensitive skin skincare") }
    );
    return refinements.slice(0, 3);
  }

  private createRefinementDisplayItem(summary: RecommendationSummary, refinements: Refinement[], query: RecommendationQuery, mode: "results" | "fallback"): DisplayItem {
    const isNoResults = mode === "fallback";
    return {
      cardType: "refinement",
      id: isNoResults ? "refinement-fallback" : "refinement-next-step",
      eyebrow: isNoResults ? "Try a broader search" : "Refine this search",
      title: isNoResults ? "Try a broader path" : "Keep exploring",
      subtitle: this.buildAppliedFilters(query).join(" • ") || "Broaden or narrow the search",
      description: isNoResults
        ? "The mock catalog did not find an exact match. These refinements broaden the search without losing context."
        : "Use one of these quick refinement links to browse adjacent products, lower the budget, or expand beyond the current filters.",
      recommendationReason: isNoResults ? "Refinement links are the safest current action pattern across hosts." : summary.refinementHint,
      tagLine: refinements.map((item) => item.label).join(" • "),
      facts: refinements.map((item, index) => ({ title: `Option ${index + 1}`, value: item.label })),
      primaryActionTitle: refinements[0]?.label || "Browse skincare",
      primaryActionUrl: refinements[0]?.url || this.buildSearchUrl("hydrating skincare"),
      secondaryActionTitle: refinements[1]?.label || "",
      secondaryActionUrl: refinements[1]?.url || "",
      tertiaryActionTitle: refinements[2]?.label || "",
      tertiaryActionUrl: refinements[2]?.url || "",
    };
  }

  private hasActiveConstraints(query: RecommendationQuery): boolean {
    return Boolean(
      query.skinType ||
        query.concerns.length > 0 ||
        query.preference ||
        query.brand ||
        typeof query.minPrice === "number" ||
        typeof query.maxPrice === "number" ||
        query.finish
    );
  }

  private determinePresentationMode(products: ProductRecommendation[]): PresentationMode {
    if (products.length === 0) return "fallback";
    const topScore = products[0].ranking.score;
    const secondScore = products[1]?.ranking.score ?? -Infinity;
    const hasStrongLead = topScore >= 6 && (!products[1] || topScore - secondScore >= 1);
    const hasCompetitiveTopPair = Boolean(products[1] && topScore >= 5 && topScore - secondScore <= 1);
    if (hasStrongLead) return "featured";
    if (hasCompetitiveTopPair) return "comparison";
    return "list";
  }

  private buildSummary(query: RecommendationQuery, products: ProductRecommendation[]): RecommendationSummary {
    const appliedFilters = this.buildAppliedFilters(query);
    const presentationMode = this.determinePresentationMode(products);
    const headline = appliedFilters.length > 0 ? `Top picks for ${appliedFilters.join(", ")}` : "Top beauty picks for a broad recommendation request";
    const recommendationReason = products.length > 0
      ? "These picks were ranked for fit, reviews, and how well they align to the requested skin type, concerns, finish, and budget."
      : "No exact products matched every requested filter in the mock catalog.";
    const featuredProduct = products[0];
    return {
      headline,
      recommendationReason,
      appliedFilters,
      resultCount: products.length,
      presentationMode,
      featuredProductId: featuredProduct?.id || "",
      featuredReason: featuredProduct
        ? `${featuredProduct.productName} is the clearest overall match based on fit, review strength, and the requested filters.`
        : "",
      refinementHint: products.length > 0
        ? "Try a refinement if you want a lower price, a different finish, or a broader category mix."
        : "Broaden the search by relaxing one filter or switching to a wider concern.",
    };
  }
}

export default new GenieRecommendationService();
