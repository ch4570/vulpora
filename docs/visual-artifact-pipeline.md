# Visual artifact pipeline

Vulpora의 시각 산출물은 하나의 메가 스킬이 아니라 생성·렌더링·검증 책임을 분리한 설치 가능한
스킬 조합이다.

```text
visual-artifact-router
├── document-designer
├── markdown-publisher ──> pdf-qa
└── mermaid-diagrams ──> diagram-styler ──> pdf-qa (PDF 포함 시)
```

## 공통 계약

- Markdown과 Mermaid 원본이 source of truth다. HTML, PDF, SVG는 파생 산출물이다.
- 의미 생성과 시각 스타일링을 분리한다.
- 텍스트나 표가 더 명확하면 다이어그램을 만들지 않는다.
- 렌더 산출물은 `Generate -> Render -> Inspect -> Fix -> Re-render`를 통과해야 한다.
- PDF는 모든 페이지를 PNG로 렌더링하고 페이지별 시각 검사와 이미지 SHA-256을 기록해야 한다.
- 스크립트는 런타임 패키지 다운로드나 외부 렌더 API를 호출하지 않는다. 필요한 로컬 실행 파일이
  없으면 가짜 산출물을 만들지 않고 차단한다.

## 기본 도구와 실패 경계

| 경로 | 기본 도구 | 실패 처리 |
| --- | --- | --- |
| Markdown -> HTML | 내장 Node.js 변환기 + assets CSS | 지원하지 않는 이미지·깨진 입력·기존 출력은 fail closed |
| HTML -> PDF | 로컬 Chromium 계열 브라우저 | 완전한 PDF header/EOF가 없으면 실패 |
| PDF -> PNG | Poppler `pdftocairo` 또는 `pdftoppm` | 전 페이지 수가 맞지 않으면 실패 |
| Mermaid -> SVG | 설치된 `mmdc` | `npx` 다운로드나 네트워크 fallback 없이 blocked |

`excalidraw-diagrams`와 정밀 브랜드 SVG 렌더러는 현재 기본 설치에 포함하지 않는다. 라우터는 해당
표현 의도가 명시됐고 스킬이 실제 설치된 경우에만 선택한다.

## 설치

`visual-artifact-router`를 선택하면 manifest dependency closure가 문서 설계, Markdown 출판,
PDF QA, Mermaid 작성, 다이어그램 스타일링 스킬을 함께 설치한다. 각 스킬은 `SKILL.md`를 control
plane으로 유지하고 세부 규칙·테마·결정론적 작업은 `references/`, `assets/`, `scripts/`에 둔다.

## 검증

```bash
bash install/test-visual-artifact-contract.sh
```

이 계약은 여섯 스킬의 구조·행동 테스트, 실제 로컬 PDF 생성, Poppler 사전 점검, Mermaid 렌더러의
무다운로드 preflight와 런타임 네트워크·설치 명령 부재를 확인한다.
