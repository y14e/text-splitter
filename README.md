# Moji Splitter

Flexible text splitting utility for CSS animations. Supports complex [line breaking rules](https://en.wikipedia.org/wiki/Line_breaking_rules_in_East_Asian_languages) (ja: 禁則処理).

## Install

```bash
npm i moji-splitter
```

```ts
// npm
import { createMojiSplitter } from 'moji-splitter';

// CDNs
import { createMojiSplitter } from 'https://esm.sh/moji-splitter@3.1.6';
// or
import { createMojiSplitter } from 'https://cdn.jsdelivr.net/npm/moji-splitter@3.1.6/dist/index.js';
// or
import { createMojiSplitter } from 'https://esm.unpkg.com/moji-splitter@3.1.6';
```

## 📦 APIs

```ts
const cleanup = createMojiSplitter(root, options);
// => () => void
//
// root: HTMLElement
// options (optional): MojiSplitterOptions
```

## 🪄 Options

```ts
interface MojiSplitterOptions {
  concatChar: boolean;          // default: false
  noInlineStyle: boolean;       // default: false
  noLineBreakingRules: boolean; // default: false
  wordSegmenter: boolean;       // default: false
}
```

### `concatChar`

If `true`, enables concatenation at the character level.

### `noLineBreakingRules`

If `true`, disables line breaking rules.

### `wordSegmenter`

If `true`, uses `Intl.Segmenter` with the `{ granularity: 'word' }` option; useful for CJK (Chinese, Japanese, and Korean) text.

## Demo

- https://y14e.github.io/moji-splitter/
- https://y14e.github.io/moji-splitter/test.html
