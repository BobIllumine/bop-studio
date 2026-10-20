import medium from "./presets/medium.toml?raw";
import small from "./presets/small.toml?raw";
import smoke from "./presets/smoke.toml?raw";
import stress from "./presets/stress.toml?raw";
import twoBins from "./presets/two_bins.toml?raw";

/**
 * Starting configurations, copied from the server repository's examples with
 * asset paths made relative to the server's asset library.
 */
export const PRESETS: { id: string; name: string; toml: string }[] = [
  { id: "smoke", name: "smoke.toml", toml: smoke },
  { id: "small", name: "small.toml", toml: small },
  { id: "medium", name: "medium.toml", toml: medium },
  { id: "stress", name: "stress.toml", toml: stress },
  { id: "two_bins", name: "two_bins.toml", toml: twoBins },
];
