"""Deploy only the M02 attachment handler to the confirmed isolated test project."""
import importlib.util
import json
import os
import pathlib
import urllib.request

PROJECT = "bdidrcyufazskpuwmfca"
assert PROJECT in os.environ["SUPABASE_URL"], "Refusing a different Supabase environment"
spec = importlib.util.spec_from_file_location("edge", "scripts/deploy-office-edge-gates.py")
edge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(edge)
body, content_type = edge.multipart(
    {"name": "m02-attachments", "entrypoint_path": "index.ts", "verify_jwt": False},
    {"index.ts": pathlib.Path("supabase/functions/m02-attachments/index.ts").read_text()},
)
result = json.load(edge.request("/functions/deploy?slug=m02-attachments", body, content_type))
assert result.get("slug") == "m02-attachments"
print("M02-only attachment handler deployed to development/testing; session and M02 authorization enforced inside handler.")
