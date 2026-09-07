---
title: Subagent 결과 검증과 integration conflict 처리
source: Vulpora docs/agent-mcp-design-rules.md section 5.1; STANDARD.md working agreements
last_fetched: 2026-08-25
consumers: [task-orchestrator]
---

# 결과 검증과 integration conflict

먼저 [result-aggregation](result-aggregation.md)의 completion matrix에 모든 attempt/result를 등록한다.
각 candidate result에 대해 실제 changed paths, diff, acceptance evidence, forbidden action을 확인한다.
write scope 밖 변경은 자동 채택하지 않는다. 기존 working tree 변경과 겹치면 그것을 사용자 소유로 간주한다.

충돌 처리 순서:

1. 영향 task와 downstream dispatch를 멈춘다.
2. base revision과 실제 diff를 다시 읽는다.
3. 두 결과가 만족하려는 acceptance criterion을 비교한다.
4. 한 결과를 최소 수정으로 통합할 수 있으면 leader가 shared file을 단독 소유해 적용·검증한다.
5. 사용자 변경 손실, 공개 계약 선택, 데이터 migration 선택처럼 결과가 갈리면 escalate한다.

`git reset --hard`, broad checkout, 무차별 파일 삭제로 충돌을 없애지 않는다.

## 리뷰 훅

- [ ] child 자기 보고가 아니라 실제 diff/evidence를 확인했는가?
- [ ] 상충하는 result와 AC evidence를 matrix에 모두 보존하고 누락하지 않았는가?
- [ ] scope 밖 변경과 기존 사용자 변경을 보존했는가?
- [ ] shared file의 최종 writer가 한 명인가?
- [ ] materially branching 해결을 사용자 결정 없이 선택하지 않았는가?
