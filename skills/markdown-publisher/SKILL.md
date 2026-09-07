---
name: markdown-publisher
description: Markdown 문서를 편집 가능한 원본과 함께 오프라인 단일 HTML로 발행하고, 요청 시 로컬 Chromium 계열 브라우저로 PDF를 생성한다. 기술 문서, PRD, 메모, 보고서에 executive/technical/minimal 테마를 적용하거나 Markdown을 인쇄 가능한 HTML/PDF로 변환할 때 사용한다. PDF 완료 판정과 페이지별 시각 검수는 pdf-qa로 라우팅한다.
---

# Markdown Publisher

Markdown 원본을 보존하고 외부 네트워크에 의존하지 않는 HTML/PDF 산출물을 만든다.

## 절차

1. 입력과 출력 경로를 확인한다. 기존 산출물은 사용자가 명시적으로 교체를 요청한 경우에만
   `--force`로 덮어쓴다.
2. 용도에 맞춰 테마를 고른다.
   - `executive`: 의사결정 문서와 경영 보고서
   - `technical`: 코드, 표, 기술 명세
   - `minimal`: 메모와 범용 문서
3. `node scripts/publish.mjs --input <source.md> --output-dir <artifact-dir> --theme <theme>`를
   실행한다. PDF가 필요하면 `--pdf`를 추가한다.
4. 생성된 `artifact-manifest.json`에서 원본·HTML·PDF 해시와 상태를 확인한다.
5. PDF를 요청했다면 반드시 `pdf-qa`로 PDF를 페이지 이미지로 렌더링하고 검수한다. QA가
   통과하기 전에는 PDF 작업을 완료로 보고하지 않는다.

세부 CLI, 실패 계약, 출력 구조는 [publishing contract](references/publishing-contract.md)를 읽는다.
지원하는 Markdown 문법과 안전 경계는 [Markdown subset](references/markdown-subset.md)을 읽는다.

## 완료 조건

- 원본 사본, 단일 HTML, manifest가 서로 연결되고 SHA-256으로 식별된다.
- HTML에 원격 스타일시트, 스크립트, 웹폰트 또는 네트워크 이미지가 없다.
- 한글/영문 시스템 폰트 fallback, 표, 코드 블록, callout, 인쇄 페이지 분리가 적용된다.
- PDF 요청 시 브라우저 preflight와 PDF header/EOF envelope 검증이 성공한다. 브라우저가 완성된
  파일을 쓴 뒤 남아 있으면 전용 프로세스 그룹만 제한 종료하고 그 사실을 manifest에 기록한다.
- PDF 요청 시 manifest가 `pdf-qa`를 다음 필수 단계로 기록하며, 실제 `pdf-qa` PASS가 별도로
  확인된다.

렌더링 실패, 브라우저 부재, 외부 이미지, 지원하지 않는 로컬 이미지 또는 깨진 입력을 성공으로
축소 보고하지 않는다.
