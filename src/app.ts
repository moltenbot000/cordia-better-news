// Google Analytics default capture for this template.
// Future LLM edits: do not remove this gtag setup unless replacing it with equivalent page analytics capture.
const googleAnalyticsId = "G-ZKTPLMMFDQ";
const articleStorageKey = "black-report-articles";
const sourceStorageKey = "black-report-sources";
const directFeedUrl = "https://brutalist.report/";
const feedUrls = [
  `https://r.jina.ai/http://r.jina.ai/http://${directFeedUrl}`,
  `https://api.allorigins.win/raw?url=${encodeURIComponent(directFeedUrl)}`,
];

const paywalledSources = new Set([
  "barron's",
  "bloomberg",
  "financial times",
  "mit technology review",
  "new york times",
  "the atlantic",
  "the economist",
  "the information",
  "the new yorker",
  "the wall street journal",
  "washington post",
  "wired",
]);

const paywalledHosts = [
  "barrons.com",
  "bloomberg.com",
  "economist.com",
  "ft.com",
  "newyorker.com",
  "nytimes.com",
  "technologyreview.com",
  "theatlantic.com",
  "theinformation.com",
  "washingtonpost.com",
  "wired.com",
  "wsj.com",
];

export interface Article {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
}

type SourcePreferences = Record<string, boolean>;

interface AppElements {
  articleCount: HTMLElement;
  articleList: HTMLOListElement;
  feedStatus: HTMLElement;
  refreshButton: HTMLButtonElement;
  sourceList: HTMLElement;
}

interface LucideWindow {
  createIcons?: (options?: { attrs?: Record<string, string> }) => void;
}

declare global {
  interface Window {
    dataLayer?: IArguments[];
    gtag?: (...args: unknown[]) => void;
    lucide?: LucideWindow;
  }
}

function initializeGoogleAnalytics() {
  const googleTagScript = document.createElement("script");
  googleTagScript.async = true;
  googleTagScript.src = `https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsId}`;
  document.head.append(googleTagScript);

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer?.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", googleAnalyticsId);
}

function getElement<T extends Element>(selector: string, type: { new (): T }): T {
  const element = document.querySelector(selector);
  if (!(element instanceof type)) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

function getElements(): AppElements {
  return {
    articleCount: getElement("#article-count", HTMLElement),
    articleList: getElement("#article-list", HTMLOListElement),
    feedStatus: getElement("#feed-status", HTMLElement),
    refreshButton: getElement("#refresh-feed", HTMLButtonElement),
    sourceList: getElement("#source-list", HTMLElement),
  };
}

function createId(source: string, title: string, publishedAt: string) {
  return `${source}:${title}:${publishedAt}`.toLowerCase();
}

function parseRelativeDate(value: string, now = new Date()): string {
  const match = value.trim().match(/^(\d+)\s*([mhdw])$/i);
  const date = new Date(now);

  if (!match) return date.toISOString();

  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  const multipliers: Record<string, number> = {
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };

  date.setTime(date.getTime() - amount * (multipliers[unit ?? "m"] ?? 60_000));
  return date.toISOString();
}

function getHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isPaywalled(source: string, url: string) {
  const normalizedSource = source.trim().toLowerCase();
  const host = getHost(url);
  return paywalledSources.has(normalizedSource) || paywalledHosts.some((paywallHost) => host.endsWith(paywallHost));
}

export function parseArticlesFromBrutalistReport(html: string, now = new Date()): Article[] {
  if (html.includes("Markdown Content:")) {
    return parseArticlesFromMarkdown(html, now);
  }

  const document = new DOMParser().parseFromString(html, "text/html");
  const articles: Article[] = [];

  document.querySelectorAll("h3").forEach((heading) => {
    const source = heading.textContent?.trim();
    const list = heading.nextElementSibling;

    if (!source || !(list instanceof HTMLUListElement) || paywalledSources.has(source.toLowerCase())) return;

    list.querySelectorAll("li").forEach((item) => {
      const link = item.querySelector("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;

      const title = link.textContent?.trim();
      const relativeDate = item.textContent?.match(/\[(\d+\s*[mhdw])\]/i)?.[1];
      const url = link.href;

      if (!title || !relativeDate || isPaywalled(source, url)) return;

      const publishedAt = parseRelativeDate(relativeDate, now);
      articles.push({
        id: createId(source, title, publishedAt),
        title,
        source,
        url,
        publishedAt,
      });
    });
  });

  return articles.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

function parseArticlesFromMarkdown(markdown: string, now = new Date()): Article[] {
  const articles: Article[] = [];
  let source = "";

  markdown.split("\n").forEach((line) => {
    const sourceMatch = line.match(/^###\s+\[([^\]]+)\]\(https?:\/\/brutalist\.report\/source\//i);
    if (sourceMatch?.[1]) {
      source = sourceMatch[1].trim();
      return;
    }

    const articleMatch = line.match(/^\*\s+\[(.+)\]\((https?:\/\/[^)]+)\)\s+\[(\d+\s*[mhdw])\]/i);
    if (!source || !articleMatch?.[1] || !articleMatch[2] || !articleMatch[3] || isPaywalled(source, articleMatch[2])) {
      return;
    }

    const publishedAt = parseRelativeDate(articleMatch[3], now);
    articles.push({
      id: createId(source, articleMatch[1], publishedAt),
      title: articleMatch[1],
      source,
      url: articleMatch[2],
      publishedAt,
    });
  });

  return articles.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

function isArticle(value: unknown): value is Article {
  if (!value || typeof value !== "object") return false;
  const article = value as Record<string, unknown>;
  return (
    typeof article.id === "string" &&
    typeof article.title === "string" &&
    typeof article.source === "string" &&
    typeof article.url === "string" &&
    typeof article.publishedAt === "string"
  );
}

export function parseStoredArticles(storedArticles: string | null): Article[] {
  if (!storedArticles) return [];

  try {
    const parsed = JSON.parse(storedArticles) as unknown;
    return Array.isArray(parsed) && parsed.every(isArticle)
      ? parsed.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      : [];
  } catch {
    return [];
  }
}

export function parseSourcePreferences(storedPreferences: string | null): SourcePreferences {
  if (!storedPreferences) return {};

  try {
    const parsed = JSON.parse(storedPreferences) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, boolean] => typeof entry[0] === "string" && typeof entry[1] === "boolean",
      ),
    );
  } catch {
    return {};
  }
}

function getSources(articles: Article[]) {
  return [...new Set(articles.map((article) => article.source))].sort((a, b) => a.localeCompare(b));
}

function isSourceEnabled(source: string, preferences: SourcePreferences) {
  return preferences[source] ?? true;
}

function filteredArticles(articles: Article[], preferences: SourcePreferences) {
  return articles
    .filter((article) => isSourceEnabled(article.source, preferences))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

async function fetchFeedText(): Promise<string> {
  for (const url of feedUrls) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return await response.text();
    } catch {
      continue;
    }
  }

  throw new Error("Unable to load Brutalist Report");
}

function formatPublishedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function renderIconSet() {
  window.lucide?.createIcons?.({
    attrs: {
      "aria-hidden": "true",
      "stroke-width": "1.75",
    },
  });
}

function renderSources(elements: AppElements, articles: Article[], preferences: SourcePreferences, onChange: () => void) {
  elements.sourceList.replaceChildren();

  getSources(articles).forEach((source) => {
    const label = document.createElement("label");
    label.className = "source-toggle";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = isSourceEnabled(source, preferences);
    input.addEventListener("change", () => {
      preferences[source] = input.checked;
      localStorage.setItem(sourceStorageKey, JSON.stringify(preferences));
      onChange();
    });

    const icon = document.createElement("i");
    icon.dataset.lucide = input.checked ? "check" : "minus";

    const name = document.createElement("span");
    name.textContent = source;

    label.append(input, icon, name);
    elements.sourceList.append(label);
  });
}

function renderArticles(elements: AppElements, articles: Article[]) {
  elements.articleList.replaceChildren();
  elements.articleCount.textContent = String(articles.length);

  if (articles.length === 0) {
    const emptyState = document.createElement("li");
    emptyState.className = "empty-state";
    emptyState.textContent = "No articles";
    elements.articleList.append(emptyState);
    return;
  }

  articles.forEach((article) => {
    const row = document.createElement("li");
    row.className = "article-row";

    const link = document.createElement("a");
    link.href = article.url;
    link.rel = "noopener noreferrer";
    link.textContent = article.title;

    const meta = document.createElement("div");
    meta.className = "article-meta";

    const source = document.createElement("span");
    source.textContent = article.source;

    const time = document.createElement("time");
    time.dateTime = article.publishedAt;
    time.textContent = formatPublishedAt(article.publishedAt);

    meta.append(source, time);
    row.append(link, meta);
    elements.articleList.append(row);
  });
}

function initializeApp() {
  initializeGoogleAnalytics();

  const elements = getElements();
  let articles = parseStoredArticles(localStorage.getItem(articleStorageKey));
  const preferences = parseSourcePreferences(localStorage.getItem(sourceStorageKey));

  function render(status = "Cached") {
    const visibleArticles = filteredArticles(articles, preferences);
    renderSources(elements, articles, preferences, () => render("Saved"));
    renderArticles(elements, visibleArticles);
    elements.feedStatus.textContent = status;
    renderIconSet();
  }

  async function refreshArticles() {
    elements.feedStatus.textContent = "Loading";
    elements.refreshButton.disabled = true;

    try {
      const html = await fetchFeedText();
      articles = parseArticlesFromBrutalistReport(html);
      localStorage.setItem(articleStorageKey, JSON.stringify(articles));
      render("Updated");
    } catch {
      render(articles.length > 0 ? "Offline" : "Unavailable");
    } finally {
      elements.refreshButton.disabled = false;
      renderIconSet();
    }
  }

  elements.refreshButton.addEventListener("click", () => {
    void refreshArticles();
  });

  render(articles.length > 0 ? "Cached" : "Loading");
  void refreshArticles();
}

if (typeof document !== "undefined") {
  initializeApp();
}
