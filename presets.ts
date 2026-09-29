import { exitWithError, listPresets, loadCredentials } from "./src/higgsfield.ts";

// Lists the Marketing Studio presets visible to this account, grouped by style.
// Open a cover URL to preview a style, then pass its id to marketing-studio.ts with --preset.
async function main(): Promise<void> {
  loadCredentials();
  const presets = await listPresets();
  const groups = new Map<string, typeof presets>();
  for (const p of presets) {
    const group = p.group || "(ungrouped)";
    groups.set(group, [...(groups.get(group) ?? []), p]);
  }
  for (const [group, items] of groups) {
    console.log(`\n${group}`);
    for (const p of items) console.log(`  ${p.id}  ${p.name}  [${p.aspectRatio}]  ${p.cover}`);
  }
  console.log(`\n${presets.length} presets`);
}

main().catch(exitWithError);
