import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from tools.dashboard import generate_dashboard as gd


class DashboardGeneratorTest(unittest.TestCase):
    def test_output_filename_uses_yymmdd(self):
        self.assertEqual(
            gd.output_filename(date(2026, 6, 4)),
            "platfos_dashboard_260604.html",
        )

    def test_week_label_uses_month_week_number(self):
        self.assertEqual(gd.week_label(date(2026, 6, 4)), "6월 1주차")
        self.assertEqual(gd.korean_weekday(date(2026, 6, 4)), "목")

    def test_normalize_issue_maps_jira_fields(self):
        issue = {
            "key": "PG-1",
            "fields": {
                "summary": "테스트 이슈",
                "status": {"name": "진행 중"},
                "labels": ["core", "s3"],
                "assignee": {"displayName": "최다솔"},
                "duedate": "2026-06-05",
                "customfield_10015": "2026-06-01",
                "issuetype": {"name": "작업"},
                "components": [{"name": "partners-order"}],
                "priority": {"name": "High"},
            },
        }

        self.assertEqual(
            gd.normalize_issue(issue),
            {
                "type": "작업",
                "key": "PG-1",
                "title": "테스트 이슈",
                "status": "진행 중",
                "comp": "partners-order",
                "label": "core,s3",
                "owner": "최다솔",
                "due": "2026-06-05",
                "priority": "High",
                "start": "2026-06-01",
            },
        )

    def test_diff_snapshots_detects_added_removed_and_changed_fields(self):
        old = [
            {"key": "PG-1", "title": "A", "status": "대기", "owner": "", "due": "", "label": "core", "comp": "api"},
            {"key": "PG-2", "title": "B", "status": "진행 중", "owner": "박창용", "due": "", "label": "", "comp": ""},
        ]
        new = [
            {"key": "PG-1", "title": "A2", "status": "진행 중", "owner": "최다솔", "due": "2026-06-05", "label": "grow", "comp": "cms"},
            {"key": "PG-3", "title": "C", "status": "대기", "owner": "", "due": "", "label": "", "comp": ""},
        ]

        changes = gd.diff_snapshots(old, new)
        compact = [(c["type"], c["key"], c["field"], c["before"], c["after"]) for c in changes]

        self.assertIn(("removed", "PG-2", "제거", "진행 중", "제거"), compact)
        self.assertIn(("added", "PG-3", "신규", "—", "추가됨"), compact)
        self.assertIn(("changed", "PG-1", "상태", "대기", "진행 중"), compact)
        self.assertIn(("changed", "PG-1", "담당자", "", "최다솔"), compact)
        self.assertIn(("changed", "PG-1", "기한", "", "2026-06-05"), compact)
        self.assertIn(("changed", "PG-1", "요약", "A", "A2"), compact)
        self.assertIn(("changed", "PG-1", "레이블", "core", "grow"), compact)
        self.assertIn(("changed", "PG-1", "컴포넌트", "api", "cms"), compact)

    def test_build_member_store_uses_progress_only_for_overdue(self):
        issues = [
            {"key": "PG-1", "title": "막힘", "status": "막힘", "owner": "최다솔", "due": "2026-06-03", "start": ""},
            {"key": "PG-2", "title": "배포", "status": "배포대기", "owner": "김명수", "due": "2026-06-03", "start": ""},
            {"key": "PG-3", "title": "진행", "status": "진행 중", "owner": "박창용", "due": "2026-06-03", "start": ""},
        ]

        store = gd.build_member_store(issues, date(2026, 6, 4))

        self.assertEqual(store["최다솔"]["signal"], "red")
        self.assertEqual(store["김명수"]["overdue"], [])
        self.assertEqual(store["박창용"]["signal"], "yellow")
        self.assertEqual(store["박창용"]["overdue"][0]["key"], "PG-3")

    def test_render_html_replaces_known_constants_and_header(self):
        template = """
<title>Platfos 프로젝트 현황 — 2026-06-04 (최종)</title>
<div class="tb-sub">기준일: 2026-06-04 (목) [최종] &nbsp;·&nbsp; 303개 이슈 (API·보류제외) &nbsp;·&nbsp; 6/2 대비 19건 변경</div>
<script>
const MEMBER_STORE={};
const SEQ_STORE={};
const _JB='https://platfos.atlassian.net/browse/',_TD='2026-06-04',_D7='2026-06-11';
const RAW_DATA  = [];
const CHANGES   = [];
const WS_OWNERS = {};
const WS_HEATMAP = {};
const WS_MAX = 0;
const WS_DATE = '2026-06-04';
const WS_WEEK = '6월 1주차';
const today = new Date('2026-06-04'); today.setHours(0,0,0,0);
</script>
<div class="panel on" id="p-status">
<div style="background:linear-gradient(135deg,#14532D,#166534)">6월 1주차 목요일 [최종] — 블로커 3→1건!<div>303</div></div>
</div>
<div class="footer">Platfos · Pongift 프로젝트 현황 &nbsp;·&nbsp; 기준일: 2026-06-04 (목) [최종] &nbsp;·&nbsp; 303개 이슈 &nbsp;·&nbsp; 6/2 대비 19건 변경</div>
<div id="plat-modal"></div>
"""
        html = gd.render_html(
            template,
            target_date=date(2026, 6, 5),
            issues=[{"key": "PG-1", "title": "A", "status": "대기", "owner": "", "due": "", "start": "", "label": "", "comp": "", "type": "작업", "priority": "Medium"}],
            changes=[],
        )

        self.assertIn("2026-06-05", html)
        self.assertIn("platfos.atlassian.net/browse", html)
        self.assertIn('"key":"PG-1"', html)
        self.assertNotIn("_TD='2026-06-04'", html)
        self.assertNotIn("303개 이슈", html)
        self.assertNotIn("블로커 3→1건", html)
        self.assertIn("6월 1주차 금요일 실행 상황판", html)
        self.assertIn("1개 이슈 &nbsp;·&nbsp; 직전 대비 0건 변경", html)

    def test_render_html_replaces_history_title_and_filter_counts(self):
        template = """
<title>Platfos 프로젝트 현황 — 2026-06-04 (최종)</title>
<div class="tb-sub">기준일: 2026-06-04 (목) [최종] &nbsp;·&nbsp; 303개 이슈 (API·보류제외) &nbsp;·&nbsp; 6/2 대비 19건 변경</div>
<div class="card-title">변경 이력 — 6/2(화) → 2026-06-04(목·최종)
<div id="hist-filter">
  <button class="hf-btn on" onclick="filterHist('all')">전체 (19)</button>
  <button class="hf-btn" onclick="filterHist('added')">신규 (4)</button>
  <button class="hf-btn" onclick="filterHist('removed')">제거 (9)</button>
  <button class="hf-btn" onclick="filterHist('title')">요약 (1)</button>
  <button class="hf-btn" onclick="filterHist('label')">레이블 (1)</button>
  <button class="hf-btn" onclick="filterHist('comp')">컴포넌트 (102)</button>
</div>
<script>
const MEMBER_STORE={};
const SEQ_STORE={};
const _JB='https://platfos.atlassian.net/browse/',_TD='2026-06-04',_D7='2026-06-11';
const RAW_DATA  = [];
const CHANGES   = [];
const WS_OWNERS = {};
const WS_HEATMAP = {};
const WS_MAX = 0;
const WS_DATE = '2026-06-04';
const WS_WEEK = '6월 1주차';
const today = new Date('2026-06-04'); today.setHours(0,0,0,0);
</script>
"""
        changes = [
            {"type": "added", "key": "PG-1", "field": "신규", "title": "A", "before": "—", "after": "추가됨"},
            {"type": "removed", "key": "PG-2", "field": "제거", "title": "B", "before": "대기", "after": "제거"},
            {"type": "changed", "key": "PG-3", "field": "요약", "title": "C", "before": "old", "after": "new"},
            {"type": "changed", "key": "PG-4", "field": "레이블", "title": "D", "before": "core", "after": "grow"},
        ]

        html = gd.render_html(
            template,
            target_date=date(2026, 6, 5),
            issues=[],
            changes=changes,
        )

        self.assertIn("변경 이력 — 직전 스냅샷 → 2026-06-05(금)", html)
        self.assertIn("전체 (4)", html)
        self.assertIn("신규 (1)", html)
        self.assertIn("제거 (1)", html)
        self.assertIn("요약 (1)", html)
        self.assertIn("레이블 (1)", html)
        self.assertIn("컴포넌트 (0)", html)
        self.assertNotIn("6/2(화)", html)
        self.assertNotIn("컴포넌트 (102)", html)

    def test_render_html_refreshes_status_panel_and_preserves_monthly_template(self):
        template = """
<title>Platfos 프로젝트 현황 — 2026-06-04 (최종)</title>
<div class="tb-sub">기준일: 2026-06-04 (목) [최종] &nbsp;·&nbsp; 303개 이슈 (API·보류제외) &nbsp;·&nbsp; 6/2 대비 19건 변경</div>
<script>
const MEMBER_STORE={};
const SEQ_STORE={};
const _JB='https://platfos.atlassian.net/browse/',_TD='2026-06-04',_D7='2026-06-11';
const RAW_DATA  = [];
const CHANGES   = [];
const WS_OWNERS = {};
const WS_HEATMAP = {};
const WS_MAX = 0;
const WS_DATE = '2026-06-04';
const WS_WEEK = '6월 1주차';
const today = new Date('2026-06-04'); today.setHours(0,0,0,0);
</script>
<div class="panel" id="p-monthly">월별업무 원본 구성</div>
<div class="panel on" id="p-status">
<div style="background:linear-gradient(135deg,#14532D,#166534)">6월 1주차 목요일 [최종] — 블로커 3→1건!<div>303</div><div>내일(6/5) 기한 4건 집중 필요</div></div>
</div>
<div class="footer">Platfos · Pongift 프로젝트 현황 &nbsp;·&nbsp; 기준일: 2026-06-04 (목) [최종] &nbsp;·&nbsp; 303개 이슈 &nbsp;·&nbsp; 6/2 대비 19건 변경</div>
<!-- MODAL -->
"""
        html = gd.render_html(
            template,
            target_date=date(2026, 6, 8),
            issues=[
                {"key": "PG-1", "title": "진행", "status": "진행 중", "owner": "최다솔", "due": "2026-06-08", "start": "", "label": "s2,core", "comp": "", "type": "작업", "priority": "High"},
                {"key": "PG-2", "title": "막힘", "status": "막힘", "owner": "김명수", "due": "2026-06-10", "start": "", "label": "s3,run", "comp": "", "type": "작업", "priority": "High"},
            ],
            changes=[{"type": "added", "key": "PG-2", "field": "신규", "title": "막힘", "before": "—", "after": "추가됨"}],
        )

        self.assertIn("6월 2주차 월요일 실행 상황판", html)
        self.assertIn("기준일 2026-06-08", html)
        self.assertIn("2개", html)
        self.assertIn("직전 대비 1건 변경", html)
        self.assertNotIn("6월 1주차 목요일 [최종]", html)
        self.assertNotIn("내일(6/5)", html)
        self.assertNotIn("303개 이슈", html)
        self.assertIn('id="p-monthly"', html)
        self.assertIn("월별업무 원본 구성", html)

    def test_load_offline_json_accepts_issue_list_or_jira_response(self):
        with tempfile.TemporaryDirectory() as tmp:
            issue_path = Path(tmp) / "issues.json"
            jira_path = Path(tmp) / "jira.json"
            issue_path.write_text(json.dumps([{"key": "PG-1"}]), encoding="utf-8")
            jira_path.write_text(json.dumps({"issues": [{"key": "PG-2", "fields": {}}]}), encoding="utf-8")

            self.assertEqual(gd.load_offline_json(issue_path), [{"key": "PG-1"}])
            self.assertEqual(gd.load_offline_json(jira_path), [{"key": "PG-2", "fields": {}}])

    def test_save_snapshot_skips_identical_issue_cache(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache_path = Path(tmp) / "latest.json"
            issues = [{"key": "PG-1", "title": "A"}]
            cache_path.write_text(
                json.dumps({"generated_at": "old", "issues": issues}, ensure_ascii=False),
                encoding="utf-8",
            )

            gd.save_snapshot(cache_path, issues, "new")
            self.assertEqual(json.loads(cache_path.read_text(encoding="utf-8"))["generated_at"], "old")

            gd.save_snapshot(cache_path, [{"key": "PG-2", "title": "B"}], "new")
            payload = json.loads(cache_path.read_text(encoding="utf-8"))
            self.assertEqual(payload["generated_at"], "new")
            self.assertEqual(payload["issues"], [{"key": "PG-2", "title": "B"}])

    def test_generate_dashboard_writes_main_and_mirror_outputs(self):
        template = """
<title>x</title>
<div class="tb-sub">기준일: 2026-06-04 (목) [최종] &nbsp;·&nbsp; 303개 이슈 (API·보류제외) &nbsp;·&nbsp; 6/2 대비 19건 변경</div>
<script>
const MEMBER_STORE={};
const SEQ_STORE={};
const _JB='https://platfos.atlassian.net/browse/',_TD='2026-06-04',_D7='2026-06-11';
const RAW_DATA  = [];
const CHANGES   = [];
const WS_OWNERS = {};
const WS_HEATMAP = {};
const WS_MAX = 0;
const WS_DATE = '2026-06-04';
const WS_WEEK = '6월 1주차';
const today = new Date('2026-06-04'); today.setHours(0,0,0,0);
</script>
"""
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            template_path = root / "template.html"
            main_dir = root / "public" / "data"
            mirror_dir = root / "Source" / "대시보드"
            template_path.write_text(template, encoding="utf-8")

            out = gd.generate_dashboard(
                target_date=date(2026, 6, 4),
                template_path=template_path,
                output_dir=main_dir,
                cache_file=root / "cache" / "latest.json",
                raw_issues=[],
                write_cache=False,
                mirror_output_dirs=[mirror_dir],
            )

            self.assertEqual(out, main_dir / "platfos_dashboard_260604.html")
            self.assertTrue(out.exists())
            self.assertTrue((mirror_dir / "platfos_dashboard_260604.html").exists())
            self.assertEqual(
                out.read_text(encoding="utf-8"),
                (mirror_dir / "platfos_dashboard_260604.html").read_text(encoding="utf-8"),
            )


if __name__ == "__main__":
    unittest.main()
