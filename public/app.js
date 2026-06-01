// Google Analytics default capture for this template.
// Future LLM edits: do not remove this gtag setup unless replacing it with equivalent page analytics capture.
const googleAnalyticsId = "G-ZKTPLMMFDQ";
const articleStorageKey = "black-report-articles";
const sourceStorageKey = "black-report-sources";
const maxArticleCount = 256;
const refreshIntervalMs = 60_000;
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
function getElement(selector, type) {
    const element = document.querySelector(selector);
    if (!(element instanceof type)) {
        throw new Error(`Missing required element: ${selector}`);
    }
    return element;
}
function getElements() {
    return {
        articleCount: getElement("#article-count", HTMLElement),
        articleList: getElement("#article-list", HTMLOListElement),
        feedStatus: getElement("#feed-status", HTMLElement),
        refreshButton: getElement("#refresh-feed", HTMLButtonElement),
        sourceList: getElement("#source-list", HTMLElement),
    };
}
function createId(source, title, url) {
    return `${source}:${title}:${url}`.toLowerCase();
}
function parseRelativeDate(value, now = new Date()) {
    const match = value.trim().match(/^(\d+)\s*([mhdw])$/i);
    const date = new Date(now);
    if (!match)
        return date.toISOString();
    const amount = Number(match[1]);
    const unit = match[2]?.toLowerCase();
    const multipliers = {
        m: 60_000,
        h: 3_600_000,
        d: 86_400_000,
        w: 604_800_000,
    };
    date.setTime(date.getTime() - amount * (multipliers[unit ?? "m"] ?? 60_000));
    return date.toISOString();
}
function getHost(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    }
    catch {
        return "";
    }
}
function isPaywalled(source, url) {
    const normalizedSource = source.trim().toLowerCase();
    const host = getHost(url);
    return paywalledSources.has(normalizedSource) || paywalledHosts.some((paywallHost) => host.endsWith(paywallHost));
}
export function parseArticlesFromBrutalistReport(html, now = new Date()) {
    if (html.includes("Markdown Content:")) {
        return parseArticlesFromMarkdown(html, now);
    }
    const document = new DOMParser().parseFromString(html, "text/html");
    const articles = [];
    document.querySelectorAll("h3").forEach((heading) => {
        const source = heading.textContent?.trim();
        const list = heading.nextElementSibling;
        if (!source || !(list instanceof HTMLUListElement) || paywalledSources.has(source.toLowerCase()))
            return;
        list.querySelectorAll("li").forEach((item) => {
            const link = item.querySelector("a[href]");
            if (!(link instanceof HTMLAnchorElement))
                return;
            const title = link.textContent?.trim();
            const relativeDate = item.textContent?.match(/\[(\d+\s*[mhdw])\]/i)?.[1];
            const url = link.href;
            if (!title || !relativeDate || isPaywalled(source, url))
                return;
            const publishedAt = parseRelativeDate(relativeDate, now);
            articles.push({
                id: createId(source, title, url),
                title,
                source,
                url,
                publishedAt,
            });
        });
    });
    return articles.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
function parseArticlesFromMarkdown(markdown, now = new Date()) {
    const articles = [];
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
            id: createId(source, articleMatch[1], articleMatch[2]),
            title: articleMatch[1],
            source,
            url: articleMatch[2],
            publishedAt,
        });
    });
    return articles.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}
function isArticle(value) {
    if (!value || typeof value !== "object")
        return false;
    const article = value;
    return (typeof article.id === "string" &&
        typeof article.title === "string" &&
        typeof article.source === "string" &&
        typeof article.url === "string" &&
        typeof article.publishedAt === "string");
}
export function parseStoredArticles(storedArticles) {
    if (!storedArticles)
        return [];
    try {
        const parsed = JSON.parse(storedArticles);
        return Array.isArray(parsed) && parsed.every(isArticle)
            ? limitArticles(parsed.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)))
            : [];
    }
    catch {
        return [];
    }
}
export function parseSourcePreferences(storedPreferences) {
    if (!storedPreferences)
        return {};
    try {
        const parsed = JSON.parse(storedPreferences);
        return Object.fromEntries(Object.entries(parsed).filter((entry) => typeof entry[0] === "string" && typeof entry[1] === "boolean"));
    }
    catch {
        return {};
    }
}
function getSources(articles) {
    return [...new Set(articles.map((article) => article.source))].sort((a, b) => a.localeCompare(b));
}
function isSourceEnabled(source, preferences) {
    return preferences[source] ?? false;
}
function filteredArticles(articles, preferences) {
    return limitArticles(articles
        .filter((article) => isSourceEnabled(article.source, preferences))
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)));
}
function limitArticles(articles) {
    return articles.slice(0, maxArticleCount);
}
export function mergeArticles(currentArticles, fetchedArticles) {
    const merged = new Map();
    currentArticles.forEach((article) => {
        merged.set(article.id, article);
    });
    fetchedArticles.forEach((article) => {
        merged.set(article.id, article);
    });
    return limitArticles([...merged.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)));
}
function syncSourcePreferences(preferences, articles) {
    let changed = false;
    getSources(articles).forEach((source) => {
        if (!(source in preferences)) {
            preferences[source] = false;
            changed = true;
        }
    });
    if (changed) {
        localStorage.setItem(sourceStorageKey, JSON.stringify(preferences));
    }
}
async function fetchFeedText() {
    for (const url of feedUrls) {
        try {
            const response = await fetch(url, { cache: "no-store" });
            if (response.ok)
                return await response.text();
        }
        catch {
            continue;
        }
    }
    throw new Error("Unable to load Brutalist Report");
}
function formatPublishedAt(value) {
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
function renderSources(elements, articles, preferences, onChange) {
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
function renderArticles(elements, articles) {
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
    let isRefreshing = false;
    function render(status = "Cached") {
        syncSourcePreferences(preferences, articles);
        const visibleArticles = filteredArticles(articles, preferences);
        renderSources(elements, articles, preferences, () => render("Saved"));
        renderArticles(elements, visibleArticles);
        elements.feedStatus.textContent = status;
        renderIconSet();
    }
    async function refreshArticles({ silent = false } = {}) {
        if (isRefreshing)
            return;
        isRefreshing = true;
        if (!silent) {
            elements.feedStatus.textContent = "Loading";
            elements.refreshButton.disabled = true;
        }
        try {
            const html = await fetchFeedText();
            articles = mergeArticles(articles, parseArticlesFromBrutalistReport(html));
            localStorage.setItem(articleStorageKey, JSON.stringify(articles));
            render("Updated");
        }
        catch {
            render(articles.length > 0 ? "Offline" : "Unavailable");
        }
        finally {
            isRefreshing = false;
            if (!silent) {
                elements.refreshButton.disabled = false;
            }
            renderIconSet();
        }
    }
    elements.refreshButton.addEventListener("click", () => {
        void refreshArticles();
    });
    render(articles.length > 0 ? "Cached" : "Loading");
    void refreshArticles();
    window.setInterval(() => {
        void refreshArticles({ silent: true });
    }, refreshIntervalMs);
}
if (typeof document !== "undefined") {
    initializeApp();
}
