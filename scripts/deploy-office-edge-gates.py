"""Add ONLY the Office gate to the current deployed entry points.

Uses Supabase Management API/ESZIP source retrieval so unrelated local/deployed
parser differences are not silently deployed. No credential values are printed.
Usage: python scripts/deploy-office-edge-gates.py --verify
       python scripts/deploy-office-edge-gates.py --deploy
"""
import argparse
import hashlib
import json
import os
import re
import struct
import urllib.request
from pathlib import Path

PROJECT = "bdidrcyufazskpuwmfca"
BASE = f"https://api.supabase.com/v1/projects/{PROJECT}"
TARGETS = {
    "import-post-inspection-pdf": ("POST_INSPECTION", "edit"),
    "suggest-post-inspection-mscat": ("POST_INSPECTION", "edit"),
    "backfill-post-inspection-mscat-ai": ("POST_INSPECTION", "edit"),
    "backfill-audit-observations-mscat-ai": ("AUDIT_OBSERVATIONS", "edit"),
    "company-policy-ai-search": ("COMPANY_POLICY", "view"),
    "sire-viewer-ai-search": ("SIRE_QUESTIONS_VIEWER", "view"),
    "su-admin": ("SU_ADMIN", "admin"),
}
OLD_MARKER = "// CSVB_OFFICE_AUTH_GATE_20261105"
MARKER = "// CSVB_OFFICE_AUTH_GATE_20261105_V2"


def request(path, data=None, content_type="application/json"):
    headers = {"Authorization": "Bearer " + os.environ["SUPABASE_ACCESS_TOKEN"]}
    if data is not None:
        headers["Content-Type"] = content_type
    return urllib.request.urlopen(urllib.request.Request(
        BASE + path, data=data, headers=headers), timeout=300)


def sources(bundle):
    """ESZIP 2.2/2.3, checksum-free bundles as served by this project."""
    if bundle[:8] not in (b"ESZIP2.2", b"ESZIP2.3"):
        raise ValueError("Unsupported ESZIP; no deployment attempted")
    options_len = struct.unpack(">I", bundle[8:12])[0]
    options = bundle[12:12 + options_len]
    if options != b"\x00\x00\x01\x00":
        raise ValueError("Unsupported ESZIP options; no deployment attempted")
    p = 12 + options_len
    header_len = struct.unpack(">I", bundle[p:p + 4])[0]
    p += 4
    header = bundle[p:p + header_len]
    p += header_len
    npm_len = struct.unpack(">I", bundle[p:p + 4])[0]
    p += 4 + npm_len
    source_len = struct.unpack(">I", bundle[p:p + 4])[0]
    p += 4
    body = bundle[p:p + source_len]
    entries = {}
    p = 0
    while p < len(header):
        length = struct.unpack(">I", header[p:p + 4])[0]
        p += 4
        spec = header[p:p + length].decode()
        p += length
        kind = header[p]
        p += 1
        if kind == 0:
            offset, length, _, _ = struct.unpack(">IIII", header[p:p + 16])
            p += 17  # module kind follows offsets
            content = body[offset:offset + length]
            try:
                entries[spec] = content.decode()
            except UnicodeDecodeError:
                # Bundled npm dependencies may contain WASM/native assets.
                # They are not source modules and are rebuilt by Supabase.
                entries[spec] = content
        elif kind == 1:
            length = struct.unpack(">I", header[p:p + 4])[0]
            p += 4 + length
        elif kind == 2:  # npm snapshot reference
            p += 4
        else:
            raise ValueError(f"Unsupported ESZIP entry kind {kind}")
    return entries


def entrypoint(entries, slug):
    # The first source is the deployed entry point, not a dependency.
    for name, text in entries.items():
        if isinstance(text, str) and re.search(r"(?:Deno\.)?serve\(async", text) and (name.endswith("/index.ts") or name.endswith("/index.js")):
            return name, text
    raise ValueError(f"Entry point missing: {slug}")


def inject(text, slug, module, action):
    if MARKER in text:
        return text
    if OLD_MARKER in text:
        text = re.sub(
            r"\n\s*// CSVB_OFFICE_AUTH_GATE_20261105\n[\s\S]*?\n\s*if\s*\(officeDenied\)\s*return officeDenied;\n",
            "\n", text, count=1)
        text = re.sub(r'^import \{ officeAuthorizationGate \} from ["\']\./office-authorization\.ts["\'];\s*\n',
                      "", text, count=1)
        if "const officeDenied" in text:
            raise ValueError("Previous gate could not be safely replaced")
    pattern = r"(?:Deno\.)?serve\(async\s*\(req\)\s*=>\s*\{"
    if len(re.findall(pattern, text)) != 1:
        raise ValueError(f"Unrecognized entry handler for {slug}; not changed")
    module_expr = json.dumps(module)
    prefix = ""
    if slug == "sire-viewer-ai-search":
        prefix = "const officeBody = await req.clone().json().catch(() => ({}));"
        module_expr = """(normalizeViewerType(officeBody.viewer_type || officeBody.viewerType ||
          officeBody.source_kind || officeBody.sourceKind) === "RISQ"
          ? "RISQ_QUESTIONS_VIEWER" : "SIRE_QUESTIONS_VIEWER")"""
    gate = f"""
  {MARKER}
  {prefix}
  const officeDenied = await officeAuthorizationGate(req, {module_expr}, {json.dumps(action)});
  if (officeDenied) return officeDenied;
"""
    patched = re.sub(pattern, lambda m: m[0] + gate, text, count=1)
    return 'import { officeAuthorizationGate } from "./office-authorization.ts";\n' + patched


def multipart(metadata, files):
    boundary = "csvb-office-auth-deploy-20261105"
    chunks = []
    for field, filename, content in [
        ("metadata", None, json.dumps(metadata).encode()),
        *[("file", name, text.encode()) for name, text in files.items()],
    ]:
        chunks.append(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" +
                       field + "\"" + (f'; filename="{filename}"' if filename else "") +
                       "\r\nContent-Type: application/octet-stream\r\n\r\n").encode() +
                      content + b"\r\n")
    chunks.append(("--" + boundary + "--\r\n").encode())
    return b"".join(chunks), "multipart/form-data; boundary=" + boundary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--deploy", action="store_true")
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--only", choices=list(TARGETS))
    args = parser.parse_args()
    deployed = {x["slug"]: x for x in json.load(request("/functions"))}
    helper = Path("supabase/functions/_shared/office-authorization.ts").read_text()
    for slug, (module, action) in TARGETS.items():
        if args.only and args.only != slug:
            continue
        entries = sources(request("/functions/" + slug + "/body").read())
        entry_name, original = entrypoint(entries, slug)
        patched = inject(original, slug, module, action)
        print(slug, "version", deployed[slug]["version"],
              "guard_present", OLD_MARKER in original,
              "source_sha256", hashlib.sha256(original.encode()).hexdigest())
        if not args.deploy or MARKER in original:
            continue
        files = {"index.ts": patched, "office-authorization.ts": helper}
        # Include the deployed entry's local source dependencies, not workspace copies.
        pending = [(entry_name, original)]
        seen = set()
        while pending:
            name, text = pending.pop()
            if name in seen:
                continue
            seen.add(name)
            for relative in re.findall(r'(?:from\s*|import\s*)["\'](\./[^"\']+)["\']', text):
                source_name = name.rsplit("/", 1)[0] + "/" + relative[2:]
                if source_name not in entries:
                    raise ValueError(f"Missing deployed dependency {source_name}")
                destination = source_name[len(entry_name.rsplit("/", 1)[0]) + 1:]
                if destination == "office-authorization.ts":
                    # The reviewed gate is the intentional deployment change,
                    # not an unrelated hosted dependency to preserve.
                    continue
                files[destination] = entries[source_name]
                pending.append((source_name, entries[source_name]))
        metadata = {"name": slug, "entrypoint_path": "index.ts",
                    "verify_jwt": deployed[slug]["verify_jwt"]}
        body, content_type = multipart(metadata, files)
        result = json.load(request("/functions/deploy?slug=" + slug, body, content_type))
        print("  deployed", result.get("version"), result.get("status"))


if __name__ == "__main__":
    main()
