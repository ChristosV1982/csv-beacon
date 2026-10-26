import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parseOperatorCommentSections } from "../supabase/functions/import-post-inspection-pdf/operator_comments_parser.mjs";

export function loadHumanPifParser(pdfjsLib = {}) {
  const source = readFileSync(new URL("../supabase/functions/import-post-inspection-pdf/index.ts", import.meta.url), "utf8")
    .split("Deno.serve(")[0].replace(/^import .*$/gm, "").replace(/^export const /gm, "const ");
  const context = { parseOperatorCommentSections, pdfjsLib };
  vm.runInNewContext(source + "\nthis.parsers={parseResponseBlock,extractFindingsFromPages,extractPdfTextData};", context);
  return context.parsers;
}
