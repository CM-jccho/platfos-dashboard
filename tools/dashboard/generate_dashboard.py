#!/usr/bin/env python3
"""Generate the Platfos Jira dashboard HTML."""

from __future__ import annotations

import argparse
import base64
import html as html_lib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Optional


JIRA_BASE_URL = "https://platfos.atlassian.net"
JIRA_BROWSE_URL = "https://platfos.atlassian.net/browse/"
JQL = "project = PG AND status NOT IN (완료, Done, 후속작업, 보류) ORDER BY created DESC"
DONE_STATUSES = {"완료", "Done", "done"}
PROGRESS_STATUSES = {"진행 중"}
DEPLOY_STATUSES = {"배포대기"}
TEAM_MEMBERS = ["최다솔", "김명수", "이강미", "박창용", "이지헌", "이웅식", "김희진", "장석원"]
PLAN_TEAM = ["최다솔", "김명수", "이강미"]
DEV_TEAM = ["박창용", "이지헌", "김희진", "장석원"]
SEQ = {
    "s1": "온보딩",
    "s2": "상품채널",
    "s3": "주문발행",
    "s4": "사용인증",
    "s5": "환불취소",
    "s6": "정산",
    "s7": "운영통제",
    "s8": "외부연동",
}
PF_KEYS = ["run", "core", "grow", "expand"]
WATCH_FIELDS = [
    ("status", "상태"),
    ("owner", "담당자"),
    ("due", "기한"),
    ("title", "요약"),
    ("label", "레이블"),
    ("comp", "컴포넌트"),
]


def korean_weekday(day: date) -> str:
    return ["월", "화", "수", "목", "금", "토", "일"][day.weekday()]


def week_label(day: date) -> str:
    first = day.replace(day=1)
    week = ((day.day + first.weekday() - 1) // 7) + 1
    return f"{day.month}월 {week}주차"


def output_filename(day: date) -> str:
    return f"platfos_dashboard_{day.strftime('%y%m%d')}.html"


def parse_date(value: str) -> Optional[date]:
    if not value:
        return None
    return datetime.strptime(value, "%Y-%m-%d").date()


def issue_sort_key(issue: Mapping[str, Any]) -> int:
    match = re.search(r"(\d+)$", issue.get("key", ""))
    return -int(match.group(1)) if match else 0


def compact_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def normalize_issue(issue: Mapping[str, Any]) -> Dict[str, Any]:
    fields = issue.get("fields", {}) or {}
    assignee = fields.get("assignee") or {}
    status = fields.get("status") or {}
    issue_type = fields.get("issuetype") or {}
    priority = fields.get("priority") or {}
    components = fields.get("components") or []
    labels = fields.get("labels") or []
    return {
        "type": issue_type.get("name", ""),
        "key": issue.get("key", ""),
        "title": fields.get("summary", ""),
        "status": status.get("name", ""),
        "comp": ",".join(c.get("name", "") for c in components if c.get("name")),
        "label": ",".join(labels),
        "owner": assignee.get("displayName", "") if assignee else "",
        "due": fields.get("duedate") or "",
        "priority": priority.get("name", "") if priority else "",
        "start": fields.get("customfield_10015") or "",
    }


def load_offline_json(path: Path) -> List[Mapping[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("issues"), list):
        return payload["issues"]
    raise ValueError(f"Unsupported offline JSON shape: {path}")


def jira_request(url: str, email: str, token: str, payload: Mapping[str, Any]) -> Mapping[str, Any]:
    auth = base64.b64encode(f"{email}:{token}".encode("utf-8")).decode("ascii")
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Basic {auth}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_jira_issues(base_url: str, email: str, token: str, jql: str = JQL) -> List[Mapping[str, Any]]:
    fields = [
        "summary",
        "status",
        "labels",
        "assignee",
        "duedate",
        "customfield_10015",
        "issuetype",
        "components",
        "priority",
    ]
    issues: List[Mapping[str, Any]] = []
    next_page_token = None
    endpoint = base_url.rstrip("/") + "/rest/api/3/search/jql"

    while True:
        payload: Dict[str, Any] = {"jql": jql, "maxResults": 100, "fields": fields}
        if next_page_token:
            payload["nextPageToken"] = next_page_token
        try:
            data = jira_request(endpoint, email, token, payload)
        except urllib.error.HTTPError as exc:
            if exc.code != 404:
                raise
            return fetch_jira_issues_legacy(base_url, email, token, jql, fields)

        issues.extend(data.get("issues", []))
        next_page_token = data.get("nextPageToken")
        if data.get("isLast", False) or not next_page_token:
            break
    return issues


def fetch_jira_issues_legacy(
    base_url: str,
    email: str,
    token: str,
    jql: str,
    fields: Iterable[str],
) -> List[Mapping[str, Any]]:
    issues: List[Mapping[str, Any]] = []
    start_at = 0
    endpoint = base_url.rstrip("/") + "/rest/api/3/search"
    while True:
        data = jira_request(
            endpoint,
            email,
            token,
            {"jql": jql, "startAt": start_at, "maxResults": 100, "fields": list(fields)},
        )
        batch = data.get("issues", [])
        issues.extend(batch)
        start_at += len(batch)
        if start_at >= data.get("total", 0) or not batch:
            break
    return issues


def normalize_issues(raw_issues: Iterable[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    normalized = []
    for issue in raw_issues:
        if "fields" in issue:
            normalized.append(normalize_issue(issue))
        else:
            normalized.append(dict(issue))
    return sorted(normalized, key=issue_sort_key)


def load_snapshot(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("issues"), list):
        return payload["issues"]
    return []


def save_snapshot(path: Path, issues: List[Dict[str, Any]], generated_at: str) -> None:
    if load_snapshot(path) == issues:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"generated_at": generated_at, "issues": issues}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def diff_snapshots(old: Iterable[Mapping[str, Any]], new: Iterable[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    old_map = {i["key"]: dict(i) for i in old if i.get("key")}
    new_map = {i["key"]: dict(i) for i in new if i.get("key")}
    changes: List[Dict[str, Any]] = []

    for key in sorted(old_map.keys() - new_map.keys(), key=lambda k: int(re.search(r"(\d+)$", k).group(1)) if re.search(r"(\d+)$", k) else 0, reverse=True):
        item = old_map[key]
        changes.append(
            {
                "type": "removed",
                "key": key,
                "title": item.get("title", ""),
                "field": "제거",
                "before": item.get("status", ""),
                "after": "제거",
                "owner": item.get("owner", ""),
                "status": item.get("status", ""),
            }
        )

    for key in sorted(new_map.keys() - old_map.keys(), key=lambda k: int(re.search(r"(\d+)$", k).group(1)) if re.search(r"(\d+)$", k) else 0, reverse=True):
        item = new_map[key]
        changes.append(
            {
                "type": "added",
                "key": key,
                "title": item.get("title", ""),
                "field": "신규",
                "before": "—",
                "after": "추가됨",
                "owner": item.get("owner", ""),
                "status": item.get("status", ""),
            }
        )

    for key in sorted(old_map.keys() & new_map.keys(), key=lambda k: int(re.search(r"(\d+)$", k).group(1)) if re.search(r"(\d+)$", k) else 0, reverse=True):
        before = old_map[key]
        after = new_map[key]
        for field, label in WATCH_FIELDS:
            if (before.get(field) or "") == (after.get(field) or ""):
                continue
            changes.append(
                {
                    "type": "changed",
                    "key": key,
                    "title": after.get("title", before.get("title", "")),
                    "field": label,
                    "before": before.get(field, ""),
                    "after": after.get(field, ""),
                    "owner": after.get("owner", ""),
                    "status": after.get("status", ""),
                }
            )
    return changes


def modal_issue(issue: Mapping[str, Any], target_date: date) -> Dict[str, Any]:
    start = parse_date(issue.get("start", ""))
    return {
        "key": issue.get("key", ""),
        "title": issue.get("title", ""),
        "status": issue.get("status", ""),
        "owner": issue.get("owner", ""),
        "due": issue.get("due", ""),
        "start": issue.get("start", ""),
        "elapsed": (target_date - start).days if start else None,
    }


def is_active(issue: Mapping[str, Any]) -> bool:
    return issue.get("status") not in DONE_STATUSES


def seq_for_issue(issue: Mapping[str, Any]) -> Optional[str]:
    labels = [x.strip().lower() for x in (issue.get("label", "") or "").split(",")]
    for key in SEQ:
        if key in labels:
            return key
    text = f"{issue.get('title', '')} {issue.get('label', '')} {issue.get('comp', '')}".lower()
    rules = {
        "s1": ["온보딩", "가입", "승인", "사업자", "회원", "로그인", "인증", "약관"],
        "s2": ["상품", "서비스", "채널", "유통채널", "엑셀", "판매", "전시", "카테고리", "공지사항"],
        "s3": ["주문", "결제", "발행", "발송", "sms", "알림톡", "구매"],
        "s4": ["사용", "사용취소", "바코드", "검증", "쿠폰"],
        "s5": ["환불", "취소", "반품"],
        "s6": ["정산", "과금", "포인트", "수수료"],
        "s7": ["모니터링", "보안", "인프라", "waf", "권한", "운영", "감사", "로그", "배포", "aws"],
        "s8": ["api", "카페24", "네이버", "외부연동", "옥션", "oauth"],
    }
    best = None
    best_score = 0
    for key, words in rules.items():
        score = sum(1 for word in words if word in text)
        if score > best_score:
            best = key
            best_score = score
    return best


def pf_for_issue(issue: Mapping[str, Any]) -> List[str]:
    label = (issue.get("label", "") or "").lower()
    return [key for key in PF_KEYS if key in label]


def build_member_store(issues: List[Mapping[str, Any]], target_date: date) -> Dict[str, Any]:
    d7_end = target_date + timedelta(days=7)
    store: Dict[str, Any] = {}
    for name in TEAM_MEMBERS:
        owned = [i for i in issues if is_active(i) and i.get("owner") == name]
        prog = [i for i in owned if i.get("status") in PROGRESS_STATUSES]
        deploy = [i for i in owned if i.get("status") in DEPLOY_STATUSES]
        blk = [i for i in owned if i.get("status") == "막힘"]
        overdue = [
            i
            for i in prog
            if parse_date(i.get("due", "")) and parse_date(i.get("due", "")) < target_date
        ]
        today_due = [
            i
            for i in owned
            if parse_date(i.get("due", "")) and parse_date(i.get("due", "")) == target_date
        ]
        d7 = [
            i
            for i in owned
            if parse_date(i.get("due", ""))
            and target_date < parse_date(i.get("due", "")) <= d7_end
        ]
        if blk:
            signal, signal_txt = "red", f"막힘 {len(blk)}건"
        elif today_due:
            signal, signal_txt = "orange", f"오늘기한 {len(today_due)}건"
        elif overdue:
            signal, signal_txt = "yellow", f"기한경과 {len(overdue)}건"
        elif deploy and not prog:
            signal, signal_txt = "green", f"배포대기 {len(deploy)}건"
        elif not prog:
            signal, signal_txt = "gray", "대기중"
        else:
            signal, signal_txt = "green", "정상 진행"
        store[name] = {
            "name": name,
            "signal": signal,
            "signal_txt": signal_txt,
            "prog": [modal_issue(i, target_date) for i in prog],
            "deploy": [modal_issue(i, target_date) for i in deploy],
            "overdue": [modal_issue(i, target_date) for i in overdue],
            "d7": [modal_issue(i, target_date) for i in d7],
            "blk": [modal_issue(i, target_date) for i in blk],
        }
    return store


def build_seq_store(issues: List[Mapping[str, Any]], target_date: date) -> Dict[str, Any]:
    d7_end = target_date + timedelta(days=7)
    store: Dict[str, Any] = {}
    for key, name in SEQ.items():
        rows = [i for i in issues if is_active(i) and seq_for_issue(i) == key]
        store[key] = {
            "seq": key,
            "name": name,
            "total": len(rows),
            "blk": [modal_issue(i, target_date) for i in rows if i.get("status") == "막힘"],
            "exp": [
                modal_issue(i, target_date)
                for i in rows
                if i.get("status") in PROGRESS_STATUSES
                and parse_date(i.get("due", ""))
                and parse_date(i.get("due", "")) < target_date
            ],
            "today": [
                modal_issue(i, target_date)
                for i in rows
                if parse_date(i.get("due", "")) and parse_date(i.get("due", "")) == target_date
            ],
            "d7": [
                modal_issue(i, target_date)
                for i in rows
                if parse_date(i.get("due", ""))
                and target_date < parse_date(i.get("due", "")) <= d7_end
            ],
            "prog": [modal_issue(i, target_date) for i in rows if i.get("status") in PROGRESS_STATUSES],
            "wait": [modal_issue(i, target_date) for i in rows if i.get("status") == "대기"],
            "hold": [modal_issue(i, target_date) for i in rows if i.get("status") == "보류"],
        }
    return store


def build_ws_owners(issues: List[Mapping[str, Any]], target_date: date) -> Dict[str, Any]:
    d7_end = target_date + timedelta(days=7)
    owners: Dict[str, Any] = {}
    for name in TEAM_MEMBERS:
        rows = [i for i in issues if is_active(i) and i.get("owner") == name]
        prog = [i for i in rows if i.get("status") in PROGRESS_STATUSES]
        deploy = [i for i in rows if i.get("status") in DEPLOY_STATUSES]
        expired = [
            i
            for i in prog
            if parse_date(i.get("due", "")) and parse_date(i.get("due", "")) < target_date
        ]
        imm = [
            i
            for i in rows
            if parse_date(i.get("due", ""))
            and target_date <= parse_date(i.get("due", "")) <= d7_end
        ]
        owners[name] = {
            "total": len(rows),
            "prog_n": len(prog),
            "deploy_n": len(deploy),
            "wait_n": len([i for i in rows if i.get("status") == "대기"]),
            "hold_n": len([i for i in rows if i.get("status") == "보류"]),
            "exp_n": len(expired),
            "imm_n": len(imm),
            "blk_n": len([i for i in rows if i.get("status") == "막힘"]),
            "prog": [summary_issue(i) for i in prog],
            "deploy": [summary_issue(i) for i in deploy],
            "expired": [{"key": i.get("key", ""), "title": i.get("title", ""), "due": i.get("due", "")} for i in expired],
        }
    return owners


def summary_issue(issue: Mapping[str, Any]) -> Dict[str, Any]:
    return {
        "key": issue.get("key", ""),
        "title": issue.get("title", ""),
        "status": issue.get("status", ""),
        "due": issue.get("due", ""),
        "owner": issue.get("owner", ""),
    }


def build_ws_heatmap(issues: List[Mapping[str, Any]]) -> Dict[str, Any]:
    heatmap: Dict[str, Any] = {}
    for seq_key in SEQ:
        heatmap[seq_key] = {}
        for pf_key in PF_KEYS:
            rows = [i for i in issues if is_active(i) and seq_for_issue(i) == seq_key and pf_key in pf_for_issue(i)]
            heatmap[seq_key][pf_key] = {
                "total": len(rows),
                "prog": len([i for i in rows if i.get("status") in PROGRESS_STATUSES or i.get("status") in DEPLOY_STATUSES]),
                "issues": [summary_issue(i) for i in rows[:8]],
            }
    return heatmap


def esc(value: Any) -> str:
    return html_lib.escape(str(value or ""), quote=True)


def issue_link(issue: Mapping[str, Any]) -> str:
    key = esc(issue.get("key", ""))
    title = esc(issue.get("title", ""))
    status = esc(issue.get("status", ""))
    owner = esc(issue.get("owner", ""))
    due = esc(issue.get("due", ""))
    due_html = f'<span style="font-size:10px;color:#64748B;white-space:nowrap">{due}</span>' if due else ""
    owner_html = f'<span style="font-size:10px;color:#7C3AED;white-space:nowrap">{owner}</span>' if owner else ""
    return (
        '<div style="display:flex;gap:8px;align-items:center;padding:7px 10px;'
        'border-bottom:1px solid #F1F5F9">'
        f'<a href="{JIRA_BROWSE_URL}{key}" target="_blank" style="font-family:\'JetBrains Mono\',monospace;'
        'font-size:10px;color:#1D4ED8;text-decoration:none;background:#EFF6FF;border:1px solid #BFDBFE;'
        f'padding:1px 6px;border-radius:4px;white-space:nowrap;flex-shrink:0">{key}</a>'
        f'<span style="font-size:11px;color:#374151;flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">{title}</span>'
        f'<span style="font-size:10px;color:#475569;white-space:nowrap">{status}</span>{owner_html}{due_html}'
        "</div>"
    )


def build_status_panel_html(issues: List[Mapping[str, Any]], changes: List[Dict[str, Any]], target_date: date) -> str:
    d7_end = target_date + timedelta(days=7)
    active = [i for i in issues if is_active(i)]
    progress = [i for i in active if i.get("status") in PROGRESS_STATUSES]
    deploy = [i for i in active if i.get("status") in DEPLOY_STATUSES]
    blocked = [i for i in active if i.get("status") == "막힘"]
    today_due = [
        i for i in active if parse_date(i.get("due", "")) and parse_date(i.get("due", "")) == target_date
    ]
    d7_due = [
        i
        for i in active
        if parse_date(i.get("due", "")) and target_date < parse_date(i.get("due", "")) <= d7_end
    ]
    overdue = [
        i
        for i in progress
        if parse_date(i.get("due", "")) and parse_date(i.get("due", "")) < target_date
    ]

    metrics = [
        ("총 이슈", len(issues), "#111827", "#F8FAFC", "#E2E8F0"),
        ("활성", len(active), "#1D4ED8", "#EFF6FF", "#BFDBFE"),
        ("진행중", len(progress), "#16A34A", "#F0FDF4", "#BBF7D0"),
        ("배포대기", len(deploy), "#0891B2", "#ECFEFF", "#A5F3FC"),
        ("막힘", len(blocked), "#DC2626", "#FEF2F2", "#FECACA"),
        ("오늘기한", len(today_due), "#D97706", "#FFFBEB", "#FDE68A"),
        ("D-7", len(d7_due), "#7C3AED", "#F5F3FF", "#DDD6FE"),
        ("기한경과", len(overdue), "#DC2626", "#FEF2F2", "#FECACA"),
    ]
    metric_html = "".join(
        (
            f'<div style="background:{bg};border:1px solid {border};border-radius:10px;padding:11px 12px">'
            f'<div style="font-size:10px;color:#64748B;font-weight:700;margin-bottom:4px">{label}</div>'
            f'<div style="font-size:22px;line-height:1;font-weight:800;color:{color}">{count}</div>'
            "</div>"
        )
        for label, count, color, bg, border in metrics
    )

    def section(title: str, rows: List[Mapping[str, Any]], color: str) -> str:
        body = "".join(issue_link(i) for i in rows[:6])
        if not body:
            body = '<div style="padding:12px;color:#94A3B8;font-size:11px">해당 이슈 없음</div>'
        more = ""
        if len(rows) > 6:
            more = f'<div style="padding:8px 10px;color:#64748B;font-size:10px;text-align:right">외 {len(rows) - 6}건</div>'
        return (
            '<div style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden">'
            '<div style="padding:10px 12px;background:#F8FAFC;border-bottom:1px solid #E2E8F0;'
            'display:flex;align-items:center;gap:8px">'
            f'<span style="width:7px;height:7px;border-radius:50%;background:{color};display:inline-block"></span>'
            f'<span style="font-size:12px;font-weight:800;color:#334155">{title}</span>'
            f'<span style="margin-left:auto;font-size:10px;color:#64748B">{len(rows)}건</span>'
            f"</div>{body}{more}</div>"
        )

    member_store = build_member_store(list(issues), target_date)
    member_cards = "".join(
        (
            f'<button onclick="openPlatMemberModal(\'{esc(name)}\')" style="appearance:none;border:1px solid #E2E8F0;'
            'background:#fff;border-radius:10px;padding:10px 11px;text-align:left;cursor:pointer;font-family:inherit">'
            f'<div style="display:flex;align-items:center;gap:7px;margin-bottom:5px"><span style="font-size:12px;font-weight:800;color:#111827">{esc(name)}</span>'
            f'<span style="margin-left:auto;font-size:10px;color:#64748B">{esc(data["signal_txt"])}</span></div>'
            f'<div style="font-size:10px;color:#64748B">진행 {len(data["prog"])} · 배포 {len(data["deploy"])} · 막힘 {len(data["blk"])}</div>'
            "</button>"
        )
        for name, data in member_store.items()
    )

    return f"""
<div style="background:linear-gradient(135deg,#0F766E,#166534);border-radius:12px;padding:15px 18px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
  <div style="flex:1">
    <div style="font-size:13px;font-weight:800;color:#ECFDF5">{week_label(target_date)} {korean_weekday(target_date)}요일 실행 상황판</div>
    <div style="font-size:11px;color:#A7F3D0;margin-top:3px">기준일 {target_date.isoformat()} · Jira PG 현재 스냅샷 · 직전 대비 {len(changes)}건 변경</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:22px;font-weight:900;color:#ECFDF5">{len(issues)}</div>
    <div style="font-size:9px;color:#A7F3D0">총 이슈</div>
  </div>
</div>
<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px">{metric_html}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
  {section("막힘", blocked, "#DC2626")}
  {section("오늘 기한", today_due, "#D97706")}
  {section("기한 경과", overdue, "#DC2626")}
  {section("D-7 예정", d7_due, "#7C3AED")}
</div>
<div style="background:#fff;border:1px solid #E2E8F0;border-radius:12px;padding:14px 16px;margin-bottom:16px">
  <div style="font-size:10px;font-weight:800;color:#64748B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">담당자 현황</div>
  <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">{member_cards}</div>
</div>
"""


def replace_status_panel(html: str, issues: List[Dict[str, Any]], changes: List[Dict[str, Any]], target_date: date) -> str:
    panel = build_status_panel_html(issues, changes, target_date)
    patterns = [
        r'(<div class="panel on" id="p-status">.*?</script>\s*).*?(\s*</div>\s*<div class="footer">)',
        r'(<div class="panel on" id="p-status">\s*).*?(\s*</div>\s*<div class="footer">)',
    ]
    for pattern in patterns:
        html, count = re.subn(
            pattern,
            lambda m: m.group(1) + panel + m.group(2),
            html,
            count=1,
            flags=re.S,
        )
        if count == 1:
            return html
    return html


def replace_js_const(html: str, name: str, value: Any) -> str:
    serialized = compact_json(value)
    pattern = rf"const\s+{re.escape(name)}\s*=\s*.*?;"
    replacement = f"const {name}={serialized};"
    html, count = re.subn(pattern, replacement, html, count=1, flags=re.S)
    if count != 1:
        raise ValueError(f"Could not replace JS const {name}")
    return html


def replace_js_scalar(html: str, name: str, value: str) -> str:
    pattern = rf"const\s+{re.escape(name)}\s*=\s*'[^']*';"
    replacement = f"const {name} = '{value}';"
    html, count = re.subn(pattern, replacement, html, count=1)
    if count != 1:
        raise ValueError(f"Could not replace JS scalar {name}")
    return html


def replace_history_metadata(html: str, target_date: date, changes: List[Dict[str, Any]]) -> str:
    if 'id="hist-filter"' not in html and "id='hist-filter'" not in html:
        return html

    history_title = f"직전 스냅샷 → {target_date.isoformat()}({korean_weekday(target_date)})"
    html, _ = re.subn(
        r"(변경 이력\s*—\s*)[^\n<]*(\s*<div[^>]*id=\"hist-filter\")",
        lambda m: m.group(1) + history_title + m.group(2),
        html,
        count=1,
    )

    counts = {
        "all": len(changes),
        "added": sum(1 for c in changes if c["type"] == "added"),
        "removed": sum(1 for c in changes if c["type"] == "removed"),
        "title": sum(1 for c in changes if c.get("field") == "요약"),
        "label": sum(1 for c in changes if c.get("field") == "레이블"),
        "comp": sum(1 for c in changes if c.get("field") == "컴포넌트"),
    }
    labels = {
        "all": "전체",
        "added": "신규",
        "removed": "제거",
        "title": "요약",
        "label": "레이블",
        "comp": "컴포넌트",
    }
    for filter_key, count in counts.items():
        label = labels[filter_key]
        html, replaced = re.subn(
            rf"(<button[^>]*onclick=\"filterHist\('{filter_key}'\)\"[^>]*>{label} \()\d+(\)</button>)",
            rf"\g<1>{count}\2",
            html,
            count=1,
        )
        if replaced != 1:
            raise ValueError(f"Could not replace history filter count: {filter_key}")
    return html


def render_html(template: str, target_date: date, issues: List[Dict[str, Any]], changes: List[Dict[str, Any]]) -> str:
    d7_end = target_date + timedelta(days=7)
    weekday = korean_weekday(target_date)
    week = week_label(target_date)
    issue_count = len(issues)

    html = template
    html = re.sub(
        r"<title>.*?</title>",
        f"<title>Platfos 프로젝트 현황 — {target_date.isoformat()}</title>",
        html,
        count=1,
        flags=re.S,
    )
    html = re.sub(
        r'기준일: \d{4}-\d{2}-\d{2} \([월화수목금토일]\)(?: \[최종\])? &nbsp;·&nbsp; \d+개 이슈 \(API·보류제외\) &nbsp;·&nbsp; [^<]+',
        f"기준일: {target_date.isoformat()} ({weekday}) &nbsp;·&nbsp; {issue_count}개 이슈 (API·보류제외) &nbsp;·&nbsp; 직전 대비 {len(changes)}건 변경",
        html,
        count=1,
    )
    html = re.sub(
        r"Platfos · Pongift 프로젝트 현황 &nbsp;·&nbsp; 기준일: "
        r"\d{4}-\d{2}-\d{2} \([월화수목금토일]\)(?: \[최종\])?"
        r" &nbsp;·&nbsp; \d+개 이슈 &nbsp;·&nbsp; [^<]+",
        f"Platfos · Pongift 프로젝트 현황 &nbsp;·&nbsp; 기준일: {target_date.isoformat()} ({weekday})"
        f" &nbsp;·&nbsp; {issue_count}개 이슈 &nbsp;·&nbsp; 직전 대비 {len(changes)}건 변경",
        html,
        count=1,
    )
    html = re.sub(
        r"const _JB='[^']*',_TD='[^']*',_D7='[^']*';",
        f"const _JB='{JIRA_BROWSE_URL}',_TD='{target_date.isoformat()}',_D7='{d7_end.isoformat()}';",
        html,
        count=1,
    )
    html = re.sub(
        r"const today = new Date\('[^']*'\);",
        f"const today = new Date('{target_date.isoformat()}');",
        html,
        count=1,
    )
    html = replace_js_const(html, "MEMBER_STORE", build_member_store(issues, target_date))
    html = replace_js_const(html, "SEQ_STORE", build_seq_store(issues, target_date))
    html = replace_js_const(html, "RAW_DATA", issues)
    html = replace_js_const(html, "CHANGES", changes)
    html = replace_js_const(html, "WS_OWNERS", build_ws_owners(issues, target_date))
    html = replace_js_const(html, "WS_HEATMAP", build_ws_heatmap(issues))
    html = replace_js_scalar(html, "WS_DATE", target_date.isoformat())
    html = replace_js_scalar(html, "WS_WEEK", week)
    ws_max = max(
        [cell["total"] for seq_data in build_ws_heatmap(issues).values() for cell in seq_data.values()] + [1]
    )
    html = re.sub(r"const WS_MAX\s*=\s*\d+;", f"const WS_MAX = {ws_max};", html, count=1)
    html = re.sub(
        r"r\.due <= '\d{4}-\d{2}-\d{2}'",
        f"r.due <= '{d7_end.isoformat()}'",
        html,
        count=1,
    )

    html = replace_history_metadata(html, target_date, changes)
    html = replace_status_panel(html, issues, changes, target_date)
    return html


def generate_dashboard(
    *,
    target_date: date,
    template_path: Path,
    output_dir: Path,
    cache_file: Path,
    raw_issues: Iterable[Mapping[str, Any]],
    write_cache: bool,
    mirror_output_dirs: Optional[Iterable[Path]] = None,
) -> Path:
    raw_snapshot = list(raw_issues)
    issues = normalize_issues(raw_snapshot)
    previous = load_snapshot(cache_file)
    changes = diff_snapshots(previous, issues)
    template = template_path.read_text(encoding="utf-8")
    html = render_html(template, target_date, issues, changes)

    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / output_filename(target_date)
    out_path.write_text(html, encoding="utf-8")
    for mirror_dir in mirror_output_dirs or []:
        mirror_dir.mkdir(parents=True, exist_ok=True)
        (mirror_dir / out_path.name).write_text(html, encoding="utf-8")
    if write_cache:
        save_snapshot(cache_file, issues, datetime.now().isoformat(timespec="seconds"))
    return out_path


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--date", default=os.environ.get("TARGET_DATE"), help="Target date, YYYY-MM-DD. Defaults to today.")
    parser.add_argument("--template", default="Source/대시보드/platfos_dashboard_260604_원본.html")
    parser.add_argument("--output-dir", default="public/data")
    parser.add_argument("--cache-file", default="public/data/.cache/platfos_dashboard_latest.json")
    parser.add_argument("--offline-json", help="Use local JSON instead of Jira API.")
    parser.add_argument(
        "--mirror-output-dir",
        action="append",
        default=[],
        help="Optional additional directory to receive the same generated HTML. Can be repeated.",
    )
    parser.add_argument("--write-cache", action="store_true", help="Persist normalized snapshot after generation.")
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)
    target_date = datetime.strptime(args.date, "%Y-%m-%d").date() if args.date else date.today()
    template_path = Path(args.template)
    output_dir = Path(args.output_dir)
    cache_file = Path(args.cache_file)

    if args.offline_json:
        raw_issues = load_offline_json(Path(args.offline_json))
    else:
        email = os.environ.get("JIRA_EMAIL")
        token = os.environ.get("JIRA_API_TOKEN")
        base_url = os.environ.get("JIRA_BASE_URL", JIRA_BASE_URL)
        if not email or not token:
            raise SystemExit("JIRA_EMAIL and JIRA_API_TOKEN are required unless --offline-json is provided.")
        raw_issues = fetch_jira_issues(base_url, email, token)

    out_path = generate_dashboard(
        target_date=target_date,
        template_path=template_path,
        output_dir=output_dir,
        cache_file=cache_file,
        raw_issues=raw_issues,
        write_cache=args.write_cache,
        mirror_output_dirs=[Path(p) for p in args.mirror_output_dir],
    )
    print(out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
