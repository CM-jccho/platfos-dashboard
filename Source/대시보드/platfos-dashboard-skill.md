---
name: platfos-dashboard
description: >
  Platfos·Pongift Jira 프로젝트(PG)의 일별 대시보드 HTML을 자동 생성합니다.
  "아웃풋", "대시보드", "현황 만들어줘", "오늘 기준 생성" 요청이 있으면 실행합니다.
---

# Platfos 일별 Jira 대시보드 스킬

## 현재 자동화 기준

- 대상 GitHub 저장소: `CM-jccho/platfos-dashboard`
- HTML 보관 경로: `public/data/`
- 로컬 mirror 경로: `Source/대시보드/` (선택)
- 파일명: `platfos_dashboard_YYMMDD.html`
- 기준 템플릿: `public/data/platfos_dashboard_260604.html`
- 생성기: `tools/dashboard/generate_dashboard.py`
- 자동 실행: GitHub Actions `Generate Platfos Dashboard`
- 정기 실행 시각: 매주 월-금 08:40 KST
- 수동 실행: GitHub Actions `workflow_dispatch`에서 `target_date` 입력 또는 공란 실행

## 필수 Secrets

GitHub 저장소 Settings → Secrets and variables → Actions에 아래 값을 등록한다.

```text
JIRA_EMAIL
JIRA_API_TOKEN
JIRA_BASE_URL    # 선택값, 기본 https://platfos.atlassian.net
```

## 핵심 설정값

```python
TODAY  = 'YYYY-MM-DD'
JIRA   = 'https://platfos.atlassian.net/browse/'
CLOUD  = '77401710-3553-4818-933c-644f2d4e0bc0'
JQL    = "project = PG AND status NOT IN (완료, Done, 후속작업, 보류) ORDER BY created DESC"
DONE   = ['완료', 'Done', 'done']
PROG   = ['진행 중']
DEPLOY = ['배포대기']

PLAN_TEAM = ['최다솔', '김명수', '이강미']
DEV_TEAM  = ['박창용', '이지헌', '김희진', '장석원']

SEQ = {
  's1':'온보딩','s2':'상품채널','s3':'주문발행','s4':'사용인증',
  's5':'환불취소','s6':'정산','s7':'운영통제','s8':'외부연동'
}
```

## Jira 수집 방식

1. 우선 `/rest/api/3/search/jql`을 사용한다.
2. `nextPageToken`으로 페이지를 끝까지 순회한다.
3. 404가 발생하면 `/rest/api/3/search`의 `startAt` 방식으로 fallback한다.
4. 과거처럼 배치4 이슈를 인라인 하드코딩하지 않는다.

## normalize() 출력 형식

```python
{
  'type': issue_type,
  'key': issue_key,
  'title': summary,
  'status': status_name,
  'comp': 'component1,component2',
  'label': 'label1,label2',
  'owner': assignee_display_name,
  'due': duedate_or_empty,
  'priority': priority_name,
  'start': customfield_10015_or_empty,
}
```

## 변경 감지

직전 스냅샷은 `public/data/.cache/platfos_dashboard_latest.json`에 저장한다.

```python
WATCH = [
  ('status','상태'),
  ('owner','담당자'),
  ('due','기한'),
  ('title','요약'),
  ('label','레이블'),
  ('comp','컴포넌트'),
]

new_map - old_map  -> added
old_map - new_map  -> removed
common + WATCH diff -> changed
```

변경 이력 탭의 제목과 필터 카운트는 `CHANGES` 기준으로 자동 치환한다.
기존 템플릿의 `6/2`, `요약 (1)`, `컴포넌트 (102)` 같은 수동 문구가 남으면 안 된다.

## 담당자 신호 로직

```text
막힘 보유          -> red    "막힘 N건"
오늘기한 보유      -> orange "오늘기한 N건"
기한경과(진행중)   -> yellow "기한경과 N건"
배포대기만 있음    -> green  "배포대기 N건"
진행중 없음        -> gray   "대기중"
그 외              -> green  "정상 진행"
```

기한경과 집계는 진행 중 상태만 대상으로 한다. 배포대기는 기한경과에서 제외한다.

## 실행 명령

대상 저장소 루트에서 수동 생성:

```bash
python tools/dashboard/generate_dashboard.py \
  --date 2026-06-04 \
  --template public/data/platfos_dashboard_260604.html \
  --output-dir public/data \
  --cache-file public/data/.cache/platfos_dashboard_latest.json \
  --write-cache
```

Git 저장소와 로컬 mirror를 동시에 생성:

```bash
python tools/dashboard/generate_dashboard.py \
  --date 2026-06-04 \
  --template public/data/platfos_dashboard_260604.html \
  --output-dir public/data \
  --mirror-output-dir Source/대시보드 \
  --cache-file public/data/.cache/platfos_dashboard_latest.json \
  --write-cache
```

Jira 없이 오프라인 검증:

```bash
python tools/dashboard/generate_dashboard.py \
  --date 2026-06-04 \
  --template public/data/platfos_dashboard_260604.html \
  --output-dir /tmp/platfos-dashboard-test \
  --cache-file /tmp/platfos-dashboard-test/.cache/latest.json \
  --offline-json tests/fixtures/dashboard_issues.json \
  --write-cache
```

## 검증 명령

```bash
python3 -m unittest tests/test_generate_dashboard.py -v
PYTHONPYCACHEPREFIX=/tmp/platfos-pycache python3 -m py_compile tools/dashboard/generate_dashboard.py
```

생성 HTML에서 과거 정적 문구가 남지 않아야 한다.

```bash
rg "블로커 3→1건|303개 이슈|6/2 대비|PG-3085|PG-3155" public/data/platfos_dashboard_YYMMDD.html
# 기대: 매칭 없음
```

## 출력 파일 규칙

```text
public/data/platfos_dashboard_YYMMDD.html
예: public/data/platfos_dashboard_260604.html
```

## 주요 결정 사항

| 항목 | 결정 내용 |
|---|---|
| 자동 실행 위치 | GitHub Actions |
| 실행 시각 | 08:40 KST, 월-금 |
| 수동 실행 | `workflow_dispatch` |
| 저장 경로 | `public/data` |
| 로컬 mirror | `--mirror-output-dir Source/대시보드` |
| 템플릿 | `public/data/platfos_dashboard_260604.html` |
| 기한경과 기준 | 진행 중만, 배포대기 제외 |
| 배치4 처리 | 폐기. Jira 페이지네이션으로 전량 수집 |
| 블로커 정의 | `status = 막힘` |
| D7 기준 | `TODAY <= due <= TODAY+7` |

## 재사용 시 교체 대상

```python
TODAY      = 'YYYY-MM-DD'
D7_END     = TODAY + 7 days
WEEK       = 'N월 N주차'
weekday    = '월|화|수|목|금|토|일'
RAW_DATA   = Jira normalized issues
CHANGES    = snapshot diff
```
