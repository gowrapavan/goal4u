import { NewsArticle } from '../types/news';

export async function fetchNews(page = 1, accumulatedArticles: NewsArticle[] = []): Promise<NewsArticle[]> {
  try {
    const res = await fetch(`/api/news?page=${page}`);
    if (!res.ok) return accumulatedArticles;
    
    const contentType = res.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
       console.error("News proxy returned non-JSON response");
       return accumulatedArticles;
    }

    const data = await res.json();
    const articles = data.articles?.filter((article: any) => article.title && article.url && !article.title.includes('[Removed]')) || [];
    const newAccumulated = [...accumulatedArticles, ...articles];
    
    const uniqueArticles: NewsArticle[] = [];
    const seenTitles = new Set<string>();
    const seenUrls = new Set<string>();

    for (const article of newAccumulated) {
      const normalizedTitle = article.title.trim().toLowerCase();
      const normalizedUrl = article.url.split('?')[0];

      if (!seenTitles.has(normalizedTitle) && !seenUrls.has(normalizedUrl)) {
        seenTitles.add(normalizedTitle);
        seenUrls.add(normalizedUrl);
        uniqueArticles.push(article);
      }
    }
    
    // We want at least 40 articles. If we don't have enough and we haven't reached page 3, fetch more.
    if (uniqueArticles.length < 40 && page < 3 && articles.length > 0) {
      return fetchNews(page + 1, uniqueArticles);
    }
    
    return uniqueArticles;
  } catch (error) {
    console.error("Failed to fetch news from proxy", error);
    return accumulatedArticles;
  }
}
