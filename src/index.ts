/**
 * Moji Splitter
 * Flexible text splitting utility for CSS animations.
 * Supports complex line breaking rules (ja: Kinsoku shori).
 *
 * @version 3.1.6
 * @author Yusuke Kamiyamane
 * @license MIT
 * @copyright Copyright (c) Yusuke Kamiyamane
 * @see {@link https://github.com/y14e/moji-splitter}
 */

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface MojiSplitterOptions {
  concatChar: boolean;
  noInlineStyle: boolean;
  noLineBreakingRules: boolean;
  wordSegmenter: boolean;
}

type Granularity = 'word' | 'char';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const NOBR_RE =
  /[[[\P{scx=Han}]&&[\P{scx=Hang}]&&[\P{scx=Hira}]&&[\P{scx=Kana}]&&[\p{L}]]!-,.->@\[-`\{-~\u00A0]+/gv;
const LBR_PROHIBIT_START_RE =
  /^[[[\p{Pd}]--[―]]\p{Pe}\p{Pf}\p{Po}\u00A0々〵〻ぁぃぅぇぉっゃゅょゎゕゖ゛-ゞァィゥェォッャュョヮヵヶー-ヾㇰ-ㇿ]|\p{Pi}/v;
const LBR_PROHIBIT_END_RE = /[\p{Pf}\p{Pi}\p{Ps}\p{Sc}\u00A0]$/u;
const LBR_INSEPARATABLE_RE = /[―‥…]/u;
const VISUALLY_HIDDEN_CSS = `border: 0; clip: rect(0, 0, 0, 0); height: 1px; margin: -1px; overflow: hidden; padding: 0; position: absolute; user-select: none; white-space: nowrap; width: 1px;`;

// -----------------------------------------------------------------------------
// APIs
// -----------------------------------------------------------------------------

export function createMojiSplitter(
  root: HTMLElement,
  options: Partial<MojiSplitterOptions> = {},
): () => void {
  if (!(root instanceof HTMLElement)) {
    console.warn('Invalid root element');
    return () => {};
  }

  const splitter = new MojiSplitter(root, options);
  return () => splitter.destroy();
}

// -----------------------------------------------------------------------------
// Core
// -----------------------------------------------------------------------------

class MojiSplitter {
  #rootElement: HTMLElement;
  #defaults = {
    concatChar: false,
    noInlineStyle: false,
    noLineBreakingRules: false,
    wordSegmenter: false,
  };
  #settings: MojiSplitterOptions;
  #wordElements: HTMLElement[] = [];
  #charElements: HTMLElement[] = [];
  #original: string | null;
  #fragment: DocumentFragment | null = null;
  #segmenter: Intl.Segmenter | null = new Intl.Segmenter();
  #isDestroyed = false;

  constructor(root: HTMLElement, options: Partial<MojiSplitterOptions> = {}) {
    this.#rootElement = root;
    this.#settings = this.#resolveOptions(this.#defaults, options);
    this.#original = this.#rootElement.innerHTML;
    this.#initialize();
  }

  destroy(): void {
    if (this.#isDestroyed) {
      return;
    }

    this.#isDestroyed = true;
    this.#rootElement.removeAttribute('data-moji-splitter-initialized');
    this.#rootElement.innerHTML = this.#original ?? '';
    const style = this.#rootElement.style;
    style.removeProperty('--word-count');
    style.removeProperty('--char-count');
    this.#cleanup();
    this.#original = null;
  }

  #initialize(): void {
    const children = this.#rootElement.childNodes;
    this.#fragment = new DocumentFragment();

    for (let i = 0, l = children.length; i < l; i++) {
      const child = children[i];

      if (!child) {
        continue;
      }

      this.#fragment.appendChild(child.cloneNode(true));
    }

    this.#applyNonBreakingRules();
    this.#split('word');
    const { concatChar, noLineBreakingRules } = this.#settings;
    !concatChar && !noLineBreakingRules && this.#applyLineBreakingRules('word');
    this.#split('char');
    concatChar && !noLineBreakingRules && this.#applyLineBreakingRules('char');

    for (let i = 0, l = this.#charElements.length; i < l; i++) {
      const char = this.#charElements[i];

      if (!char) {
        continue;
      }

      char.setAttribute('aria-hidden', 'true');
      char.style.setProperty('--char-index', String(i));
    }

    if (!this.#settings.noInlineStyle) {
      const spans = this.#fragment.querySelectorAll<HTMLElement>(
        ':is([data-word], [data-char]):not([data-whitespace])',
      );

      for (let i = 0, l = spans.length; i < l; i++) {
        const span = spans[i];

        if (!span) {
          continue;
        }

        const { style } = span;
        style.setProperty('display', 'inline-block');
        Array.from(
          (this.#segmenter ?? new Intl.Segmenter()).segment(span.textContent),
        ).length && style.setProperty('white-space', 'nowrap');
      }
    }

    for (let i = 0, l = this.#wordElements.length; i < l; i++) {
      const word = this.#wordElements[i];

      if (!word) {
        continue;
      }

      word.translate = false;
      word.style.setProperty('--word-index', String(i));

      if (!word.hasAttribute('data-whitespace')) {
        const alt = document.createElement('span');
        alt.setAttribute('data-alt', '');

        if (!this.#settings.noInlineStyle) {
          alt.style.cssText += VISUALLY_HIDDEN_CSS;
        }

        alt.textContent = word.textContent;
        word.append(alt);
      }
    }

    this.#rootElement.replaceChildren(...this.#fragment.childNodes);
    const { style } = this.#rootElement;
    style.setProperty('--word-count', String(this.#wordElements.length));
    style.setProperty('--char-count', String(this.#charElements.length));
    const whitespaces = this.#rootElement.querySelectorAll<HTMLElement>(
      ':scope > :not([data-word]) [data-char][data-whitespace]',
    );

    for (let i = 0, l = whitespaces.length; i < l; i++) {
      const whitespace = whitespaces[i];

      if (!whitespace) {
        continue;
      }

      if (
        window.getComputedStyle(whitespace).getPropertyValue('display') !==
        'inline'
      ) {
        whitespace.innerHTML = '&nbsp;';
      }
    }

    this.#cleanup();
    this.#rootElement.setAttribute('data-moji-splitter-initialized', '');
  }

  #applyNonBreakingRules(
    node: Node = this.#fragment ?? new DocumentFragment(),
  ): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;

      if (!text || !NOBR_RE.test(text)) {
        return;
      }

      NOBR_RE.lastIndex = 0;
      let lastIndex = 0;
      const fragment = document.createDocumentFragment();

      for (const match of text.matchAll(NOBR_RE)) {
        const index = match.index;
        index > lastIndex && fragment.append(text.slice(lastIndex, index));
        const span = document.createElement('span');
        span.setAttribute('data-_nobr', '');
        const matched = match[0];
        span.textContent = matched;
        fragment.append(span);
        lastIndex = index + matched.length;
      }

      lastIndex < text.length && fragment.append(text.slice(lastIndex));

      if (!(node instanceof Text)) {
        return;
      }

      node.replaceWith(fragment);
      return;
    }

    let child = node.firstChild;

    while (child) {
      const next = child.nextSibling;
      this.#applyNonBreakingRules(child);
      child = next;
    }
  }

  #split(
    granularity: Granularity,
    node: Node = this.#fragment ?? new DocumentFragment(),
  ): void {
    let child = node.firstChild;
    const items =
      granularity === 'word' ? this.#wordElements : this.#charElements;

    while (child) {
      const next = child.nextSibling;

      if (child.nodeType === Node.TEXT_NODE) {
        const segmenter = this.#getSegmenter(granularity, child.parentNode);

        if (!segmenter) {
          return;
        }

        const fragment = document.createDocumentFragment();

        for (const segment of segmenter.segment(
          (child.textContent ?? '')
            .replace(/[\r\n\t]/g, '')
            .replace(/\s{2,}/g, ' '),
        )) {
          const span = document.createElement('span');
          const text = segment.segment;
          span.textContent = text;
          text.charCodeAt(0) === 32 && span.setAttribute('data-whitespace', '');
          span.setAttribute(`data-${granularity}`, text);
          items.push(span);
          fragment.append(span);
        }

        child.replaceWith(fragment);
      } else if (
        granularity === 'word' &&
        child instanceof HTMLElement &&
        child.hasAttribute('data-_nobr')
      ) {
        child.removeAttribute('data-_nobr');
        const text = child.textContent ?? '';
        child.setAttribute('data-word', text);
        items.push(child);
      } else if (child.hasChildNodes()) {
        this.#split(granularity, child);
      }

      child = next;
    }
  }

  #applyLineBreakingRules(granularity: Granularity): void {
    let count = 0;
    const items =
      granularity === 'word' ? this.#wordElements : this.#charElements;
    let previous = null;

    while (count < items.length) {
      const item = items[count];

      if (!item) {
        count++;
        continue;
      }

      let text = item.textContent ?? '';

      if (previous?.textContent?.trim() && LBR_PROHIBIT_START_RE.test(text)) {
        text = (previous.textContent ?? '') + text;
        previous.textContent = text;
        previous.setAttribute(`data-${granularity}`, text);
        item.remove();
        items.splice(count, 1);
        continue;
      }

      previous = item;
      count++;
    }

    function concat(index: number, re: RegExp): void {
      const item = items[index];

      if (!item) {
        return;
      }

      const offset = index + 1;
      let text = item.textContent ?? '';

      while (offset < items.length) {
        const next = items[offset];

        if (!next) {
          break;
        }

        const nextText = next.textContent ?? '';

        if (!re.test(nextText)) {
          break;
        }

        text += nextText;
        next.remove();
        items.splice(offset, 1);
      }

      item.textContent = text;
      item.setAttribute(`data-${granularity}`, text);
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const text = item?.textContent ?? '';

      if (LBR_PROHIBIT_END_RE.test(text)) {
        concat(i, LBR_PROHIBIT_END_RE);
        const next = items[i + 1];

        if (next?.textContent?.trim()) {
          const text = (items[i]?.textContent ?? '') + next.textContent;
          next.textContent = text;
          next.setAttribute(`data-${granularity}`, text);
          items[i]?.remove();
          items.splice(i, 1);
          i--;
        }

        continue;
      }

      LBR_INSEPARATABLE_RE.test(text) && concat(i, LBR_INSEPARATABLE_RE);
    }

    if (granularity === 'char') {
      const spans = (
        this.#fragment ?? new DocumentFragment()
      ).querySelectorAll<HTMLElement>('[data-word]:not([data-whitespace])');

      for (let i = 0, l = spans.length; i < l; i++) {
        const span = spans[i];

        if (!span) {
          continue;
        }

        const text = span.textContent;
        text ? span.setAttribute('data-word', text) : span.remove();
      }
    }
  }

  #cleanup(): void {
    this.#wordElements.length = 0;
    this.#charElements.length = 0;
    this.#fragment = null;
    this.#segmenter = null;
  }

  #getSegmenter(
    granularity: Granularity,
    parent: Node | null,
  ): Intl.Segmenter | null {
    if (granularity === 'word' && this.#settings.wordSegmenter) {
      const root =
        parent?.nodeType === Node.ELEMENT_NODE ? parent : this.#rootElement;

      if (!(root instanceof HTMLElement)) {
        return this.#segmenter;
      }

      const closest: HTMLElement | null = root.closest('[lang]');

      return new Intl.Segmenter(
        closest?.lang || document.documentElement.lang || 'en',
        {
          granularity: 'word',
        },
      );
    } else {
      return this.#segmenter;
    }
  }

  #resolveOptions(
    target: MojiSplitterOptions,
    source: Partial<MojiSplitterOptions>,
  ): MojiSplitterOptions {
    const merged = { ...target, ...source };
    const defaults = this.#defaults;

    if (typeof merged.concatChar !== 'boolean') {
      const concatChar = defaults.concatChar;
      console.warn(`Invalid concatChar option. Fallback: ${concatChar}.`);
      merged.concatChar = concatChar;
    }

    if (typeof merged.noInlineStyle !== 'boolean') {
      const noInlineStyle = defaults.noInlineStyle;
      console.warn(`Invalid noInlineStyle option. Fallback: ${noInlineStyle}.`);
      merged.noInlineStyle = noInlineStyle;
    }

    if (typeof merged.noLineBreakingRules !== 'boolean') {
      const noLineBreakingRules = defaults.noLineBreakingRules;
      console.warn(
        `Invalid noLineBreakingRules option. Fallback: ${noLineBreakingRules}.`,
      );
      merged.noLineBreakingRules = noLineBreakingRules;
    }

    if (typeof merged.wordSegmenter !== 'boolean') {
      const wordSegmenter = defaults.wordSegmenter;
      console.warn(`Invalid wordSegmenter option. Fallback: ${wordSegmenter}.`);
      merged.wordSegmenter = wordSegmenter;
    }

    return merged;
  }
}
