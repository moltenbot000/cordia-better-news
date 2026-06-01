import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
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
