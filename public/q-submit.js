// public/q-submit.js
// Adds "Submit" workflow for vessel + company roles.
// - Vessel submission -> pending_office_review
// - Company submission -> submitted
// Confirmation is always shown; if completion can be computed it will show counts.

function getQid() {
  const u = new URL(window.location.href);
  return u.searchParams.get("qid") || "";
}

function ensureSupabase() {
  const sb = window.__supabaseClient;
  if (!sb) throw new Error("Supabase client not initialized. Ensure auth.js is loaded.");
  return sb;
}

async function getCompletionStats(sb, qid) {
  // This assumes you have:
  // - public.questionnaire_questions(questionnaire_id,...)
  // - public.answers(questionnaire_id, question_no, response, ...)
  //
  // If your answers table has a different name/columns, this function will throw;
  // the submit flow will still work, but without the counts.
  const totalRes = await sb
    .from("questionnaire_questions")
    .select("question_no", { count: "exact", head: true })
    .eq("questionnaire_id", qid);

  if (totalRes.error) throw totalRes.error;
  const total = totalRes.count || 0;

  const answeredRes = await sb
    .from("answers")
    .select("question_no", { count: "exact", head: true })
    .eq("questionnaire_id", qid)
    .not("response", "is", null);

  if (answeredRes.error) throw answeredRes.error;
  const answered = answeredRes.count || 0;

  return { total, answered };
}

async function submitQuestionnaire() {
  const qid = getQid();
  if (!qid) {
    alert("No questionnaire id found. Open from Dashboard/Vessel list.");
    return;
  }

  const me = await AUTH.requireAuth(); // any logged-in user
  if (!me) return;

  const role = me?.profile?.role;
  const isVessel = role === AUTH.ROLES.VESSEL;
  const isCompany =
    role === AUTH.ROLES.SUPER_ADMIN ||
    role === AUTH.ROLES.COMPANY_ADMIN ||
    role === AUTH.ROLES.COMPANY_SUPERINTENDENT;

  if (!isVessel && !isCompany) {
    alert("Your role is not permitted to submit questionnaires.");
    return;
  }

  const sb = ensureSupabase();

  // Determine target status
  const targetStatus = isVessel ? "pending_office_review" : "submitted";

  // Compute completion (best-effort)
  let statsText = "You may still have unanswered items.";
  try {
    const { total, answered } = await getCompletionStats(sb, qid);
    if (total > 0 && answered >= total) {
      statsText = "All items appear answered.";
    } else if (total > 0) {
      const pct = Math.round((answered / total) * 100);
      statsText = `Completion: ${answered}/${total} (${pct}%). Unanswered items may remain.`;
    }
  } catch {
    // If your schema differs, we still proceed with a conservative confirmation.
  }

  const ok = window.confirm(
    `Submit this questionnaire?\n\n` +
    `${statsText}\n\n` +
    `After submission the status will be set to: ${targetStatus}\n\nProceed?`
  );
  if (!ok) return;

  const { error } = await sb
    .from("questionnaires")
    .update({ status: targetStatus })
    .eq("id", qid);

  if (error) {
    alert("Submit failed: " + error.message);
    return;
  }

  alert("Submitted. Status updated to: " + targetStatus);

  // Redirect user to their appropriate list page
  if (isVessel) window.location.href = "./q-vessel.html";
  else window.location.href = "./q-company.html";
}

function ensureButton() {
  // If your q-answer page already has a submit button, just wire it.
  let btn = document.getElementById("submitBtn");

  // Optional: if not present, we do NOT auto-insert into unknown layouts.
  if (!btn) return;

  btn.addEventListener("click", () => {
    submitQuestionnaire().catch((e) => {
      console.error(e);
      alert("Submit failed: " + String(e?.message || e));
    });
  });
}

document.addEventListener("DOMContentLoaded", ensureButton);
