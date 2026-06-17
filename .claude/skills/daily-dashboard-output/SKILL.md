---
name: daily-dashboard-output
description: >
  Platfos PG 일일 대시보드 "아웃풋"을 생성·배포한다. 사용자가 "아웃풋 만들어줘",
  "오늘자 아웃풋", "일일 대시보드 생성", "6월 N일자 만들어줘" 등을 입력하면 이 스킬을
  사용한다. 표준 생성 파이프라인(tools/dashboard/generate_dashboard.py)을 올바른 순서로
  실행하고, 그동안 확정된 모든 규칙(담당자 이름 정규화·팀 명단·정광희 카드 제외·시퀀스/
  포트폴리오 파생·상태 합계·동적 카드)이 변동되지 않게 보장한 뒤 git push로 배포한다.
---

# Platfos 일일 대시보드 아웃풋 생성

`platfos-dashboard.netlify.app` 으로 배포되는 일일 Jira(PG) 현황 대시보드를 생성한다.
**핵심 원칙: 아래 불변식이 절대 변하지 않게 한다.** 대부분은 이미 생성기 코드에 박혀 있으므로
"표준 파이프라인을 올바르게 실행 + 검증"하면 자동으로 보존된다. 손으로 HTML/숫자를 고치지 말 것.

## 경로·자격증명
- repo: `~/Library/Mobile Documents/com~apple~CloudDocs/1. Projects/platfos/1.분석/platfos-pongift-Dashboard/dashboard` (git root, GitHub `CM-jccho/platfos-dashboard`, branch main)
- 생성기: `tools/dashboard/generate_dashboard.py`
- 서빙 파일: `public/data/platfos_dashboard_YYMMDD.html` (커밋·push → Netlify 자동 배포)
- Jira 자격증명: `~/.config/atlassian.env` → 환경변수 매핑 필요:
  `JIRA_EMAIL=$ATLASSIAN_EMAIL`, `JIRA_API_TOKEN=$ATLASSIAN_API_TOKEN`, `JIRA_BASE_URL=$ATLASSIAN_SITE`

## 생성 절차 (반드시 이 순서)

1. **동기화**: repo로 이동, `git stash push -- .gitignore` (로컬 변경 보존), `git fetch origin`, `git merge --ff-only origin/main`.
   - 로컬 클론은 자동화 때문에 origin보다 뒤처져 있을 수 있다 → 항상 먼저 동기화.
2. **캐시 baseline 확인** (`public/data/.cache/platfos_dashboard_latest.json` = "직전 스냅샷", 변경이력 diff 기준):
   - 같은 날짜를 재생성하는데 이미 `--write-cache`로 캐시가 오늘로 전진했다면, 직전 영업일 커밋에서 복원:
     `git show <직전커밋>:public/data/.cache/platfos_dashboard_latest.json > public/data/.cache/platfos_dashboard_latest.json`
   - 새 날짜 첫 생성이면 그대로 둔다(캐시 = 직전 영업일).
3. **생성** (live fetch, 일 1회 `--write-cache`):
   ```bash
   set -a && source ~/.config/atlassian.env && set +a
   export JIRA_EMAIL="$ATLASSIAN_EMAIL" JIRA_API_TOKEN="$ATLASSIAN_API_TOKEN" JIRA_BASE_URL="${ATLASSIAN_SITE:-https://platfos.atlassian.net}"
   python3 tools/dashboard/generate_dashboard.py --date YYYY-MM-DD --write-cache
   ```
4. **검증** (아래 체크리스트 전부 통과해야 함).
5. **커밋·push** (자동화 충돌 대비 rebase 재시도):
   - `git add public/data/platfos_dashboard_YYMMDD.html public/data/.cache/platfos_dashboard_latest.json` (생성기 수정했으면 그 파일도)
   - 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
   - `git push origin main`. 거부되면 `git fetch` → `git rebase origin/main` → 충돌난 생성물(.html/.cache)은 **2번 캐시 복원 후 재생성**으로 해결하고 `git rebase --continue` → 재push.
6. `git stash pop` 으로 `.gitignore` 복원.

## 불변식(변동 금지) — 검증 체크리스트

생성 후 산출 파일에서 아래를 반드시 확인한다:

- **담당자 이름 정규화**: `이강미`=0, `김 가영`(공백)=0 → 모두 `김가영`. `jason`=0 → `정광희`.
  (퇴사자 이강미→후임 김가영, jason=정광희 동일인. `normalize_owner()`가 처리.)
- **팀 명단**: `PLAN_TEAM=[최다솔,김명수,김가영]`, `DEV_TEAM=[정광희,박창용,장석원,이지헌,이웅식,김희진]`.
  JS 상수(`const PLAN_TEAM`/`const DEV_TEAM`)도 동일해야 함(stale 시 진행중 합계 누락).
- **정광희**: 실행 상황판 **카드에서는 제외**(`STATUS_CARD_HIDE`), 단 전역 합계·KPI 집계엔 **포함**.
- **보류 상태 제외**: 생성기 JQL이 이미 `보류/완료/Done/후속작업` 제외.
- **시퀀스/포트폴리오**: 라벨 없으면 제목 대괄호(`[Expand][S8]`)+부모 체인에서 자동 파생(`build_category_map`). 커버리지 ≈ 시퀀스 45%+/포트폴리오 50%+.
- **실행 상황판 상태 합계 카드**(진행중/배포대기/막힘/기한경과/미배정)와 "진행중+배포대기 N건" = 현재 데이터(정적 아님).
- **담당자 카드** = MEMBER_STORE 기반 동적(원본 디자인: 신호색 배경·5메트릭·대표 이슈·"클릭하여 전체 보기"). **카드 숫자 = 클릭 모달 섹션과 1:1 일치**.
- **진행중 합계**: per-member 진행중 합 = 전역 진행중(미배정 제외분 일치).

### 검증 스니펫
```bash
O=public/data/platfos_dashboard_YYMMDD.html
python3 - "$O" <<'PY'
import sys,re,json
h=open(sys.argv[1],encoding='utf-8').read()
print('이강미',h.count('이강미'),'| 김 가영',h.count('김 가영'),'| jason',h.count('jason'))
cards=sorted(set(re.findall(r"openPlatMemberModal\('([^']+)'\)",h)))
print('실행상황판 카드',cards,'| 정광희 제외',('정광희' not in cards))
wo=json.loads(re.search(r'WS_OWNERS=(\{.*?\})\s*;\s*\n',h,re.S).group(1))
print('진행중 합계',sum(v.get('prog_n',0) for v in wo.values()))
print('헤더',re.search(r'기준일[^<]*',h).group(0)[:70])
PY
```
기대: 이강미·김 가영·jason 모두 0, 정광희 카드 제외 True, 진행중 합계가 라이브와 일치.

## 절대 하지 말 것
- 생성된 HTML의 숫자/카드를 손으로 수정 (다음 자동 생성이 덮어씀 + 불일치 유발).
- 키워드 추정 라벨을 Jira 이슈에 대량 write (오라벨 위험). 단, **부모 에픽 제목에 명시된** `[Portfolio][Seq]`를 라벨로 보정하는 것은 허용(신뢰도 높음).
- `--write-cache`를 하루에 두 번 이상(변경이력이 비어버림).

## 규칙 변경 시
새 퇴사자/이름변경 → `normalize_owner()`에 한 줄 추가. 팀원 추가/제외 → `TEAM_MEMBERS`/`PLAN_TEAM`/`DEV_TEAM` 또는 `STATUS_CARD_HIDE` 수정. 모두 `tools/dashboard/generate_dashboard.py` 한 파일에서 관리.
