#!/usr/bin/env python3
"""Generate the Platfos Jira dashboard HTML."""

from __future__ import annotations

import argparse
import base64
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
TEAM_MEMBERS = ["최다솔", "김명수", "김가영", "정광희", "박창용", "장석원", "이지헌", "이웅식", "김희진"]
PLAN_TEAM = ["최다솔", "김명수", "김가영"]
DEV_TEAM = ["정광희", "박창용", "장석원", "이지헌", "이웅식", "김희진"]
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


def normalize_owner(name: str) -> str:
    """담당자 표기 정규화: '김 가영'(공백)→'김가영', 퇴사자 '이강미'→후임 '김가영', '이전 사용자'→미배정."""
    if not name:
        return ""
    n = name.strip()
    compact = n.replace(" ", "")
    if compact == "김가영":
        return "김가영"
    if compact == "이강미":
        return "김가영"
    if n.lower() == "jason":   # 'jason' = 정광희 (동일인, Jira 표시이름 변경)
        return "정광희"
    if n == "이전 사용자":
        return ""
    return n


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
        "owner": normalize_owner(assignee.get("displayName", "")) if assignee else "",
        "due": fields.get("duedate") or "",
        "priority": priority.get("name", "") if priority else "",
        "start": fields.get("customfield_10015") or "",
        "parent": (fields.get("parent") or {}).get("key", ""),
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
        "parent",
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
    # 이전 스냅샷이 정규화 전(raw '이강미'/'김 가영')일 수 있으므로 양쪽 owner 재정규화
    for _m in (old_map, new_map):
        for _v in _m.values():
            if _v.get("owner"):
                _v["owner"] = normalize_owner(_v["owner"])
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


def parse_category(title: str, labels: Iterable[str]) -> "tuple":
    """라벨 우선, 없으면 제목 대괄호 토큰에서 (seq, pf) 추출. 예: '[Expand][S8] …' → ('s8','expand')."""
    labs = [l.strip().lower() for l in (labels or [])]
    seq = next((l for l in labs if l in SEQ), None)
    pf = next((l for l in labs if l in PF_KEYS), None)
    text = (title or "").lower()
    if not seq:
        m = re.search(r"\[(s[1-8])\]", text)
        if m:
            seq = m.group(1)
    if not pf:
        for name in PF_KEYS:
            if f"[{name}]" in text:
                pf = name
                break
    return seq, pf


def build_category_map(nodes: Mapping[str, Mapping[str, Any]]) -> Dict[str, "tuple"]:
    """nodes: {key: {title, labels, parent}} → {key: (seq, pf)}. 자기 자신에 없으면 부모 체인을 타고 보강."""
    own = {k: parse_category(v.get("title", ""), v.get("labels") or []) for k, v in nodes.items()}
    resolved: Dict[str, "tuple"] = {}
    for k in nodes:
        seq, pf = own.get(k, (None, None))
        cur = nodes[k].get("parent", "")
        guard = 0
        while (seq is None or pf is None) and cur and cur in nodes and guard < 8:
            ps, pp = own.get(cur, (None, None))
            seq = seq or ps
            pf = pf or pp
            cur = nodes[cur].get("parent", "")
            guard += 1
        resolved[k] = (seq, pf)
    return resolved


def apply_category_inheritance(items: Iterable[Dict[str, Any]], cat_map: Mapping[str, "tuple"]) -> int:
    """제목·부모체인에서 파생한 시퀀스/포트폴리오를 레이블이 없는 이슈의 label 필드에 주입 → 히트맵·시퀀스탭 반영."""
    if not cat_map:
        return 0
    count = 0
    for it in items:
        labels = [x.strip().lower() for x in (it.get("label", "") or "").split(",") if x.strip()]
        seq, pf = cat_map.get(it.get("key", ""), (None, None))
        add = []
        if seq and not any(l in SEQ for l in labels):
            add.append(seq)
        if pf and not any(l in PF_KEYS for l in labels):
            add.append(pf)
        if add:
            it["label"] = ",".join([it["label"]] + add) if it.get("label") else ",".join(add)
            count += 1
    return count


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
            "today": [modal_issue(i, target_date) for i in today_due],
            "d7": [modal_issue(i, target_date) for i in d7],
            "blk": [modal_issue(i, target_date) for i in blk],
        }
    return store


STATUS_CARD_HIDE = {"정광희"}  # 실행 상황판 카드에서 제외(합계·전역 집계엔 유지)
# 신호 → (배경, 테두리, 점) 색상 (원본 디자인 매핑)
SIG_STYLE = {
    "red": ("#FEF2F2", "#FECACA", "#DC2626"),
    "orange": ("#FFF7ED", "#FED7AA", "#EA580C"),
    "yellow": ("#FFFBEB", "#FDE68A", "#D97706"),
    "green": ("#F0FDF4", "#BBF7D0", "#16A34A"),
    "gray": ("#F9FAFB", "#E5E7EB", "#9CA3AF"),
}
_SEARCH_SVG = ('<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" '
               'stroke-width="2" stroke-linecap="round" style="margin-left:auto;flex-shrink:0">'
               '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>')


def build_status_cards_html(store: Dict[str, Any]) -> str:
    """실행 상황판 담당자 카드(원본 디자인 복원·동적). 카드 카운트=클릭 모달 섹션과 1:1 일치."""
    def metric(value: int, label: str, color_on: str) -> str:
        color = color_on if value > 0 else "#9CA3AF"
        return ('<div style="text-align:center;flex:1">'
                f'<div style="font-size:16px;font-weight:800;color:{color}">{value}</div>'
                f'<div style="font-size:9px;color:#9CA3AF">{label}</div></div>')

    def top_issue_row(d) -> str:
        items = d["overdue"] or d["today"] or d["prog"] or d["blk"] or d["deploy"]
        if not items:
            return ('<div style="font-size:11px;color:#9CA3AF;padding:6px 0">활성 진행 업무 없음</div>')
        r = items[0]
        title = (r.get("title") or "")
        title = title[:34] + "…" if len(title) > 34 else title
        due = f'<span style="font-size:10px;color:#9CA3AF;margin-left:auto;white-space:nowrap">{r["due"]}</span>' if r.get("due") else ""
        return ('<div style="display:flex;align-items:center;gap:6px;padding:7px 9px;background:rgba(255,255,255,.6);border-radius:7px;margin-top:2px">'
                f'<a href="{JIRA_BROWSE_URL}{r["key"]}" target="_blank" onclick="event.stopPropagation()" '
                'style="font-family:\'JetBrains Mono\',monospace;font-size:10px;color:#1D4ED8;text-decoration:none;background:#fff;border:1px solid #1D4ED840;padding:1px 5px;border-radius:4px;white-space:nowrap">'
                f'{r["key"]}</a>'
                f'<span style="font-size:11px;color:#374151;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">{title}</span>{due}</div>')

    def card(name: str) -> str:
        d = store.get(name)
        if not d:
            return ""
        bg, border, dot = SIG_STYLE.get(d["signal"], SIG_STYLE["gray"])
        metrics = (
            metric(len(d["prog"]), "진행중", "#1D4ED8")
            + metric(len(d["deploy"]), "배포대기", "#0891B2")
            + metric(len(d["overdue"]), "기한경과", "#C2410C")
            + metric(len(d["d7"]), "D-7", "#D97706")
            + metric(len(d["today"]), "오늘마감", "#DC2626")
        )
        return (
            f'<div onclick="openPlatMemberModal(\'{name}\')" '
            f'style="width:100%;box-sizing:border-box;background:{bg};border:1px solid {border};border-radius:12px;padding:13px 15px;cursor:pointer;transition:box-shadow .15s,transform .1s" '
            'onmouseover="this.style.boxShadow=\'0 4px 16px rgba(0,0,0,.12)\';this.style.transform=\'translateY(-1px)\'" '
            'onmouseout="this.style.boxShadow=\'\';this.style.transform=\'\'">'
            '<div style="display:flex;align-items:center;gap:9px;margin-bottom:10px">'
            f'<div style="width:10px;height:10px;border-radius:50%;background:{dot};box-shadow:0 0 0 3px {dot}33;flex-shrink:0"></div>'
            f'<span style="font-size:13px;font-weight:700;color:#111827">{name}</span>'
            f'<span style="font-size:10px;padding:2px 7px;border-radius:99px;background:rgba(255,255,255,.7);color:#374151;font-weight:500">{d["signal_txt"]}</span>'
            f'{_SEARCH_SVG}</div>'
            f'<div style="display:flex;gap:6px;margin-bottom:8px">{metrics}</div>'
            f'{top_issue_row(d)}'
            '<div style="font-size:10px;color:#9CA3AF;text-align:right;margin-top:8px">클릭하여 전체 보기 →</div></div>'
        )

    def group(label, members, color):
        cards = "".join(card(n) for n in members if n not in STATUS_CARD_HIDE)
        if not cards:
            return ""
        return (
            f'<div style="font-size:9px;font-weight:700;color:{color};text-transform:uppercase;letter-spacing:.5px;margin:4px 0 8px">{label}</div>'
            f'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">{cards}</div>'
        )

    return group("기획 · 디자인", PLAN_TEAM, "#7C3AED") + group("개발", DEV_TEAM, "#1D4ED8")


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


def replace_status_panel_metadata(
    html: str,
    issues: List[Dict[str, Any]],
    changes: List[Dict[str, Any]],
    target_date: date,
) -> str:
    d7_end = target_date + timedelta(days=7)
    active = [i for i in issues if is_active(i)]
    progress = [i for i in active if i.get("status") in PROGRESS_STATUSES]
    blocked = [i for i in active if i.get("status") == "막힘"]
    today_due = [
        i for i in active if parse_date(i.get("due", "")) and parse_date(i.get("due", "")) == target_date
    ]
    overdue = [
        i
        for i in progress
        if parse_date(i.get("due", "")) and parse_date(i.get("due", "")) < target_date
    ]
    status_title = f"{week_label(target_date)} {korean_weekday(target_date)}요일 실행 상황판"
    status_summary = (
        f"기준일 {target_date.isoformat()} · Jira PG 현재 스냅샷 · 직전 대비 {len(changes)}건 변경"
    )
    score_badge = f"{target_date.isoformat()} ({korean_weekday(target_date)}) · {week_label(target_date)} · {len(issues)}개"
    score_summary = (
        f"직전 대비 {len(changes)}건 변경 · 막힘 {len(blocked)}건 · "
        f"기한경과 {len(overdue)}건 · 오늘({target_date.month}/{target_date.day}) 기한 {len(today_due)}건"
    )

    html = re.sub(
        r"\d+월 \d+주차 [월화수목금토일]요일 \[최종\] — [^<]+",
        status_title,
        html,
        count=1,
    )
    html = re.sub(
        r"(<div[^>]*>)[^<]*내일\(\d+/\d+\) 기한 \d+건 집중 필요(</div>)",
        rf"\g<1>{status_summary}\2",
        html,
        count=1,
    )
    html = re.sub(
        r"(<div style=\"font-size:18px;font-weight:800;color:#D1FAE5\">)\d+(</div>)",
        rf"\g<1>{len(issues)}\2",
        html,
        count=1,
    )
    html = re.sub(
        r"\d{4}-\d{2}-\d{2} \([월화수목금토일]\)(?: \[최종\])? · \d+월 \d+주차 · \d+개",
        score_badge,
        html,
        count=1,
    )
    html = re.sub(
        r"\d+/\d+ 대비 \d+건 변경 · 블로커 \d+→\d+건 ✅ · 기한경과 \d+건 · 내일\(\d+/\d+\) 기한 \d+건 집중",
        score_summary,
        html,
        count=1,
    )
    html = re.sub(
        r"\d{4}년 \d+월 \d+주차 [월화수목금토일]요일(?: \[최종\])?",
        f"{target_date.year}년 {week_label(target_date)} {korean_weekday(target_date)}요일",
        html,
        count=1,
    )
    html = re.sub(
        r"내일\(\d+/\d+\)",
        f"오늘({target_date.month}/{target_date.day})",
        html,
    )

    # 실행 상황판 상태별 합계 카드(템플릿에 06-04 정적값 하드코딩 → 현재 데이터로 갱신)
    deploy = [i for i in active if i.get("status") in DEPLOY_STATUSES]
    unassigned = [i for i in active if not i.get("owner")]
    status_cards = [
        ("#1D4ED8", "진행 중", len(progress)),
        ("#0891B2", "배포 대기", len(deploy)),
        ("#16A34A", "막힘", len(blocked)),
        ("#D97706", "기한경과", len(overdue)),
        ("#6B7280", "미배정", len(unassigned)),
    ]
    for color, label, value in status_cards:
        html = re.sub(
            rf'(font-weight:800;color:{color}">)\d+(</div><div style="font-size:10px;color:#9CA3AF;margin-top:2px">{re.escape(label)}</div>)',
            rf"\g<1>{value}\2",
            html,
            count=1,
        )
    # '진행중+배포대기 N건' 소계
    html = re.sub(r"진행중\+배포대기 \d+건", f"진행중+배포대기 {len(progress) + len(deploy)}건", html)
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
    member_store = build_member_store(issues, target_date)
    html = replace_js_const(html, "MEMBER_STORE", member_store)
    # 실행 상황판 정적 카드 그리드(8개 하드코딩)를 MEMBER_STORE 기반 동적 카드로 교체 (정광희 포함, 카드↔모달 일치)
    cards_html = build_status_cards_html(member_store)
    html, n_cards = re.subn(
        r"(기한경과 = 진행중 상태만</span></div>).*?(<div style=\"display:grid;grid-template-columns:3fr 2fr;gap:16px;margin-bottom:20px\">)",
        lambda m: m.group(1) + cards_html + m.group(2),
        html,
        count=1,
        flags=re.S,
    )
    if n_cards != 1:
        raise ValueError("실행 상황판 카드 그리드 영역을 찾지 못함")
    html = replace_js_const(html, "SEQ_STORE", build_seq_store(issues, target_date))
    html = replace_js_const(html, "RAW_DATA", issues)
    html = replace_js_const(html, "CHANGES", changes)
    html = replace_js_const(html, "WS_OWNERS", build_ws_owners(issues, target_date))
    html = replace_js_const(html, "WS_HEATMAP", build_ws_heatmap(issues))
    # 프런트엔드 JS 팀 상수도 파이썬 명단과 동기화(템플릿엔 stale 이강미/구 dev팀이 \u이스케이프로 박혀 있어
    # renderWorkStatus KPI 합계·멤버카드에서 김가영·정광희·이웅식이 누락되던 버그 수정)
    html = replace_js_const(html, "PLAN_TEAM", PLAN_TEAM)
    html = replace_js_const(html, "DEV_TEAM", DEV_TEAM)
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
    html = replace_status_panel_metadata(html, issues, changes, target_date)
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
    cat_map: Optional[Mapping[str, "tuple"]] = None,
) -> Path:
    raw_snapshot = list(raw_issues)
    issues = normalize_issues(raw_snapshot)
    # 제목·부모체인에서 파생한 시퀀스/포트폴리오를 라벨 없는 이슈에 주입
    cat_map = cat_map or {}
    apply_category_inheritance(issues, cat_map)
    previous = load_snapshot(cache_file)
    # 이전 스냅샷에도 동일 cat_map 적용(키 기준) → 도입 시 유령 레이블-변경 방지
    apply_category_inheritance(previous, cat_map)
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

    online = not args.offline_json
    if args.offline_json:
        raw_issues = load_offline_json(Path(args.offline_json))
    else:
        email = os.environ.get("JIRA_EMAIL")
        token = os.environ.get("JIRA_API_TOKEN")
        base_url = os.environ.get("JIRA_BASE_URL", JIRA_BASE_URL)
        if not email or not token:
            raise SystemExit("JIRA_EMAIL and JIRA_API_TOKEN are required unless --offline-json is provided.")
        raw_issues = fetch_jira_issues(base_url, email, token)

    # 카테고리(시퀀스/포트폴리오) 노드 맵: 활성 이슈 + (온라인 시) 부모 체인을 따라 조상까지 수집
    def node_of(i):
        f = i.get("fields", {}) or {}
        return {"title": f.get("summary", ""), "labels": f.get("labels") or [],
                "parent": (f.get("parent") or {}).get("key", "")}
    nodes = {i["key"]: node_of(i) for i in raw_issues if i.get("key")}
    if online:
        for _ in range(6):  # 조상 레벨 bounded 수집
            need = sorted({v["parent"] for v in nodes.values() if v["parent"] and v["parent"] not in nodes})
            if not need:
                break
            for cs in range(0, len(need), 50):
                batch = need[cs:cs + 50]
                for e in fetch_jira_issues(base_url, email, token, "key in (" + ",".join(batch) + ")"):
                    if e.get("key"):
                        nodes[e["key"]] = node_of(e)
    cat_map = build_category_map(nodes)

    out_path = generate_dashboard(
        target_date=target_date,
        template_path=template_path,
        output_dir=output_dir,
        cache_file=cache_file,
        raw_issues=raw_issues,
        write_cache=args.write_cache,
        mirror_output_dirs=[Path(p) for p in args.mirror_output_dir],
        cat_map=cat_map,
    )
    resolved = sum(1 for v in cat_map.values() if v[0] or v[1])
    print(f"category map: {resolved}/{len(cat_map)} nodes resolved (seq/pf)", file=sys.stderr)
    print(out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
