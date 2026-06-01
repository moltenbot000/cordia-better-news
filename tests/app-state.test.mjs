import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  mergeArticles,
  parseArticlesFromBrutalistReport,
  parseSourcePreferences,
  parseStoredArticles,
} from "../public/app.js";

class TestElement {}
class TestAnchorElement extends TestElement {}
class TestUListElement extends TestElement {}

function createLink(title, href) {
  const link = new TestAnchorElement();
  link.textContent = title;
  link.href = href;
  return link;
}

function createItem(link, timeText) {
  return {
    textContent: `${link.textContent} [${timeText}]`,
    querySelector(selector) {
      return selector === "a[href]" ? link : null;
    },
  };
}

function createSection(source, items) {
  const list = new TestUListElement();
  list.querySelectorAll = (selector) => selector === "li" ? items : [];

  const heading = new TestElement();
  heading.textContent = source;
  heading.nextElementSibling = list;

  return { heading };
}

function installDomParser(sections) {
  global.HTMLElement = TestElement;
  global.HTMLAnchorElement = TestAnchorElement;
  global.HTMLUListElement = TestUListElement;
  global.DOMParser = class {
    parseFromString() {
      return {
        querySelectorAll(selector) {
          return selector === "h3" ? sections.map((section) => section.heading) : [];
        },
      };
    }
  };
}

test("parseArticlesFromBrutalistReport extracts non-paywalled articles sorted by publish date", () => {
  installDomParser([
    createSection("Slashdot", [
      createItem(createLink("Older Slashdot story", "https://slashdot.org/story/older"), "4h"),
      createItem(createLink("Newest Slashdot story", "https://slashdot.org/story/newer"), "1h"),
    ]),
    createSection("Bloomberg", [
      createItem(createLink("Paywalled story", "https://www.bloomberg.com/news/story"), "30m"),
    ]),
  ]);

  const articles = parseArticlesFromBrutalistReport(
    "<html></html>",
    new Date("2026-06-01T12:00:00.000Z"),
  );

  assert.deepEqual(
    articles.map((article) => article.title),
    ["Newest Slashdot story", "Older Slashdot story"],
  );
  assert.equal(articles[0].source, "Slashdot");
  assert.equal(articles[0].publishedAt, "2026-06-01T11:00:00.000Z");
});

test("parseArticlesFromBrutalistReport removes blocked news sources and their domains", () => {
  installDomParser([
    createSection("ABC News", [
      createItem(createLink("Blocked ABC story", "https://abcnews.go.com/story"), "15m"),
    ]),
    createSection("Hacker News", [
      createItem(createLink("Blocked CNBC story", "https://www.cnbc.com/2026/06/01/story.html"), "30m"),
      createItem(createLink("Allowed HN story", "https://example.com/story"), "45m"),
    ]),
    createSection("COIN DESK", [
      createItem(createLink("Blocked crypto story", "https://www.coindesk.com/story"), "1h"),
    ]),
  ]);

  const articles = parseArticlesFromBrutalistReport(
    "<html></html>",
    new Date("2026-06-01T12:00:00.000Z"),
  );

  assert.deepEqual(
    articles.map((article) => article.title),
    ["Allowed HN story"],
  );
});

test("parseArticlesFromBrutalistReport includes requested technology sources", () => {
  installDomParser([
    createSection("ArsTechnica", [
      createItem(createLink("Ars story", "https://arstechnica.com/story"), "10m"),
    ]),
    createSection("The Register", [
      createItem(createLink("Register story", "https://www.theregister.com/story"), "20m"),
    ]),
    createSection("Linux Weekly News", [
      createItem(createLink("LWN story", "https://lwn.net/story"), "30m"),
    ]),
    createSection("Techmeme", [
      createItem(createLink("Techmeme story", "https://www.techmeme.com/story"), "40m"),
    ]),
    createSection("Bleeping Computer", [
      createItem(createLink("Bleeping story", "https://www.bleepingcomputer.com/story"), "50m"),
    ]),
  ]);

  const articles = parseArticlesFromBrutalistReport(
    "<html></html>",
    new Date("2026-06-01T12:00:00.000Z"),
  );

  assert.deepEqual(
    articles.map((article) => article.source),
    ["ArsTechnica", "The Register", "Linux Weekly News", "Techmeme", "Bleeping Computer"],
  );
});

test("parseArticlesFromBrutalistReport keeps article ids stable across refreshes", () => {
  installDomParser([
    createSection("Slashdot", [
      createItem(createLink("Same Slashdot story", "https://slashdot.org/story/same"), "1h"),
    ]),
  ]);

  const first = parseArticlesFromBrutalistReport("<html></html>", new Date("2026-06-01T12:00:00.000Z"));
  const second = parseArticlesFromBrutalistReport("<html></html>", new Date("2026-06-01T12:01:00.000Z"));

  assert.equal(first[0].id, second[0].id);
});

test("parseStoredArticles returns valid articles sorted by publish date", () => {
  const stored = JSON.stringify([
    {
      id: "old",
      title: "Old",
      source: "Slashdot",
      url: "https://slashdot.org/old",
      publishedAt: "2026-06-01T10:00:00.000Z",
    },
    {
      id: "new",
      title: "New",
      source: "Slashdot",
      url: "https://slashdot.org/new",
      publishedAt: "2026-06-01T12:00:00.000Z",
    },
  ]);

  assert.deepEqual(parseStoredArticles(stored).map((article) => article.id), ["new", "old"]);
  assert.deepEqual(parseStoredArticles("{"), []);
});

test("mergeArticles deduplicates fetched articles and keeps newest 256", () => {
  const current = [
    {
      id: "same",
      title: "Same",
      source: "Slashdot",
      url: "https://slashdot.org/same",
      publishedAt: "2026-06-01T10:00:00.000Z",
    },
  ];
  const fetched = Array.from({ length: 257 }, (_, index) => ({
    id: index === 0 ? "same" : `new-${index}`,
    title: `New ${index}`,
    source: "Slashdot",
    url: `https://slashdot.org/new-${index}`,
    publishedAt: new Date(Date.UTC(2026, 5, 1, 12, 0, 0) - index * 60_000).toISOString(),
  }));

  const merged = mergeArticles(current, fetched);

  assert.equal(merged.length, 256);
  assert.equal(merged[0].id, "same");
  assert.equal(merged[0].publishedAt, "2026-06-01T12:00:00.000Z");
  assert.equal(merged.at(-1).id, "new-255");
});

test("parseArticlesFromBrutalistReport supports reader markdown fallback", () => {
  const articles = parseArticlesFromBrutalistReport(
    `
Markdown Content:
### [Slashdot](https://brutalist.report/source/slashdot)

*   [Newest Slashdot story](https://news.slashdot.org/story/newer) [15m]
*   [Older Slashdot story](https://news.slashdot.org/story/older) [2h]
`,
    new Date("2026-06-01T12:00:00.000Z"),
  );

  assert.deepEqual(
    articles.map((article) => article.publishedAt),
    ["2026-06-01T11:45:00.000Z", "2026-06-01T10:00:00.000Z"],
  );
  assert.equal(articles[0].source, "Slashdot");
});

test("parseSourcePreferences keeps boolean source choices only", () => {
  assert.deepEqual(parseSourcePreferences(JSON.stringify({ Slashdot: false, Wired: "yes" })), {
    Slashdot: false,
  });
  assert.deepEqual(parseSourcePreferences("{"), {});
});

test("served files do not render images", async () => {
  const servedFiles = ["public/app.js", "public/index.html", "public/humans.txt", "public/llm.txt"];

  for (const file of servedFiles) {
    const content = await readFile(file, "utf8");
    assert.doesNotMatch(content, /<img\b|createElement\("img"\)/i, file);
    assert.doesNotMatch(content, /App Template|starter/i, file);
  }
});

test("sources render in a minimizable panel", async () => {
  const html = await readFile("public/index.html", "utf8");
  const css = await readFile("public/global.css", "utf8");

  assert.match(html, /<details class="source-panel" open>/);
  assert.match(html, /<summary class="section-heading">/);
  assert.match(html, /<div class="source-list" id="source-list"><\/div>/);
  assert.match(css, /\.source-panel:not\(\[open\]\) > \.source-list\s*{/);
});
