// Pins the bop-server API contract and regenerates the typed client from it.
//
//   bun run contract:sync -- ../bop-dataset-gen   copy the server repo's schemas, regenerate types
//   bun run contract:check                         fail if src/api/schema.d.ts is stale
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const files = ["api.openapi.json", "run-config.schema.json"];
const generated = join(root, "src/api/schema.d.ts");

const args = process.argv.slice(2);
const check = args.includes("--check");
const server = args.find((arg) => !arg.startsWith("--"));

if (server) {
  for (const file of files) {
    copyFileSync(join(resolve(server), "schemas", file), join(root, "contract", file));
    console.log(`contract/${file} <- ${join(server, "schemas", file)}`);
  }
}

const before = check ? readFileSync(generated, "utf8") : "";
execFileSync(
  join(root, "node_modules/.bin/openapi-typescript"),
  ["contract/api.openapi.json", "-o", "src/api/schema.d.ts"],
  { cwd: root, stdio: check ? "pipe" : "inherit" },
);
if (check && readFileSync(generated, "utf8") !== before) {
  console.error("src/api/schema.d.ts is stale; run `bun run contract:generate` and commit it");
  process.exit(1);
}
