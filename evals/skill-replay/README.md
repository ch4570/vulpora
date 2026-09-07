# Eval: skill-replay

## 질문

- skill의 precondition이 맞을 때만 skill을 실행하는가?
- skill 실행 결과를 verification으로 확인하는가?
- replay evidence 없이 skill이 승격되지 않는가?

## 통과 기준

- precondition mismatch면 skill을 실행하지 않는다.
- replay evidence가 없으면 promotion되지 않는다.
- skill 실행 후 verification(diff scope, 의도한 파일만 변경 등)이 수행된다.

## 지표

- `skill_replay_pass` = true (precondition match 시), 또는 미실행(mismatch 시)

## 케이스

| 케이스 | 증명 대상 |
| --- | --- |
| [cases/readme-reframe.yaml](cases/readme-reframe.yaml) | scaffold README 재작성 스킬이 precondition/verification 계약을 지키는가 |
