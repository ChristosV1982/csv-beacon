import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BUCKET = "m02-supporting-evidence";
const LIMIT = 10 * 1024 * 1024;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const types: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  pdf: "application/pdf", doc: "application/msword", xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
function validSignature(ext: string, bytes: Uint8Array): boolean {
  const starts = (...s: number[]) => s.every((b, i) => bytes[i] === b);
  const text = new TextDecoder("latin1").decode(bytes);
  if (ext === "jpg" || ext === "jpeg") return starts(255, 216, 255);
  if (ext === "png") return starts(137, 80, 78, 71, 13, 10, 26, 10);
  if (ext === "webp") return text.startsWith("RIFF") && text.slice(8, 12) === "WEBP";
  if (ext === "pdf") return text.startsWith("%PDF-");
  if (ext === "doc" || ext === "xls") return starts(208, 207, 17, 224, 161, 177, 26, 225);
  if (ext === "docx" || ext === "xlsx") return starts(80, 75, 3, 4) &&
    text.includes("[Content_Types].xml") &&
    text.includes(ext === "docx" ? "word/document.xml" : "xl/workbook.xml") &&
    !/vbaProject\.bin/i.test(text);
  return false;
}
Deno.serve(async (req) => {
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return respond({ error: "POST required" }, 405);
  const auth = req.headers.get("Authorization") || "";
  if (!/^Bearer \S+$/i.test(auth)) return respond({ error: "Sign in required" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const user = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } }, auth: { persistSession: false },
  });
  const { data: identity, error: authError } = await user.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (authError || !identity.user) return respond({ error: "Invalid session" }, 401);
  const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await user.rpc(name, args);
    if (error) throw Object.assign(new Error(error.message), { status: error.code === "42501" ? 403 : 400 });
    return data;
  };
  let reservation: { id: string; storage_path: string } | null = null;
  try {
    const multipart = req.headers.get("Content-Type")?.includes("multipart/form-data");
    if (Number(req.headers.get("Content-Length") || 0) > LIMIT + 65536) return respond({ error: "Maximum 10 MB combined per question/item" }, 413);
    const form = multipart ? await req.formData() : null;
    const input = form ? Object.fromEntries(form.entries()) : await req.json();
    if (input.action === "upload") {
      const file = form?.get("file");
      if (!(file instanceof File)) return respond({ error: "Choose an attachment" }, 400);
      const ext = file.name.split(".").pop()?.toLowerCase() || "";
      const mime = types[ext];
      if (!mime || (file.type && file.type !== mime && file.type !== "application/octet-stream")) {
        return respond({ error: "Allowed: JPG, PNG, WEBP, PDF, DOC/DOCX, XLS/XLSX" }, 400);
      }
      if (!file.size || file.size > LIMIT) return respond({ error: "Maximum 10 MB combined per question/item" }, 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!validSignature(ext, bytes)) return respond({ error: "File content does not match the allowed document/image type" }, 400);
      reservation = await rpc("csvb_m02_attachment_reserve", {
        p_report_id: input.report_id, p_question_id: input.question_id || null,
        p_company_item_no: input.company_item_no ? Number(input.company_item_no) : null,
        p_filename: file.name, p_mime: mime, p_size: bytes.length,
      });
      const { error } = await service.storage.from(BUCKET).upload(reservation!.storage_path, bytes, {
        contentType: mime, cacheControl: "0", upsert: false,
      });
      if (error) throw new Error("Private file upload failed. Please retry.");
      const attachment = await rpc("csvb_m02_attachment_finalize", { p_attachment_id: reservation!.id });
      reservation = null;
      return respond({ attachment });
    }
    if (input.action === "download") {
      const info = await rpc("csvb_m02_attachment_download", { p_attachment_id: input.attachment_id });
      const { data, error } = await service.storage.from(BUCKET).createSignedUrl(info.storage_path, 120, { download: info.original_filename });
      if (error) throw new Error("Could not create a private download link");
      return respond({ url: data.signedUrl });
    }
    if (input.action === "delete") {
      const info = await rpc("csvb_m02_attachment_delete", { p_attachment_id: input.attachment_id, p_finish: false });
      const { error } = await service.storage.from(BUCKET).remove([info.storage_path]);
      if (error) throw new Error("Private file removal failed. Retry Delete to finish.");
      await rpc("csvb_m02_attachment_delete", { p_attachment_id: input.attachment_id, p_finish: true });
      return respond({ deleted: true });
    }
    return respond({ error: "Unknown attachment action" }, 400);
  } catch (error) {
    if (reservation) {
      try {
        await rpc("csvb_m02_attachment_delete", { p_attachment_id: reservation.id, p_finish: false });
        const { error: removeError } = await service.storage.from(BUCKET).remove([reservation.storage_path]);
        if (!removeError) await rpc("csvb_m02_attachment_delete", { p_attachment_id: reservation.id, p_finish: true });
      } catch { /* Keep the quota reservation; the editable draft exposes removal/retry. */ }
    }
    return respond({ error: error instanceof Error ? error.message : "Attachment request failed" }, (error as { status?: number }).status || 400);
  }
});
