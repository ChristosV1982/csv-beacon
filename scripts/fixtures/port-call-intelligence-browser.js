// Browser-only test double. Injected by CDP; never loaded by the application.
(() => {
  const role = new URL(location.href).searchParams.get("testRole") || "super_admin";
  const viewOnly = role !== "super_admin";
  const db = {
    pci_v_countries_list: [{country_code:"SG",country_name:"Singapore"}],
    pci_v_ports_list: [{port_id:"port1",country_code:"SG",country_name:"Singapore",port_name:"Singapore",unlocode:"SGSIN"}],
    pci_v_port_facilities_list: [{port_facility_id:"facility1",port_id:"port1",facility_name:"Test Terminal",company_id:null}],
    pci_port_profiles: [{id:"profile1",company_id:"company1",port_id:"port1",port_facility_id:"facility1",terminal_name:"Test Terminal",berth_name:"Berth 1"}],
    pci_field_definitions: [], pci_field_options: [],
    pci_profile_values: [{id:"value1",company_id:"company1",profile_id:"profile1",display_value:"Approved intelligence fixture",approved_at:"2026-01-01T00:00:00Z"}],
    pci_profile_change_proposals: [{id:"proposal1",company_id:"company1",profile_id:"profile1",status:"pending",proposed_display_value:"Proposed fixture",source_call_id:"call1"}],
    pci_port_information_items: [{id:"info1",company_id:"company1",port_id:"port1",status:"office_info_published",category_key:"regulation",current_revision_number:1}],
    pci_port_information_revisions: [{id:"revision1",information_item_id:"info1",revision_number:1,title:"Published office fixture",narrative:"Existing published guidance",published_at:"2026-01-01T00:00:00Z"}],
    pci_port_calls: Array.from({length:27},(_,i)=>({
      id:"call"+(i+1),company_id:"company1",port_id:"port1",profile_id:"profile1",port_facility_id:"facility1",
      call_reference:"CALL-"+String(i+1).padStart(3,"0"),vessel_id:"vessel1",vessel_name_snapshot:"Test Vessel",
      country_code_snapshot:"SG",country_name_snapshot:"Singapore",port_name_snapshot:"Singapore",unlocode_snapshot:"SGSIN",
      terminal_name_snapshot:"Test Terminal",berth_name_snapshot:"Berth 1",cargo_operation_type:"Loading",
      report_origin:"office",status:i===0?"submitted":"draft",created_by:"user1",
      created_at:"2026-01-01T00:00:00Z",updated_at:"2026-01-01T00:00:00Z",all_lines_fast_utc:"2026-01-01T00:00:00Z",
      all_lines_clear_utc:"2026-01-02T00:00:00Z",port_entry_utc:"2026-01-01T00:00:00Z",utc_offset_minutes:0,
      all_lines_fast_local:"2026-01-01T00:00",all_lines_clear_local:"2026-01-02T00:00",port_entry_local:"2026-01-01T00:00",
      all_lines_fast_utc_offset_minutes:0,all_lines_clear_utc_offset_minutes:0,port_entry_utc_offset_minutes:0,
      call_sort_at:"2026-01-01T00:00:00Z",arrival_draught_forward:8,arrival_draught_aft:8
    }))
  };
  window.__pciFixture = {db,writes:[],queries:[]};
  class Query {
    constructor(table) {this.table=table;this.filters=[];this.orders=[];this.op="read";}
    select(){return this;}
    eq(k,v){this.filters.push(r=>r[k]===v);return this;}
    in(k,v){this.filters.push(r=>v.includes(r[k]));return this;}
    is(k,v){this.filters.push(r=>r[k]==v);return this;}
    ilike(k,v){const needle=v.replaceAll("%","").toLowerCase();this.filters.push(r=>String(r[k]||"").toLowerCase().includes(needle));return this;}
    gte(k,v){this.filters.push(r=>r[k]>=v);return this;}
    lt(k,v){this.filters.push(r=>r[k]<v);return this;}
    or(){return this;}
    order(k,o={}){this.orders.push([k,o.ascending!==false?1:-1]);return this;}
    range(a,b){this.bounds=[a,b];return this;}
    limit(n){this.bounds=[0,n-1];return this;}
    single(){this.one=true;return this;}
    maybeSingle(){this.one=true;return this;}
    insert(p){this.op="insert";this.payload=p;return this;}
    upsert(p){this.op="insert";this.payload=p;return this;}
    update(p){this.op="update";this.payload=p;return this;}
    delete(){this.op="delete";return this;}
    then(resolve,reject){return Promise.resolve().then(()=>{
      const table=this.table==="pci_v_call_report_register"?"pci_port_calls":this.table;
      const all=db[table] ||= [];
      let rows=all.filter(r=>this.filters.every(f=>f(r)));
      window.__pciFixture.queries.push({table:this.table,op:this.op});
      if(this.op!=="read"){
        window.__pciFixture.writes.push({table:this.table,op:this.op,payload:this.payload});
        if(this.op==="insert"){
          rows=(Array.isArray(this.payload)?this.payload:[this.payload]).map(p=>({...p,id:p.id||crypto.randomUUID()}));
          for(const r of rows)if(table==="pci_port_calls")Object.assign(r,{call_reference:"NEW-TEST",vessel_name_snapshot:"Test Vessel",country_code_snapshot:"SG",country_name_snapshot:"Singapore",port_name_snapshot:"Singapore",call_sort_at:r.all_lines_fast_utc});
          all.push(...rows);
        }else if(this.op==="update")rows.forEach(r=>Object.assign(r,this.payload));
        else db[table]=all.filter(r=>!rows.includes(r));
      }
      rows.sort((a,b)=>{for(const[k,d]of this.orders){if(a[k]!==b[k])return(a[k]>b[k]?1:-1)*d;}return 0;});
      const count=rows.length;
      if(this.bounds)rows=rows.slice(this.bounds[0],this.bounds[1]+1);
      return {data:this.one?(rows[0]||null):rows,error:null,count};
    }).then(resolve,reject);}
  }
  const sb={
    from:t=>new Query(t),
    rpc:async(name,args)=>{
      if(name==="csvb_my_effective_app_permissions")return {data:(viewOnly?["view"]:["view","edit","review","admin"]).map(permission_action=>({module_code:"PORT_CALL_INTELLIGENCE",permission_action,is_granted:true})),error:null};
      if(name==="pci_list_company_vessels")return {data:[{id:"vessel1",name:"Test Vessel",vessel_id:"vessel1",vessel_name:"Test Vessel"}],error:null};
      if(name==="pci_list_approved_berths")return {data:[{berth_name:"Berth 1",port_facility_id:"facility1"}],error:null};
      if(name==="pci_list_approved_cargo_grades")return {data:[],error:null};
      if(name==="pci_search_port_directory")return {data:[{...db.pci_v_ports_list[0],terminal_name:"Test Terminal",port_facility_id:"facility1"}],error:null};
      window.__pciFixture.writes.push({rpc:name,args});return {data:[],error:null};
    }
  };
  window.AUTH={
    requireAuth:async()=>({user:{id:"user1"},profile:{role:role==="vessel"?"vessel":viewOnly?"company_superintendent":"super_admin",company_id:"company1",vessel_id:role==="vessel"?"vessel1":null}}),
    ensureSupabase:()=>sb,fillUserBadge:()=>{},setupAuthButtons:async()=>{},
    isPlatformAdminRole:r=>r==="super_admin"
  };
})();
