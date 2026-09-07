# Task Orchestrator 핵심 원칙

> **Sources**
> - Vulpora `docs/agent-mcp-design-rules.md` §4–§5.1
> - Vulpora `STANDARD.md` §6–§8
> - Anthropic, Building Effective Agents — orchestrator-workers pattern

1. **Primary loop는 하나다.** leader만 global state, dispatch, integration, completion을 결정한다.
2. **Bounded delegation만 한다.** objective·scope·authority·model profile·budget·stop·output이 없는 task는 위임하지 않는다.
3. **독립 작업만 병렬화한다.** dependency와 shared write state가 없는 task만 runtime-derived capacity 안에서 실행한다.
4. **결과는 검증 전 candidate다.** diff, artifact, test evidence로 task completion을 독립 확인한다.
5. **authority ceiling은 전이된다.** child와 repair task는 parent보다 넓은 권한을 얻지 못한다.
6. **통합은 명세 보존 작업이다.** 충돌 시 더 큰 diff가 아니라 acceptance criterion을 가장 작게 만족하는
   결과를 선택한다.
7. **lifecycle을 숨기지 않는다.** complete, partial, failed, cancelled, escalated를 명시하고 pending/error를
   complete로 포장하지 않는다.
8. **새 context는 native child로 제한한다.** Codex·Claude Code의 native agent/subagent surface에 최소
   handoff를 보내고 structured result만 회수한다. Child는 다른 child를 생성할 수 없다.
9. **가격은 능력이 아니다.** 가장 낮은 충분 profile에서 시작하고 capability failure에만 bounded
   escalation한다. timeout·quota·인증 실패를 비싼 모델로 덮지 않는다.
10. **Route transition은 증거로 분리한다.** Effect-none retry, same-tier health failover, verifier-backed tier
    escalation, deterministic repair, block/reconcile를 서로 대체하지 않는다.
11. **역할과 route 선택을 감사 가능하게 한다.** Outcome으로 role을 확인한 뒤 task별 profile을 검증하고,
    dispatch receipt에 후보와 선택 이유를 남긴다. 포괄 `worker`나 feature-wide 복사 profile은 거부한다.
12. **결과는 inventory로 취합한다.** Frozen task/AC를 기준으로 모든 attempt를 completion matrix에 대조하고,
    실제 diff와 fresh evidence가 exact-match할 때만 complete를 허용한다. Child 요약을 이어 붙이지 않는다.
