# Demo artwork

Illustrated (not photographic) gin bottles and cocktails in the style of the
spec's concept mockup. Used for demo content and the screenshot overview
(`../app-screens-overview.png`). Brand names on the labels are made up.

Regenerate them (uses the Playwright Chromium in this environment):

```bash
node docs/images/demo-art/generate-art.js docs/images/demo-art
```

Colours, label text and glass shapes are plain data at the top of each
section of `generate-art.js` (`BOTTLES`, `COCKTAILS`).
