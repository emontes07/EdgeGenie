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
      .filter((product) => product.ranking.score > 0 || (!query.skinType && query.concerns.length === 0 && !query.preference && !query.brand))
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
    return `${config.shopBaseUrl}/search?query=${encodeURIComponent(queryText)}`;
  }

  private toSearchableText(values: string[]): string[] {
    return values.map((value) => value.trim().toLowerCase()).filter(Boolean);
  }

  private findMatches(queryValues: string[], candidates: string[]): string[] {
    const normalizedCandidates = this.toSearchableText(candidates);
    return this.dedupe(
      queryValues.filter((queryValue) =>
        normalizedCandidates.some((candidate) => candidate.includes(queryValue) || queryValue.includes(candidate))
      )
    );
  }

  private buildMatchSource(product: ProductCatalogItem): string[] {
    return [
      product.category,
      product.subcategory,
      product.description,
      product.finish,
      product.keyIngredient,
      product.suggestedPitch,
      product.competitivePositioning,
      ...product.skinTypes,
      ...product.concerns,
      ...product.preferences,
      ...product.keyBenefits,
      ...product.retailerContext,
      ...product.bundleIdeas,
      ...product.talkingPoints,
      ...product.objectionHandling,
      ...product.seasonality,
      ...product.badges,
      ...product.tags,
    ];
  }

  private toSentenceList(values: string[], limit = 3): string {
    return values.slice(0, limit).join("; ");
  }

  private scoreProduct(product: ProductCatalogItem, query: RecommendationQuery): { score: number; signals: string[] } {
    let score = 0;
    const signals: string[] = [];
    const matchSource = this.buildMatchSource(product);

    if (query.skinType && product.skinTypes.includes(query.skinType)) {
      score += 2;
      signals.push(`${this.toTitleCase(query.skinType)} shopper relevance`);
    }

    if (query.finish && product.finish === query.finish) {
      score += 1;
      signals.push(`${this.toTitleCase(query.finish)} merchandising fit`);
    }

    if (query.preference) {
      const preferenceMatches = this.findMatches([query.preference], matchSource);
      if (preferenceMatches.length > 0) {
        score += 3;
        signals.push(...preferenceMatches.slice(0, 2).map((item) => `Focus: ${this.toTitleCase(item)}`));
      }
    }

    if (query.concerns.length > 0) {
      const concernMatches = this.findMatches(query.concerns, matchSource);
      if (concernMatches.length > 0) {
        score += concernMatches.length * 2;
        signals.push(...concernMatches.slice(0, 3).map((item) => this.toTitleCase(item)));
      }
    }

    if (query.brand && product.brand.toLowerCase() === query.brand) {
      score += 2;
      signals.push(`${product.brand} portfolio match`);
    }

    if (query.gender) {
      const isWomenFocused = ["women's razor", "women's shave gel", "women's grooming"].some((term) => product.subcategory.toLowerCase().includes(term));
      const genderSignals = query.gender.includes("female") || query.gender.includes("women")
        ? isWomenFocused
        : query.gender.includes("male") || query.gender.includes("men");
      if (genderSignals) {
        score += 1;
        signals.push("Audience-aligned assortment");
      }
    }

    score += Math.max(0, Math.round(product.rating - 4));

    return {
      score,
      signals: this.dedupe(signals),
    };
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
    const matchSource = this.buildMatchSource(product);
    const concernMatches = query.concerns.length > 0 ? this.findMatches(query.concerns, matchSource) : [];
    const preferenceMatches = query.preference ? this.findMatches([query.preference], matchSource) : [];
    const price = {
      current: product.price,
      original: product.originalPrice,
      currency: product.currency,
      formattedCurrent: this.formatMoney(product.price, product.currency),
      formattedOriginal: product.originalPrice > product.price ? this.formatMoney(product.originalPrice, product.currency) : "",
      savingsText: product.originalPrice > product.price ? `Save ${this.formatMoney(product.originalPrice - product.price, product.currency)}` : "",
    };

    const reasonParts: string[] = [];
    if (query.brand && product.brand.toLowerCase() === query.brand) {
      reasonParts.push(`anchors the ${product.brand} story`);
    }
    if (concernMatches.length > 0) {
      reasonParts.push(`supports ${concernMatches.slice(0, 2).join(" and ")}`);
    }
    if (preferenceMatches.length > 0) {
      reasonParts.push(`fits ${preferenceMatches.slice(0, 2).join(" and ")} execution`);
    }
    if (query.skinType && product.skinTypes.includes(query.skinType)) {
      reasonParts.push(`covers ${query.skinType} shopper needs`);
    }
    if (reasonParts.length === 0) {
      reasonParts.push("combines retailer fit, seasonality, and bundle potential");
    }

    return {
      id: product.id,
      productName: product.productName,
      brand: product.brand,
      category: product.subcategory,
      description: `${product.description} Best fit for ${product.retailerContext.join(", ")}.`,
      imageUrl: product.imageUrl,
      productUrl: product.productUrl,
      keyBenefits: product.keyBenefits,
      competitivePositioning: product.competitivePositioning,
      retailerContext: product.retailerContext,
      bundleIdeas: product.bundleIdeas,
      talkingPoints: product.talkingPoints,
      objectionHandling: product.objectionHandling,
      seasonality: product.seasonality,
      suggestedPitch: product.suggestedPitch,
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
        { title: "Talking Points", value: this.toSentenceList(product.talkingPoints, 2) },
        { title: "Why It Wins", value: product.competitivePositioning },
        { title: "Suggested Pitch", value: product.suggestedPitch },
        { title: "Bundle Idea", value: product.bundleIdeas[0] || "Use as a standalone focus item." },
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
      reasonSignalsText: isCompact ? "" : `Talking points: ${this.toSentenceList(product.talkingPoints)}`,
      sellingPointsText: product.keyBenefits.join(" • "),
      competitiveAngle: product.competitivePositioning,
      suggestedPitch: product.suggestedPitch,
      bundleIdea: product.bundleIdeas[0] || "",
      retailerContextText: `Retailer context: ${product.retailerContext.join(", ")}`,
      badgeLine: isCompact ? product.badges.slice(0, 1).join(" • ") : product.badges.join(" • "),
      tagLine: isCompact ? product.seasonality.slice(0, 2).join(" • ") : product.seasonality.join(" • "),
      priceText: product.price.formattedCurrent,
      originalPriceText: product.price.formattedOriginal,
      savingsText: product.price.savingsText,
      ratingText: `Retail fit score: ${product.rating.toFixed(1)}/5`,
      facts: isCompact ? product.facts.slice(0, 3) : product.facts,
      primaryActionTitle: "Open product brief",
      primaryActionUrl: product.productUrl,
      secondaryActionTitle: "See adjacent items",
      secondaryActionUrl: this.buildSearchUrl(`${product.brand} ${product.category}`),
      tertiaryActionTitle: "",
      tertiaryActionUrl: "",
    };
  }

  private createFeaturedDisplayItem(product: ProductRecommendation, summary: RecommendationSummary): DisplayItem {
    return {
      cardType: "featured",
      id: `featured-${product.id}`,
      eyebrow: "Featured sales lead",
      title: product.productName,
      subtitle: `${product.brand} • ${product.category}`,
      imageUrl: product.imageUrl,
      description: product.description,
      recommendationReason: product.recommendation.reasonShort,
      reasonSignalsText: product.recommendation.reasonDetail,
      sellingPointsText: product.keyBenefits.join(" • "),
      competitiveAngle: product.competitivePositioning,
      suggestedPitch: product.suggestedPitch,
      bundleIdea: product.bundleIdeas[0] || "",
      retailerContextText: `Retailer context: ${product.retailerContext.join(", ")}`,
      highlightLine: summary.featuredReason,
      badgeLine: product.badges.join(" • "),
      tagLine: product.seasonality.join(" • "),
      priceText: product.price.formattedCurrent,
      originalPriceText: product.price.formattedOriginal,
      savingsText: product.price.savingsText,
      ratingText: `Retail fit score: ${product.rating.toFixed(1)}/5`,
      facts: product.facts,
      primaryActionTitle: "Open featured brief",
      primaryActionUrl: product.productUrl,
      secondaryActionTitle: "Browse same brand",
      secondaryActionUrl: this.buildSearchUrl(`${product.brand} field sales pitch`),
      tertiaryActionTitle: summary.resultCount > 1 ? "See full set" : "",
      tertiaryActionUrl: summary.resultCount > 1 ? this.buildSearchUrl(summary.headline) : "",
    };
  }

  private createRecommendationsListDisplayItem(products: ProductRecommendation[], summary: RecommendationSummary): DisplayItem {
    return {
      cardType: "list",
      id: "recommendations-list",
      eyebrow: "At a glance",
      title: "Top sales recommendations",
      subtitle: `${products.length} seller option${products.length === 1 ? "" : "s"}`,
      description: summary.headline,
      recommendationReason: summary.recommendationReason,
      facts: products.map((product, index) => ({
        title: `#${index + 1}`,
        value: `${product.productName} • ${product.brand} • ${product.keyBenefits[0]} • ${product.suggestedPitch}`,
      })),
      tagLine: summary.appliedFilters.join(" • "),
      primaryActionTitle: "Browse full recommendation set",
      primaryActionUrl: this.buildSearchUrl(summary.headline),
      secondaryActionTitle: products[1] ? "Compare top 2" : "Open featured brief",
      secondaryActionUrl: products[1] ? this.buildSearchUrl(`${products[0].productName} versus ${products[1].productName}`) : products[0].productUrl,
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
      title: "Compare your top pitches",
      subtitle: summary.headline,
      comparisonReason: `${first.productName} leads on immediate fit, while ${second.productName} gives you an alternate angle on price pack, seasonality, or retailer context.`,
      leftTitle: first.productName,
      leftSubtitle: `${first.brand} • ${first.category}`,
      leftPriceText: first.price.formattedCurrent,
      leftReasonText: first.competitivePositioning,
      rightTitle: second.productName,
      rightSubtitle: `${second.brand} • ${second.category}`,
      rightPriceText: second.price.formattedCurrent,
      rightReasonText: second.competitivePositioning,
      primaryActionTitle: "Browse top pitches",
      primaryActionUrl: this.buildSearchUrl(summary.headline),
    };
  }

  private buildAppliedFilters(query: RecommendationQuery): string[] {
    const filters: string[] = [];
    if (query.brand) filters.push(`Brand: ${this.toTitleCase(query.brand)}`);
    if (query.concerns.length > 0) filters.push(...query.concerns.map((value) => this.toTitleCase(value)));
    if (query.preference) filters.push(`Focus: ${this.toTitleCase(query.preference)}`);
    if (query.skinType) filters.push(`Shopper: ${this.toTitleCase(query.skinType)}`);
    if (query.finish) filters.push(`Merchandising: ${this.toTitleCase(query.finish)}`);
    if (typeof query.maxPrice === "number") filters.push(`Under ${this.formatMoney(query.maxPrice)}`);
    if (typeof query.minPrice === "number") filters.push(`Over ${this.formatMoney(query.minPrice)}`);
    return filters;
  }

  private createFallbackDisplayItem(query: RecommendationQuery, refinements: Refinement[]): DisplayItem {
    return {
      cardType: "fallback",
      id: "fallback-no-results",
      title: "No exact sales match yet",
      subtitle: this.buildAppliedFilters(query).length > 0 ? `Tried filters: ${this.buildAppliedFilters(query).join(", ")}` : "Try a broader retailer or seasonal angle",
      description: "The current filters are likely too narrow for the mock Edgewell portfolio. Broadening the retailer, season, or bundle angle usually returns stronger sell-in ideas.",
      recommendationReason: "Try a broader brand story, a retailer-specific focus, or a seasonal event such as summer or back-to-school.",
      badgeLine: "Refine the pitch",
      tagLine: refinements.map((item) => item.label).join(" • "),
      primaryActionTitle: refinements[0]?.label || "Summer promotion ideas",
      primaryActionUrl: refinements[0]?.url || this.buildSearchUrl("summer promotion ideas"),
      secondaryActionTitle: refinements[1]?.label || "Back-to-school bundles",
      secondaryActionUrl: refinements[1]?.url || this.buildSearchUrl("back-to-school bundles"),
      tertiaryActionTitle: refinements[2]?.label || "",
      tertiaryActionUrl: refinements[2]?.url || "",
      facts: this.buildAppliedFilters(query).map((filter, index) => ({ title: index === 0 ? "Tried" : "", value: filter })),
    };
  }

  private createRefinements(query: RecommendationQuery): Refinement[] {
    const refinements: Refinement[] = [];

    if (query.brand) {
      refinements.push({
        id: "broader-brand-story",
        label: `See broader ${this.toTitleCase(query.brand)} story`,
        url: this.buildSearchUrl(`${query.brand} retail pitch`),
      });
    }

    if (query.preference) {
      refinements.push({
        id: "retailer-specific",
        label: `More for ${this.toTitleCase(query.preference)}`,
        url: this.buildSearchUrl(`${query.preference} talking points`),
      });
    }

    refinements.push(
      { id: "summer-promo", label: "Summer promotion ideas", url: this.buildSearchUrl("summer promotion sun care") },
      { id: "back-to-school", label: "Back-to-school bundles", url: this.buildSearchUrl("back-to-school bundles") },
      { id: "walmart-pitch", label: "Walmart talking points", url: this.buildSearchUrl("Walmart talking points") }
    );

    return refinements.slice(0, 3);
  }

  private createRefinementDisplayItem(summary: RecommendationSummary, refinements: Refinement[], query: RecommendationQuery, mode: "results" | "fallback"): DisplayItem {
    const isNoResults = mode === "fallback";
    return {
      cardType: "refinement",
      id: isNoResults ? "refinement-fallback" : "refinement-next-step",
      eyebrow: isNoResults ? "Broaden the sales angle" : "Refine this pitch",
      title: isNoResults ? "Try a broader sales path" : "Keep exploring",
      subtitle: this.buildAppliedFilters(query).join(" • ") || "Retailer, season, or bundle angle",
      description: isNoResults
        ? "These refinements broaden the request without losing the seller context."
        : "Use these quick pivots to shift the conversation by retailer, season, or bundle strategy.",
      recommendationReason: isNoResults ? "Broader retailer and seasonal pivots are the fastest way to recover a no-results search." : summary.refinementHint,
      tagLine: refinements.map((item) => item.label).join(" • "),
      facts: refinements.map((item, index) => ({ title: `Option ${index + 1}`, value: item.label })),
      primaryActionTitle: refinements[0]?.label || "Summer promotion ideas",
      primaryActionUrl: refinements[0]?.url || this.buildSearchUrl("summer promotion ideas"),
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
    const hasStrongLead = topScore >= 6 && (!products[1] || topScore - secondScore >= 2);
    const hasCompetitiveTopPair = Boolean(products[1] && topScore >= 5 && topScore - secondScore <= 1);
    if (hasStrongLead) return "featured";
    if (hasCompetitiveTopPair) return "comparison";
    return "list";
  }

  private buildSummary(query: RecommendationQuery, products: ProductRecommendation[]): RecommendationSummary {
    const appliedFilters = this.buildAppliedFilters(query);
    const presentationMode = this.determinePresentationMode(products);
    const headline = appliedFilters.length > 0
      ? `Edgewell sales ideas for ${appliedFilters.join(", ")}`
      : "Edgewell portfolio recommendations for a broad seller request";
    const recommendationReason = products.length > 0
      ? "These picks were ranked for retailer fit, seasonality, bundle potential, and how clearly they support a field sales conversation."
      : "No exact portfolio items matched every requested filter in the mock catalog.";
    const featuredProduct = products[0];
    return {
      headline,
      recommendationReason,
      appliedFilters,
      resultCount: products.length,
      presentationMode,
      featuredProductId: featuredProduct?.id || "",
      featuredReason: featuredProduct
        ? `${featuredProduct.productName} is the clearest lead because it combines a strong brand story, clear talking points, and practical retail execution.`
        : "",
      refinementHint: products.length > 0
        ? "Use a refinement if you want a different retailer angle, a more seasonal story, or a stronger bundle recommendation."
        : "Broaden the search by relaxing one filter or pivoting to a retailer or seasonal event.",
    };
  }
}

export default new GenieRecommendationService();
