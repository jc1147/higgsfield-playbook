import { parseArgs } from "node:util";
import { higgsfield } from "@higgsfield/client/v2";
import { download, estimate, exitWithError, imageUrl, listPresets, loadCredentials, outputUrls } from "./src/higgsfield.ts";

// Marketing Studio image: three model versions sharing one input schema, plus console presets.
//   tsx marketing-studio.ts <mode> [--model alpha|flare|sunburst] [--image <url|file>]... [--prompt <text>]
//     [--preset <id>] [--quality <q>] [--resolution 1k|2k|4k] [--aspect-ratio <r>] [--moderation auto|low]
//     [--out <dir>] [--dry-run] [--estimate]
// Preset modes (enhance_prompt: true) require 1-2 --image values: the product
// photo, then an optional model reference. Local files are uploaded first.
const MODELS: Record<string, string> = {
  alpha: "marketing-studio/image", // 2.0 Alpha: quality low|medium|high; must be "high" with presets
  flare: "marketing-studio/image/flare", // 2.5 Flare: quality low..max, selectable with presets
  sunburst: "marketing-studio/image/sunburst", // 2.5 Sunburst: same schema as Flare
};

const common = { quality: "high", moderation: "auto", resolution: "2k", aspect_ratio: "auto" };

// Default inputs from each model page in the Higgsfield console. The preset IDs
// are the console defaults; they are checked against the live catalog before use.
const MODES: Record<string, Record<string, unknown>> = {
  direct: {
    ...common,
    prompt: "A cinematic scene at sunset",
    enhance_prompt: false,
  },
  "product-shots": {
    ...common,
    prompt:
      "Product shots featuring a red Rouja face-cream tube surrounded by tomatoes on green tiles. Center the product against a cream background with its label clearly readable. Use direct light, crisp shadows, and subtle grain.",
    preset_id: "05d695d1-ea1f-5d1a-92ef-1ed8642558b5",
    enhance_prompt: true,
  },
  "graphic-ads": {
    ...common,
    prompt:
      "Graphic ads featuring cream over-ear headphones on a woman with closed eyes. Combine a sharp portrait against green curtains with blurred green streaks above. Place oversized pale-yellow italic “HUSH” lettering across the center.",
    preset_id: "ef84af61-57cd-5f2e-b3ca-209d8038563c",
    enhance_prompt: true,
  },
  "marketplace-design": {
    ...common,
    prompt:
      "Marketplace design featuring a large red Chompo strawberry chew pack on white stepped podiums. Add strawberries, pink accents, and a mint background. Use bold rounded burgundy typography and a pink CTA button.",
    preset_id: "f188a40a-098a-5fb3-bffc-eedfeaf9ecd7",
    enhance_prompt: true,
  },
};

const USAGE = `Usage: tsx marketing-studio.ts <${Object.keys(MODES).join("|")}> [--model ${Object.keys(MODELS).join("|")}] [--image <url|file>]... [--prompt <text>] [--preset <id>] [--quality <q>] [--resolution <r>] [--aspect-ratio <r>] [--moderation auto|low] [--out <dir>] [--dry-run] [--estimate]`;

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      model: { type: "string", default: "alpha" },
      image: { type: "string", multiple: true },
      prompt: { type: "string" },
      preset: { type: "string" },
      quality: { type: "string" },
      resolution: { type: "string" },
      "aspect-ratio": { type: "string" },
      moderation: { type: "string" },
      out: { type: "string" },
      "dry-run": { type: "boolean" },
      estimate: { type: "boolean" },
    },
  });

  const mode = positionals[0] ?? "";
  const defaults = MODES[mode];
  const model = MODELS[values.model];
  if (!defaults || !model) throw new Error(USAGE);

  const input: Record<string, unknown> = { ...defaults };
  if (values.prompt) input.prompt = values.prompt;
  if (values.preset) input.preset_id = values.preset;
  if (values.quality) input.quality = values.quality;
  if (values.resolution) input.resolution = values.resolution;
  if (values["aspect-ratio"]) input.aspect_ratio = values["aspect-ratio"];
  if (values.moderation) input.moderation = values.moderation;
  const images = values.image ?? [];

  // Schema rules: enhanced (preset) requests need a preset_id and 1-2 image_urls; 2.0 Alpha also needs quality "high".
  if (input.enhance_prompt && (images.length < 1 || images.length > 2)) {
    throw new Error(
      `"${mode}" takes 1-2 --image values: the product photo, then an optional model reference (got ${images.length}).`,
    );
  }
  if (input.enhance_prompt && values.model === "alpha" && input.quality !== "high") {
    throw new Error(`2.0 Alpha needs quality "high" in preset modes; use --model flare or sunburst for "${String(input.quality)}".`);
  }

  if (values["dry-run"]) {
    console.log(JSON.stringify({ model, input: images.length ? { ...input, image_urls: images } : input }, null, 2));
    return;
  }

  loadCredentials();

  if (input.enhance_prompt) {
    const preset = (await listPresets()).find((p) => p.id === input.preset_id);
    if (!preset) {
      throw new Error(`Preset ${String(input.preset_id)} is not in the current catalog. Run "npm run presets" and pass --preset <id>.`);
    }
    console.log(`Preset: ${preset.name} (${preset.id})`);
  }
  if (images.length) input.image_urls = await Promise.all(images.map(imageUrl));

  if (values.estimate) {
    console.log(`Estimate for ${model} [${mode}]: ${await estimate(model, input)}`);
    return;
  }

  console.log(`Submitting ${model} [${mode}]. Billable; waiting for completion...`);
  const result = await higgsfield.subscribe(model, { input, withPolling: true });
  const { requestId, urls } = outputUrls(result, "images");
  console.log(`Completed. request_id=${requestId}`);
  for (const [i, url] of urls.entries()) {
    console.log(`Image URL: ${url}`);
    if (values.out) {
      const name = `${mode}-${values.model}-${requestId.slice(0, 8)}${urls.length > 1 ? `-${i + 1}` : ""}`;
      console.log(`Saved: ${await download(url, values.out, name)}`);
    }
  }
}

main().catch(exitWithError);
