import { describe, expect, it } from "vitest";

import { escapeHtml, textToHtml } from "@/lib/html";

describe("escapeHtml", () => {
  it("escapes all HTML metacharacters", () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">&`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;"
    );
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Aminath Waheeda — Perx × Café")).toBe("Aminath Waheeda — Perx × Café");
  });
});

describe("textToHtml", () => {
  it("escapes then converts newlines to <br/>", () => {
    expect(textToHtml("Hi <b>there</b>\r\nBye\nNow")).toBe(
      "Hi &lt;b&gt;there&lt;/b&gt;<br/>Bye<br/>Now"
    );
  });
});
