/**
 * Round-trip and rendering tests for the markdown editor's math nodes
 * (TipTapMath.ts): `$$...$$` display math and `$...$` inline math should
 * parse into KaTeX-rendered atoms and serialise back byte-stable, while
 * plain-text dollar amounts must not be misparsed as math.
 */

import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import { StarterKit } from "@tiptap/starter-kit";
import { MathBlock, MathInline } from "./TipTapMath";
import { installMarkdownSerializerPatch } from "./tiptapMarkdownPatches";

installMarkdownSerializerPatch();

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
});

function makeEditor(markdown: string): Editor {
  return new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit.configure({ link: false }), MathBlock, MathInline, Markdown],
    content: markdown,
    contentType: "markdown",
  });
}

function roundTrip(markdown: string): string {
  editor = makeEditor(markdown);
  const out = editor.getMarkdown().trim();
  editor.destroy();
  editor = null;
  return out;
}

describe("MathBlock", () => {
  it("round-trips display math", () => {
    expect(roundTrip("$$\nx^2 + y^2 = z^2\n$$")).toBe("$$\nx^2 + y^2 = z^2\n$$");
  });

  it("renders KaTeX output, not literal text", () => {
    editor = makeEditor("$$\nx^2\n$$");
    const math = editor.view.dom.querySelector(".md-math-block .katex");
    expect(math).not.toBeNull();
    expect(editor.view.dom.textContent).not.toContain("$$");
  });

  it("renders KaTeX's own error span for an invalid expression, without throwing", () => {
    editor = makeEditor("$$\n\\frac{1\n$$");
    const error = editor.view.dom.querySelector(".md-math-block .katex-error");
    expect(error).not.toBeNull();
  });
});

describe("MathInline", () => {
  it("round-trips inline math within prose", () => {
    expect(roundTrip("area is $x^2$ here")).toBe("area is $x^2$ here");
  });

  it("renders KaTeX output for inline math", () => {
    editor = makeEditor("cost is $x+1$ units");
    expect(editor.view.dom.querySelector(".md-math-inline .katex")).not.toBeNull();
  });

  it("does not misparse plain currency as math", () => {
    // No closing "$" with valid math content on either side — stays plain text.
    expect(roundTrip("it costs $5")).toBe("it costs $5");
    expect(roundTrip("between $5 and $10")).toBe("between $5 and $10");
  });
});
