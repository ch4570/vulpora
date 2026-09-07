# Publishing Contract

## Commands

```bash
node scripts/publish.mjs \
  --input report.md \
  --output-dir artifact/report \
  --theme technical

node scripts/publish.mjs \
  --input report.md \
  --output-dir artifact/report \
  --theme executive \
  --pdf
```

Supported flags:

- `--input <path>`: required readable Markdown file.
- `--output-dir <path>`: required artifact directory.
- `--theme executive|technical|minimal`: default `minimal`.
- `--title <text>`: override the first H1-derived document title.
- `--pdf`: render `report.pdf` with a local Chromium-family executable.
- `--browser <path>`: explicit browser executable. `MARKDOWN_PUBLISHER_BROWSER` is the environment
  alternative.
- `--force`: permit replacing generated artifact files. Never changes the original input.

Run `node scripts/render-pdf.mjs --preflight` to check PDF capability without changing files.

## Output

```text
artifact-dir/
├── source.md
├── report.html
├── report.pdf              # only with --pdf
└── artifact-manifest.json
```

The manifest uses `markdown-publisher.artifact/v1`. Every existing artifact has a relative path,
SHA-256, and byte count. PDF output records renderer `exit_mode`, `qa.required=true`, `qa.status=pending`, and
`qa.next_skill=pdf-qa`; creation is not visual approval.

## Failure contract

- Do not download a browser, package, font, stylesheet, script, or image.
- Resolve browsers in this order: `--browser`, `MARKDOWN_PUBLISHER_BROWSER`, `PATH`, known local app
  paths.
- Exit non-zero when no supported browser exists, Chrome exits non-zero, or output does not start
  with both the PDF header and trailing `%%EOF` envelope. If Chromium leaves its process alive after the
  completed file stabilizes, bound and terminate only that temporary-profile process group and record
  `bounded-termination-after-complete-pdf`; never treat a partial file as success.
- Refuse existing artifact paths unless `--force` is present. This includes partial artifacts from a
  prior run.
- Keep a successfully generated HTML/source pair if PDF rendering fails; do not emit a manifest that
  claims a PDF exists.
- Never auto-open a browser or PDF viewer.

## Renderer boundary

`markdown-publisher` creates artifacts. `pdf-qa` decides whether a PDF is visually acceptable. The
publisher does not mark `qa.status=pass`, inspect rendered pages, or bypass that gate.
