import { higgsfield } from "@higgsfield/client/v2";
import { estimate, exitWithError, loadCredentials, outputUrls } from "./src/higgsfield.ts";

// Seedance 2.5 text-to-video. Flags: --dry-run (print the request, no API call),
// --estimate (free price quote, no generation).
const MODEL = "bytedance/seedance-2.5/text-to-video";

const input = {
  prompt: "A cinematic scene at sunset",
  duration: 5,
  resolution: "720p",
  aspect_ratio: "16:9",
};

async function main(): Promise<void> {
  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify({ model: MODEL, input }, null, 2));
    return;
  }

  loadCredentials();

  if (process.argv.includes("--estimate")) {
    console.log(`Estimate for ${MODEL}: ${await estimate(MODEL, input)}`);
    return;
  }

  console.log(`Submitting ${MODEL} (${input.duration}s, ${input.resolution}, ${input.aspect_ratio}). Billable; waiting for completion...`);
  const result = await higgsfield.subscribe(MODEL, { input, withPolling: true });
  const { requestId, urls } = outputUrls(result, "video");
  console.log(`Completed. request_id=${requestId}`);
  console.log(`Video URL: ${urls[0]}`);
}

main().catch(exitWithError);
