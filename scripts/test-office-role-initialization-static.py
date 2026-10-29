"""Offline source-contract checks only. No SQL execution, network or accounts.

Run: PYTHONDONTWRITEBYTECODE=1 python scripts/test-office-role-initialization-static.py
These checks are NOT a substitute for transactional PostgreSQL/RPC tests.
"""
import hashlib
from pathlib import Path
import re
import unittest

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261029060419_office_role_creation_isolated_defaults.sql"
SQL = MIGRATION.read_text()
ROLE_UI = (ROOT / "public/csvb-role-management.js").read_text()
RIGHTS_UI = (ROOT / "public/csvb-rights-sections.js").read_text()
ORIGINAL_CATALOGUE = (ROOT / "supabase/migrations/20261030140000_draft_office_role_catalogue.sql").read_text()
ORIGINAL_DEFAULTS = (ROOT / "supabase/migrations/20261029031525_office_role_isolated_defaults.sql").read_text()
FUNCTIONS = {
    name: body for name, body in re.findall(
        r"create function ([\w.]+)\(.*?as \$\$(.*?)\$\$;",
        SQL, re.S | re.I
    )
}
INIT = FUNCTIONS["csvb_office_auth_private.initialize_role_defaults"]
CHANGE = FUNCTIONS["public.csvb_role_catalogue_change"]
ENABLE = FUNCTIONS["public.csvb_admin_office_role_enable_assignment"]
LIST = FUNCTIONS["public.csvb_role_catalogue_list"]
RENAME = CHANGE.split("if p_action='rename' then", 1)[1].split("if p_action='delete' then", 1)[0]
DELETE = CHANGE.split("if p_action='delete' then", 1)[1]


class InitializationContracts(unittest.TestCase):
    def test_applied_office_migration_content_preserved(self):
        path = ROOT / "supabase/migrations/20261029031525_office_role_isolated_defaults.sql"
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),
                         "b135f821c6aca3ee05109f3ca8bd157f5bde951d2191ab9a8c433d6bdaa2b64b")

    def test_applied_vessel_migration_content_preserved(self):
        path = ROOT / "supabase/migrations/20261106100000_vessel_particulars_editor.sql"
        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),
                         "3e88154957a4c5726a6749645c073dc790f9dfc60a93d4bd204544ecb2c86a9f")

    def test_filename_unique(self):
        self.assertEqual(len(list(MIGRATION.parent.glob("20261029060419_*.sql"))), 1)

    def test_reviewed_legacy_body_guard(self):
        body = re.search(r"create function public.csvb_role_catalogue_change\(.*?as \$\$(.*?)\$\$;",
                         ORIGINAL_CATALOGUE, re.S).group(1)
        self.assertIn(hashlib.md5(body.encode()).hexdigest(), SQL)
        for guard in ["role::text='super_admin'", "coalesce(is_active,true)",
                      "not coalesce(is_disabled,false)"]:
            self.assertIn(guard, ORIGINAL_CATALOGUE)

    def test_reviewed_default_read_guard(self):
        body = re.search(r"create or replace function public.csvb_admin_office_role_defaults\(.*?as \$\$(.*?)\$\$;",
                         ORIGINAL_DEFAULTS, re.S).group(1)
        self.assertIn(hashlib.md5(body.encode()).hexdigest(), SQL)

    def test_admin_guard_and_unreviewed_callers_fail_closed(self):
        body = re.search(r"create function public.csvb_role_catalogue_require_super_admin\(\).*?as \$\$(.*?)\$\$;",
                         ORIGINAL_CATALOGUE, re.S).group(1)
        self.assertIn(hashlib.md5(body.encode()).hexdigest(), SQL)
        self.assertIn("Unreviewed database catalogue callers exist", SQL)

    def test_installation_has_no_top_level_data_changes(self):
        stripped = re.sub(r"(?P<q>\$(?:[a-z_][a-z0-9_]*)?\$).*?(?P=q)",
                          "'function body'", SQL, flags=re.S | re.I)
        stripped = re.sub(r"--[^\n]*", "", stripped)
        for statement in stripped.split(";"):
            statement = statement.strip()
            if statement:
                self.assertRegex(statement.lower(),
                    r"^(begin|set local|do|alter function|revoke|create function|grant|notify|commit)\b")
        self.assertNotRegex(stripped.lower(), r"\b(insert into|update public|delete from|truncate)\b")

    def test_atomic_installation_and_operations(self):
        self.assertEqual(SQL.count("\nbegin;"), 1)
        self.assertEqual(SQL.count("\ncommit;"), 1)
        for body in FUNCTIONS.values():
            self.assertNotRegex(body.lower(), r"\b(commit|rollback)\s*;")
        self.assertLess(CHANGE.index("result := csvb_office_auth_private.csvb_role_catalogue_change"),
                        CHANGE.index("perform csvb_office_auth_private.initialize_role_defaults"))
        self.assertNotIn("when others", SQL.lower())

    def test_all_new_functions_require_active_super_admin(self):
        self.assertEqual(len(FUNCTIONS), 4)
        for name, body in FUNCTIONS.items():
            with self.subTest(name=name):
                self.assertIn("perform public.csvb_role_catalogue_require_super_admin();", body)

    def test_legacy_implementations_private_and_revoked(self):
        for name in ["csvb_role_catalogue_change(text,text,text)", "csvb_role_catalogue_list()"]:
            self.assertIn("alter function public." + name + "\n  set schema csvb_office_auth_private", SQL)
        self.assertIn("csvb_office_auth_private.csvb_role_catalogue_list() from public,anon,authenticated", SQL)
        self.assertIn("revoke all on function csvb_office_auth_private.initialize_role_defaults(text)", SQL)

    def test_unique_active_profile_without_legacy_fallback(self):
        self.assertIn("ap := 'office_role_'||md5(r.code)", INIT)
        self.assertIn("null,true", INIT)
        self.assertNotIn("on conflict", INIT.lower())
        self.assertIn("r.ever_used or r.is_assignable or r.default_access_profile_code is not null", INIT)
        self.assertIn("values(r.code,ap,ap,auth.uid())", INIT)

    def test_explicit_documented_minimum_not_shared_copy(self):
        self.assertIn("'company'::public.permission_scope", INIT)
        self.assertIn("(m.code='M02_SHIP_INSPECTION_REPORT' and p.action='view' and m.is_active)", INIT)
        self.assertNotIn("standard_office_view_only", INIT)
        self.assertNotIn("company_administrator_access", INIT)
        self.assertNotIn("from public.role_permissions", INIT)
        self.assertIn("20261030140000", INIT)
        self.assertIn("20261108120000", INIT)

    def test_initialization_retains_draft_status_and_audit(self):
        self.assertNotIn("set is_assignable=true", INIT)
        self.assertIn("'is_assignable',false", CHANGE)
        self.assertIn("public.csvb_office_access_audit", INIT)
        self.assertIn("public.csvb_role_catalogue_audit", INIT)

    def test_draft_editor_does_not_remove_save_safeguards(self):
        self.assertIn("'is_active'',r.is_active and ap.is_active,''is_assignable'',r.is_assignable", SQL)
        self.assertNotIn("create or replace function public.csvb_admin_office_role_defaults_save", SQL)
        self.assertNotIn("alter function public.csvb_admin_office_role_defaults_save", SQL)
        self.assertIn("b.revision is distinct from p_expected_revision", ORIGINAL_DEFAULTS)
        self.assertIn("public.csvb_admin_office_access_save", ORIGINAL_DEFAULTS)

    def test_assignment_separate_explicit_and_enforced(self):
        self.assertIn("where enforcement_enabled", ENABLE)
        self.assertIn("Audit reason required", ENABLE)
        self.assertIn("b.revision is distinct from p_expected_revision", ENABLE)
        self.assertIn("(snapshot->>'fingerprint') is distinct from p_expected_fingerprint", ENABLE)
        self.assertIn("for update", ENABLE)
        self.assertIn("legacy_baseline is not null", ENABLE)
        self.assertIn("g.scope::text='global' or m.code='SU_ADMIN' or not m.is_active", ENABLE)
        self.assertEqual(SQL.count("set is_assignable=true"), 1)

    def test_delete_rechecks_external_dependencies_and_preserves_original_bindings(self):
        for guard in ["r.ever_used", "permission_reference_count", "assigned_user_count",
                      "public.csvb_office_account_creation_requests", "office_access_profile_code",
                      "code<>r.code", "role_code<>r.code",
                      "b.source_access_profile_code<>b.access_profile_code"]:
            self.assertIn(guard, CHANGE)
        self.assertLess(CHANGE.index("lock table public.profiles"), CHANGE.index("delete from"))
        self.assertIn("when foreign_key_violation then", CHANGE)
        self.assertIn("Deactivate instead", CHANGE)

    def test_delete_only_owned_generated_records_in_fk_order(self):
        targets = re.findall(r"delete from ([\w.]+)", CHANGE, re.I)
        self.assertEqual(targets, ["public.csvb_office_role_permission_bindings",
                                  "public.csvb_office_access_profile_permissions",
                                  "public.csvb_office_access_profiles"])
        self.assertIn("set default_access_profile_code=null where code=r.code", CHANGE)
        self.assertIn("to_jsonb(b)", CHANGE)
        self.assertIn("jsonb_agg(to_jsonb(g)", CHANGE)
        self.assertIn("insert into public.csvb_office_access_audit", CHANGE)
        self.assertNotRegex(SQL.lower(), r"delete from .*audit")
        self.assertNotIn("cascade", SQL.lower())

    def test_existing_lifecycle_operations_delegate_unchanged(self):
        # Create, metadata-synchronized rename, then the other legacy actions.
        self.assertEqual(CHANGE.count("csvb_office_auth_private.csvb_role_catalogue_change("), 3)
        self.assertNotIn("set is_active=", CHANGE)
        self.assertNotIn("update public.profiles", SQL.lower())
        self.assertNotIn("csvb_office_user_permission_overrides", SQL)
        self.assertNotIn("supabase_migrations", SQL)

    def test_ui_can_list_initialized_unassignable_drafts(self):
        start = RIGHTS_UI.index("async function loadRoleOptions")
        end = RIGHTS_UI.index("function companyRender", start)
        loader = RIGHTS_UI[start:end]
        self.assertIn('rpc("csvb_role_catalogue_list")', loader)
        self.assertNotIn('rpc("csvb_admin_office_creation_options")', loader)
        self.assertNotIn("r.is_assignable", loader)
        self.assertIn("r.has_isolated_defaults !== false", loader)
        self.assertIn('rpc("csvb_admin_office_role_defaults"', RIGHTS_UI)

    def test_ui_still_reloads_after_audited_role_save(self):
        self.assertIn('rpc("csvb_admin_office_role_defaults_save"', RIGHTS_UI)
        self.assertIn("p_expected_fingerprint: roleSnapshot.fingerprint", RIGHTS_UI)
        self.assertIn('const actual = await rpc("csvb_admin_office_role_defaults"', RIGHTS_UI)

    def test_explicit_custom_borrowers_included_in_impact_confirmation(self):
        self.assertIn("p.office_role_code=b.role_code or p.office_access_profile_code=b.access_profile_code", SQL)
        self.assertIn("explicit custom borrowers", RIGHTS_UI)
        self.assertIn("Other role defaults are not changed", RIGHTS_UI)

    def test_ui_compatibility_capability_gate(self):
        self.assertIn("data.isolated_role_initialization === 1", ROLE_UI)
        self.assertIn("role.can_enable_assignment === true", ROLE_UI)
        self.assertIn("role.deletion_block_reason", ROLE_UI)
        self.assertIn("'isolated_role_initialization',1", LIST)
        self.assertIn("'can_enable_assignment'", LIST)

    def test_assignment_ui_requires_snapshot_reason_and_backend_confirmation(self):
        self.assertIn('sb.rpc("csvb_admin_office_role_defaults"', ROLE_UI)
        self.assertIn('name="assignment_reason"', ROLE_UI)
        self.assertIn("p_expected_revision: assignmentSnapshot?.revision", ROLE_UI)
        self.assertIn("p_expected_fingerprint: assignmentSnapshot?.fingerprint", ROLE_UI)
        self.assertIn("result.data.is_assignable !== true", ROLE_UI)

    def test_ui_change_notifications_preserve_unsaved_rights(self):
        self.assertIn('new CustomEvent("csvb:role-catalogue-changed")', ROLE_UI)
        self.assertIn("if (!roleBusy && !roleChanges.size)", RIGHTS_UI)

    def test_cache_busters_for_changed_scripts(self):
        html = (ROOT / "public/su-admin.html").read_text()
        for name in ["csvb-role-management.js", "csvb-rights-sections.js"]:
            self.assertIn(name + "?v=20261029_new_role_isolation_2", html)


class RenameAndLockRegressionContracts(unittest.TestCase):
    """Source-driven examples and lock-schedule models, NOT SQL execution."""

    def profile_name_expressions(self):
        initial = re.search(r"values\(ap,(.+),null,true\);", INIT).group(1)
        renamed = re.search(r"set display_name=(.+),updated_at=now\(\)", RENAME).group(1)
        self.assertEqual(initial, renamed)
        return initial, renamed

    def profile_name(self, expression, label, code):
        # Evaluate only the actual SQL's concatenation expression as a static
        # example. Reject any unrecognized term rather than simulating SQL.
        result = []
        for term in expression.split("||"):
            term = term.strip()
            if term == "r.display_name":
                result.append(label)
            elif term == "r.code":
                result.append(code)
            elif re.fullmatch(r"'(?:[^']|'')*'", term):
                result.append(term[1:-1].replace("''", "'"))
            else:
                self.fail("Unreviewed profile label expression: " + term)
        return "".join(result)

    def test_rename_then_reuse_vacated_name_with_active_permissions(self):
        initial, renamed = self.profile_name_expressions()
        code_a, code_b = "office_draft_" + "a" * 32, "office_draft_" + "b" * 32
        state = {
            "role_code": code_a, "profile_code": "office_role_" + hashlib.md5(code_a.encode()).hexdigest(),
            "is_active": True, "is_assignable": True, "revision": 7,
            "grants": {"M02/view": True, "M02/edit": False, "SU_ADMIN/view": False},
        }
        first = self.profile_name(initial, "Office Control", code_a)
        after = self.profile_name(renamed, "Office Support", code_a)
        reused = self.profile_name(initial, "Office Control", code_b)
        state.update(display_name=first, updated_at="before rename")
        authority = lambda row: {key: value for key, value in row.items()
                                 if key not in {"display_name", "updated_at"}}
        before = repr(authority(state))
        state.update(display_name=after, updated_at="after rename")
        self.assertNotEqual(first, after)
        self.assertNotEqual(after, reused)
        self.assertNotEqual(first, reused)
        self.assertEqual(len({after, reused}), 2)
        # Continuity is also tied to the SQL below, not merely this example.
        self.assertEqual(before, repr(authority(state)))
        update = re.search(r"update public.csvb_office_access_profiles(.*?)returning", RENAME, re.S).group(1)
        self.assertRegex(update, r"set display_name=.*?,updated_at=now\(\)")
        self.assertNotRegex(update.split("where", 1)[0], r"\b(code|is_active|legacy_baseline)\s*=")
        self.assertNotRegex(RENAME, r"(update|delete from|insert into) public\.csvb_office_(role_permission_bindings|access_profile_permissions|user_permission_overrides)")
        self.assertNotIn("revision=", RENAME)

    def test_new_labels_cannot_equal_old_migrated_label_format(self):
        initial, _ = self.profile_name_expressions()
        for label in ["Office Control", "Office Support", "Marine Operations"]:
            name = self.profile_name(initial, label, "office_draft_" + "a" * 32)
            self.assertTrue(name.endswith("office_draft_" + "a" * 32 + "]"))
            self.assertFalse(name.endswith(" — Role defaults"))
        # Original copied profiles use the unsuffixed format; none are updated.
        self.assertIn("r.display_name||' — Role defaults'", ORIGINAL_DEFAULTS)
        for ownership_guard in [
            "b.source_access_profile_code=b.access_profile_code",
            "b.access_profile_code='office_role_'||md5(r.code)",
            "r.default_access_profile_code=b.access_profile_code",
        ]:
            self.assertIn(ownership_guard, RENAME)

    def test_rename_keeps_legacy_validation_and_audits_metadata_atomically(self):
        self.assertLess(RENAME.index("into strict profile_before"), RENAME.index("result := csvb_office_auth_private"))
        self.assertLess(RENAME.index("result := csvb_office_auth_private"), RENAME.index("set display_name="))
        self.assertIn("'profile',profile_before", RENAME)
        self.assertIn("'profile',profile_after", RENAME)
        self.assertIn("insert into public.csvb_office_access_audit", RENAME)
        self.assertIn("exception when lock_not_available", CHANGE)
        self.assertNotIn("when unique_violation", CHANGE)  # Collisions roll back, never overwrite.

    def test_every_delete_table_lock_fails_fast_and_covers_legacy_tables(self):
        locks = re.findall(r"lock table (.*?) in (share row exclusive|share) mode(.*?);",
                           DELETE, re.S)
        self.assertEqual(len(locks), 2)
        self.assertTrue(all(suffix.strip() == "nowait" for _, _, suffix in locks))
        held = {table.strip() for tables, _, _ in locks for table in tables.split(",")}
        legacy = re.search(r"lock table (.*?) in share mode;", ORIGINAL_CATALOGUE, re.S).group(1)
        self.assertTrue({table.strip() for table in legacy.split(",")} <= held)
        expected = {
            "public.profiles", "public.csvb_office_account_creation_requests",
            "public.csvb_office_role_catalogue", "public.csvb_office_role_permission_bindings",
            "public.csvb_office_access_profiles", "public.csvb_office_access_profile_permissions",
        }
        self.assertEqual({t.strip() for t in locks[0][0].split(",")}, expected)
        self.assertEqual(locks[0][1], "share row exclusive")

    def test_every_delete_and_rename_row_lock_fails_fast(self):
        for name, section, count in [("delete", DELETE, 4), ("rename", RENAME, 3)]:
            with self.subTest(operation=name):
                locks = re.findall(r"for update(?: of \w+)?(.*?);", section, re.S)
                self.assertEqual(len(locks), count)
                self.assertTrue(all(suffix.strip() == "nowait" for suffix in locks))
        self.assertIn("order by permission_id for update nowait", DELETE)
        self.assertLess(DELETE.index("in share mode nowait"), DELETE.index("for update nowait"))
        self.assertLess(DELETE.index("order by permission_id for update nowait"), DELETE.index("delete from"))

    def test_identified_save_delete_wait_cycle_is_cut_not_moved(self):
        save = ORIGINAL_DEFAULTS.split("function public.csvb_admin_office_role_defaults_save", 1)[1]
        self.assertLess(save.index("where role_code=p_role_code for update"),
                        save.index("where code=b.access_profile_code for update"))
        self.assertLess(save.index("where code=b.access_profile_code for update"),
                        save.index("public.csvb_admin_office_access_save"))
        # Model the reviewed two-transaction schedule:
        # save owns binding row; delete owns tables; save needs permission writes.
        # A waiting delete row acquisition makes a cycle. NOWAIT instead aborts
        # delete's block, releases its locks and lets save continue.
        edges_before = {"save": {"delete"}, "delete": {"save"}}
        binding_suffix = re.search(
            r"where role_code=p_role_code for update(.*?);", DELETE, re.S).group(1).strip()
        edges_after = {"save": {"delete"}, "delete": set() if binding_suffix == "nowait" else {"save"}}
        self.assertTrue("save" in edges_before["delete"] and "delete" in edges_before["save"])
        self.assertFalse("save" in edges_after["delete"] and "delete" in edges_after["save"])
        self.assertIn("using errcode='55P03'", CHANGE)
        self.assertIn("No changes saved. Reload and retry.", CHANGE)

    def test_assignment_creation_and_enablement_serialization_guards_remain(self):
        assignment = (ROOT / "supabase/migrations/20261102100000_manual_office_user_assignment.sql").read_text()
        creation = (ROOT / "supabase/migrations/20261104100000_office_account_creation.sql").read_text()
        self.assertIn("select * into p from public.profiles where id=p_profile_id for update", assignment)
        self.assertIn("set ever_used=true where code=new.office_role_code", assignment)
        self.assertIn("where id=p_request_id for update", creation)
        self.assertIn("references public.csvb_office_role_catalogue(code) on delete restrict", creation)
        self.assertIn("references public.csvb_office_access_profiles(code) on delete restrict", creation)
        self.assertLess(ENABLE.index("where code=p_role_code for update"),
                        ENABLE.index("where role_code=r.code for update"))
        self.assertLess(ENABLE.index("where role_code=r.code for update"),
                        ENABLE.index("where code=b.access_profile_code for update"))
        self.assertIn("public.csvb_office_account_creation_requests", DELETE)
        self.assertIn("b.source_access_profile_code<>b.access_profile_code", DELETE)
        self.assertIn("exception when lock_not_available", CHANGE)
        self.assertIn("when foreign_key_violation", CHANGE)

    def test_ui_and_audit_do_not_claim_snapshot_was_human_reviewed(self):
        self.assertIn("Fetched revision:", ROLE_UI)
        self.assertNotIn("Reviewed revision:", ROLE_UI)
        self.assertIn("not evidence of a human review", ROLE_UI)
        self.assertNotIn("Prepared profiles do not yet change legacy effective access", ROLE_UI)
        self.assertIn("when backend enforcement is active", ROLE_UI)
        self.assertIn("'confirmed_revision'", ENABLE)
        self.assertIn("'confirmed_fingerprint'", ENABLE)
        self.assertNotIn("'reviewed_revision'", ENABLE)
        self.assertNotIn("No role writes:", RIGHTS_UI)


if __name__ == "__main__":
    unittest.main(verbosity=2)
