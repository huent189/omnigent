// KaTeX-backed math nodes for the markdown file editor.
//
// @tiptap/markdown (marked.js under the hood) has no notion of `$...$` /
// `$$...$$` math delimiters — without this extension they render as literal
// text (the bug this fixes). Two atom nodes claim the syntax via a custom
// `markdownTokenizer` (see the ``registerTokenizer`` path in
// @tiptap/markdown), store the raw LaTeX source in an attr, and render it
// through KaTeX in the node view. Serialisation reads the attr straight back
// into `$$...$$` / `$...$` — byte-stable modulo whitespace trimming inside
// the block form.
//
// KaTeX's own stylesheet is already loaded globally for chat-message math
// (see web/src/main.tsx), so `.katex`/`.katex-display` sizing rules apply
// here for free; only the wrapper/selection styling lives in index.css.

import { Node, type MarkdownToken } from "@tiptap/core";
import katex from "katex";

/**
 * Render LaTeX source into a KaTeX DOM element.
 *
 * Never throws: a malformed expression renders as dimmed plain text instead
 * of crashing the node view (matches KaTeX's own ``throwOnError: false``
 * philosophy, but we also need a container to hang the error styling off).
 *
 * :param latex: Raw LaTeX source, e.g. ``"x^2 + y^2 = z^2"``.
 * :param displayMode: Block (centered, own line) vs inline rendering.
 * :returns: A ``div``/``span`` element containing the rendered math.
 */
function renderKatex(latex: string, displayMode: boolean): HTMLElement {
  const el = document.createElement(displayMode ? "div" : "span");
  el.className = displayMode ? "md-math-block" : "md-math-inline";
  try {
    katex.render(latex, el, { throwOnError: false, displayMode });
  } catch {
    el.textContent = latex;
    el.classList.add("md-math-error");
  }
  return el;
}

/** Matches `$$...$$` opening at the start of a line (own line or inline). */
const BLOCK_START = /(^|\n)\$\$/;
const BLOCK_TOKEN = /^\$\$([\s\S]+?)\$\$(?:\n|$)/;

/**
 * Matches inline `$...$`, rejecting `$$` and requiring non-space content on
 * both edges — the same heuristic Pandoc/Typora use to avoid swallowing
 * currency amounts (`$5`, `$5 to $10`) as math.
 */
const INLINE_TOKEN = /^\$(?!\$)([^\s$](?:[^$\n]*[^\s$])?)\$(?!\$)/;

/** Display math: `$$ ... $$`, its own block, centered. */
export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: { default: "", rendered: false },
    };
  },

  parseHTML() {
    // Never created from pasted HTML — only from markdown parse below.
    return [];
  },

  renderHTML() {
    return ["div", { "data-math-block": "true" }];
  },

  addNodeView() {
    return ({ node: initialNode }) => {
      let currentNode = initialNode;
      const dom = renderKatex((currentNode.attrs.latex as string) ?? "", true);
      return {
        dom,
        // A latex change destroys+recreates via the `false` return (mirrors
        // the workspace-image node view's src-change handling) rather than
        // re-rendering in place — simplest correct option for an atom whose
        // only content is its render.
        update(newNode) {
          if (newNode.type !== currentNode.type) return false;
          if (newNode.attrs.latex !== currentNode.attrs.latex) return false;
          currentNode = newNode;
          return true;
        },
      };
    };
  },

  markdownTokenizer: {
    name: "mathBlock",
    level: "block",
    start(src: string) {
      const match = BLOCK_START.exec(src);
      return match ? match.index + match[1].length : -1;
    },
    tokenize(src: string): MarkdownToken | undefined {
      const match = BLOCK_TOKEN.exec(src);
      if (!match) return undefined;
      return { type: "mathBlock", raw: match[0], latex: match[1].trim() };
    },
  },

  parseMarkdown: (token, helpers) =>
    helpers.createNode("mathBlock", { latex: (token.latex as string) ?? "" }, []),

  renderMarkdown: (node) => `$$\n${(node.attrs?.latex as string) ?? ""}\n$$`,
});

/** Inline math: `$...$`. */
export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: { default: "", rendered: false },
    };
  },

  parseHTML() {
    return [];
  },

  renderHTML() {
    return ["span", { "data-math-inline": "true" }];
  },

  addNodeView() {
    return ({ node: initialNode }) => {
      let currentNode = initialNode;
      const dom = renderKatex((currentNode.attrs.latex as string) ?? "", false);
      return {
        dom,
        update(newNode) {
          if (newNode.type !== currentNode.type) return false;
          if (newNode.attrs.latex !== currentNode.attrs.latex) return false;
          currentNode = newNode;
          return true;
        },
      };
    };
  },

  markdownTokenizer: {
    name: "mathInline",
    level: "inline",
    start(src: string) {
      return src.indexOf("$");
    },
    tokenize(src: string): MarkdownToken | undefined {
      const match = INLINE_TOKEN.exec(src);
      if (!match) return undefined;
      return { type: "mathInline", raw: match[0], latex: match[1] };
    },
  },

  parseMarkdown: (token, helpers) =>
    helpers.createNode("mathInline", { latex: (token.latex as string) ?? "" }, []),

  renderMarkdown: (node) => `$${(node.attrs?.latex as string) ?? ""}$`,
});
