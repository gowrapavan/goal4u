export interface NewsArticle {
  title: string;
  description: string;
  urlToImage: string;
  url: string;
  publishedAt: string;
  source: { name: string };
  author?: string;
}
