# start-task 다이어그램

Vulpora 문서용 중립 visual token을 사용하는 diagram-design 산출물입니다.

## Visual token receipt

| role | mapped token | source |
|---|---|---|
| paper | `#F6F7F8` | repository-local neutral palette |
| surface | `#FFFFFF` | repository-local neutral palette |
| ink | `#1A1A1E` | repository-local neutral palette |
| muted | `#575F6C` | repository-local neutral palette |
| soft | `#768091` | repository-local neutral palette |
| rule | `rgba(26,26,30,0.12)` | ink-derived hairline |
| accent | `#2563EB` | generic blue accent |
| accent tint | `rgba(37,99,235,0.08)` | accent-derived focal fill |
| link | `#0F766E` | generic teal link accent |

- Body family: Pretendard 400/500/600/700 when locally available.
- Diagram node family: `Pretendard → Apple SD Gothic Neo → Noto Sans KR → Malgun Gothic` fallback.
- Title and technical labels retain Diagram Design's Instrument Serif and Geist Mono roles.
- Pretendard is not embedded; exact rendering therefore depends on local availability and otherwise uses the listed fallbacks.

## Files

- [Lifecycle process](start-task-lifecycle.html): request부터 terminal report까지의 단일 scheduler 흐름
- [Model routing flowchart](start-task-model-routing.html): deterministic/profile 분기와 explicit spawn override
- [DAG scheduling](start-task-dag-scheduling.html): dependency convergence, runtime-derived WIP limit, dynamically queued work

각 파일은 static, self-contained HTML이며 inline SVG와 접근성 title/description을 포함합니다.
