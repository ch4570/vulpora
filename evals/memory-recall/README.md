# Eval: memory-recall

## 질문

- 현재 task에 필요한 **verified memory**를 실제로 찾아 `admit`하는가?
- admit할 때 source와 confidence를 함께 제시하는가?
- 무관한 memory를 같이 끌어오지 않는가?

## 통과 기준

- expected memory id가 `admit`된다.
- unrelated memory는 `admit`되지 않는다(`reject` 또는 미선택).
- admit된 memory에는 citation(source)이 붙는다.

## 지표

- `required_recall` = 1.0 (필요한 memory를 놓치지 않음)
- `admission_precision` = 1.0 (admit된 것이 모두 옳음)
- `evidence_citation_present` = true

## 케이스

| 케이스 | 증명 대상 |
| --- | --- |
| [cases/basic-preference.yaml](cases/basic-preference.yaml) | 명시적 user preference를 올바른 scope에서 회수하고 인용하는가 |
