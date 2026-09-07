# Start Task 핵심 원칙

> **Sources**
> - Vulpora `STANDARD.md` §6–§8
> - Vulpora orchestration and authority contract
> - ISO/IEC/IEEE 29148:2018, Requirements engineering
> - Anthropic, Building Effective Agents — orchestrator-workers pattern

1. **명확화가 구현을 선행한다.** blocking unknown이 있으면 구현 도구를 호출하지 않는다.
2. **한 턴에는 결정 하나만 묻는다.** 가역적 선택에는 근거 있는 추천 기본값과 영향, 기본값 수락 또는
   직접 기준을 쓸 수 있는 답변 경로를 제공하고, 매 답변을 반영해 다음 결정을 고른다.
3. **한 번의 호출은 무제한 자율권이 아니다.** workflow는 후속 답변 동안 유지되지만 authority ceiling은
   사용자와 runtime이 정한다.
4. **artifact로 handoff한다.** 승인된 spec과 DAG를 run별 파일로 동결하고 SHA-256을 검증한 뒤, 대화
   전문 대신 경로·해시·최소 provenance를 전달한다.
5. **병렬화는 독립성 이후다.** dependency와 write/logical state가 분리된 실행 task만 현재 runtime slot과
   상위 policy가 허용하는 범위에서 native 백그라운드 세션으로 병렬화한다.
6. **primary loop는 하나다.** 요구, schedule, integration, completion의 최종 책임은 한 owner가 가진다.
7. **결과를 독립 검증한다.** agent의 완료 선언이 아니라 실제 diff, artifact, test evidence를 본다.
8. **대화 결정권과 실행 상한을 분리한다.** Clarification은 사용자 선택과 정보 가치로 이어가며 고정 질문
   상한을 두지 않는다. Retry·repair는 bounded budget을 지키고 소진 시 partial/failed/escalated 중
   사실에 맞는 상태를 낸다.
9. **모델 비용을 task에 맞춘다.** deterministic 검증은 model-free, 의미 작업은 가장 낮은 충분
   profile에서 시작하고 capability failure에만 제한적으로 올린다.
10. **새 child에는 최소 context만 보낸다.** Codex·Claude Code의 native agent/subagent surface로
   bounded handoff를 전달하고 structured result와 실제 evidence만 primary loop로 회수한다.
11. **Frozen 요구와 runtime 선택을 분리한다.** Shared spec/DAG에는 portable capability·risk·reasoning·budget·
   policy만 두고 concrete route ID는 trusted runtime의 dispatch/attempt receipt에만 둔다.
12. **실패 taxonomy를 보존한다.** Effect-none retry, health failover, verifier-backed capability escalation,
   deterministic repair, block/reconcile/stop을 서로 대신하지 않는다.
