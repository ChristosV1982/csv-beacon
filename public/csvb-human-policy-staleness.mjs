// Read-only annotation: changing a company policy never refreshes risk implicitly.
export async function markHumanPolicyStaleness(supabase, rows, reportId) {
  const {data, error} = await supabase.rpc("csvb_human_policy_snapshot_status_for_me");
  if (error) throw error;
  const statuses = (data || []).filter(row => String(row.report_id) === String(reportId));
  let metadata = [];
  const snapshots = statuses.map(row => row.risk_snapshot_id);
  if (snapshots.length && (rows || []).some(row => row.observation_item_id)) {
    const response = await supabase.rpc("csvb_human_pif_risk_factors_for_report", {p_report_id: reportId});
    if (response.error) throw response.error;
    metadata = response.data || [];
  }
  return (rows || []).map(row => ({
    ...row,
    human_pif_factors: metadata.find(item =>
      String(item.observation_item_id) === String(row.observation_item_id) &&
      String(item.inspection_score_id) === String(row.risk_snapshot_id))?.factors_json || row.factors_json,
    human_policy_stale: statuses.some(status => status.is_stale &&
      ((row.risk_snapshot_id && String(status.risk_snapshot_id) === String(row.risk_snapshot_id)) ||
       (row.profile_version_id && String(status.profile_version_id) === String(row.profile_version_id)))),
  }));
}
