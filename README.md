# Higgsfield API

Seedance 2.5 text-to-video and Marketing Studio image generation with the official
[`@higgsfield/client`](https://github.com/higgsfield-ai/higgsfield-js) SDK (v2, server-side only).

**Playbook:** [which model for which job, fal vs Higgsfield, costs and lessons](https://jc1147.github.io/higgsfield-playbook/)
(source: `docs/index.html`). Worked example: the
[Sacramento Applied Kinesiology image set](https://jc1147.github.io/applied-kinesiology-sacramento-images/)
([repo](https://github.com/jc1147/applied-kinesiology-sacramento-images)).

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and set `HF_CREDENTIALS=key-id:key-secret`
   (keys: https://console.higgsfield.ai). `.env.local` is git-ignored; never commit it.
   An `HF_CREDENTIALS` variable already set in the shell takes precedence over the file.

## Commands

| Command | Model / mode |
|---|---|
| `npm start` | `bytedance/seedance-2.5/text-to-video` — "A cinematic scene at sunset", 5 s, 720p, 16:9. Prints the video URL. |
| `npm run image` | Marketing Studio direct generation ("A cinematic scene at sunset", 2k); add `--image` to edit a photo |
| `npm run product-shots -- --image <file-or-url>` | Marketing Studio preset: Product shots |
| `npm run graphic-ads -- --image <file-or-url>` | Marketing Studio preset: Graphic ads |
| `npm run marketplace-design -- --image <file-or-url>` | Marketing Studio preset: Marketplace design |
| `npm run presets` | Lists the Marketing Studio presets visible to your account, grouped by style, with a preview image URL each |
| `npm run typecheck` | Type-checks against the SDK's declarations |

Every generation is billable. Add `--estimate` to any generation command for a free quote without
generating, or `--dry-run` to print the request without calling the API. 2.0 Alpha quotes come back in
credits and USD (2026-09-25: direct ~$0.45, preset workflows ~$0.27–0.37 per image). Seedance, 2.5 Flare
and 2.5 Sunburst are token-metered, so their estimates return the rate card instead (Seedance: 5 s at
720p is 108,000 video tokens, about $2.31 at list price).

## Marketing Studio models and options

`--model` picks the version from the console's model menu (default `alpha`):

| `--model` | Console | Endpoint | `--quality` |
|---|---|---|---|
| `alpha` | 2.0 Alpha | `marketing-studio/image` | low, medium, high (presets require high) |
| `flare` | 2.5 Flare | `marketing-studio/image/flare` | low, medium, high, xhigh, max |
| `sunburst` | 2.5 Sunburst | `marketing-studio/image/sunburst` | low, medium, high, xhigh, max |

Other options: `--prompt "<text>"`, `--preset <id>` (from `npm run presets`), `--image` (repeatable),
`--resolution 1k|2k|4k`, `--aspect-ratio auto|1:1|3:2|2:3|4:3|3:4|16:9|9:16|21:9`, `--moderation auto|low`,
and `--out <dir>` to save the images locally (`outputs/` is git-ignored). In direct mode, images switch
the request to editing, e.g. a sharp re-render of a blurry product photo:

    npm run image -- --model flare --quality max --aspect-ratio 1:1 --image ./blurry.png --out outputs/x \
      --prompt "Recreate this exact product photo as a razor-sharp studio packshot; keep all packaging text identical ..."

Edits can invent label text the source is too blurry to show. Check the result, and name exactly what
the label says (or tell it to omit what you can't read).

## Real logos (post-processing, Windows PowerShell)

The models can't reproduce a brand's actual logo, and when asked to leave space they sometimes invent one.
Put the real logo on in post instead:

    powershell -File tools/logo-cutout.ps1 logo.png logo-transparent.png   # removes the white background around the logo
    powershell -File tools/composite-logo.ps1 -ad ad.png -logo logo-transparent.png -x 60 -y 60 -w 500 -out ad-final.png [-text "21+" -tx 1600 -ty 2250]

## Designing ads (preset workflows)

The console's Product shots, Graphic ads and Marketplace design workflows are all
`marketing-studio/image` with a preset. Pick a style with `npm run presets` (open a cover URL to
preview it), then:

    npm run product-shots -- --image ./my-product.png --prompt "Minimal, bright and premium"
    npm run graphic-ads -- --image ./my-product.png --preset <id> --prompt "Bold launch ad for ..."
    npm run marketplace-design -- --model sunburst --image ./my-product.png --image ./model.jpg --out outputs/test

The first image is the product photo, and it must actually show a product: a photo without one (a
landscape, say) ends as `failed: Generation failed` within seconds, uncharged. A clean packshot on a
plain background works well. An optional second image is a model reference; without it the
composition stays product-only. The default prompts describe the console's sample products (face
cream, headphones, candy), so pass `--prompt` with your own product and copy.

## Behavior

- Success is reported only when a request is `completed` with an output URL. `failed`, `nsfw`
  (moderated) and `canceled` requests exit with code 1. Failed and moderated requests are not charged.
- Preset modes send `enhance_prompt: true`, which requires 1–2 images (the product photo, then an
  optional model reference) and quality `high`. Local jpg/png/webp/gif files are uploaded through a
  presigned URL first.
- Preset IDs default to the console's values and are checked against the live catalog before each
  preset request, since presets can change.
- Output URLs are retained for at least 7 days. Download anything you want to keep.
- Errors never print raw error objects, and the credential is scrubbed from anything printed.
