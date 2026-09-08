# Vulpora v{{version}} — {{release_title}}

날짜: {{YYYY-MM-DD}} · 이전 버전: v{{previous_version}}

{{사용자가 겪던 문제와 이번 릴리즈의 결과를 1–2문장으로 설명합니다.}}

## 수정 및 개선

- **{{기능/명령}}:** {{재현 조건 → 수정된 동작}}. {{관련 PR 링크}}
- **{{기능/명령}}:** {{사용자에게 영향을 주는 변경}}. {{관련 PR 링크}}

## 업데이트

GitHub 태그로 CLI를 설치한 뒤 기존 설치 scope와 selector로 스킬·에이전트를 갱신합니다.
아래 user-scope 예시는 전체 catalog를 설치합니다. project 또는 선택 설치는 기존 범위를 유지합니다.

```sh
npm install --global 'git+https://github.com/ch4570/vulpora.git#v{{version}}'
vulpora setup --runtime codex --scope user
vulpora doctor --runtime codex --scope user
```

{{Claude Code 등 지원 runtime의 업데이트 명령과 초기화 재실행 등 필요한 후속 조치를 기록합니다.}}

## 호환성과 검증 범위

- 호환성/마이그레이션: {{변경된 계약과 사용자가 해야 할 작업. 없으면 없다고 기록합니다.}}
- 검증: {{실제로 실행한 검사와 결과, 최종 커밋의 CI 링크}}.
- 미검증 범위: {{해당하는 운영 환경/실제 저장소/외부 통합의 한계}}.
- 비용·품질 수치를 포함할 때: {{측정 조건, 실측/환산/청구액 구분, 원본 근거 링크. 해당 없으면 이 항목을 삭제합니다.}}

## 배포 파일

- `vulpora-{{version}}.tgz`: npm 형식 설치 패키지.
- `vulpora-source-{{version}}.tar.gz`: 릴리즈 태그의 소스 압축본.
- `SHA256SUMS`: 첨부 파일의 SHA-256 체크섬.

```sh
shasum -a 256 -c SHA256SUMS
npm install --global ./vulpora-{{version}}.tgz
```

npm registry: {{실제 게시 여부와 채널. GitHub Release 게시와 구분합니다.}}

[전체 변경](https://github.com/ch4570/vulpora/compare/v{{previous_version}}...v{{version}})
