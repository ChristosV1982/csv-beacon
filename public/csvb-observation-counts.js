// Display/aggregation adapter. The server is the authority for all policy weights.
(() => {
  const weight = row => Math.max(1, Number(row?.effective_observation_count) || 1);
  const sum = rows => (rows || []).reduce((total, row) => total + weight(row), 0);
  const unique = (rows, key) => {
    const counts = new Map();
    for (const row of rows || []) counts.set(key(row), weight(row));
    return [...counts.values()].reduce((total, value) => total + value, 0);
  };
  let loading;
  let metadata = new Map();
  async function load(supabase, force = false) {
    if (force) loading = null;
    if (!loading) loading = (async () => {
      const rows = [];
      for (let offset = 0;; offset += 1000) {
        const {data, error} = await supabase.rpc("csvb_human_counting_items_for_me", {
          p_report_ids: null,
        }).range(offset, offset + 999);
        if (error) throw error;
        rows.push(...(data || []));
        if ((data || []).length < 1000) break;
      }
      metadata = new Map(rows.map(row => [String(row.observation_item_id), row]));
      return metadata;
    })().catch(error => { loading = null; throw error; });
    return loading;
  }
  function attach(row) {
    const id = row.observation_item_id || row.source_observation_item_id ||
      row.source_observation_id || row.id;
    const audit = String(row.record_source || row.source_family || "").startsWith("audit");
    const data = !audit && metadata.get(String(id));
    return data ? {...row, ...data} : row;
  }
  const keyTotal = keys => [...keys].reduce((total, key) => {
    const id = String(key).split(":").at(-1);
    return total + weight(metadata.get(id));
  }, 0);
  function decorateFindingTable(tbody, rows) {
    const heading = tbody?.closest("table")?.querySelector("thead tr");
    if (!heading) return;
    if (!heading.querySelector("[data-effective-count]")) {
      const th = document.createElement("th");
      th.dataset.effectiveCount = "1";
      th.textContent = "Effective count";
      heading.append(th);
    }
    [...tbody.querySelectorAll("tr")].forEach((tr, index) => {
      if (!rows[index]) return;
      let td = tr.querySelector("[data-effective-count]");
      if (!td) { td = document.createElement("td"); td.dataset.effectiveCount = "1"; tr.append(td); }
      td.textContent = String(weight(rows[index]));
      td.title = (rows[index].retained_pifs || []).join(" | ");
    });
  }
  window.CSVB_OBSERVATION_COUNTS = {weight, sum, unique, load, attach, keyTotal, decorateFindingTable};
})();
