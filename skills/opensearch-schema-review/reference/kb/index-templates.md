---
title: 인덱스 템플릿 (index/component template · 우선순위 · ism_template)
source: https://docs.opensearch.org/latest/im-plugin/index-templates/
last_fetched: 2026-06-24
skills: [opensearch-schema-review]
---

# KB: 인덱스 템플릿

> 새로 생성되는 인덱스에 매핑·설정·alias를 자동 적용. 시계열·롤오버 인덱스에 필수.

## 리뷰 훅
- [ ] 시계열/롤오버 인덱스가 템플릿 없이 매번 수동 매핑되는가 → 템플릿화.
- [ ] 여러 템플릿이 같은 패턴에 매칭될 때 **`priority`로 결정적**으로 정해지는가.
- [ ] 공통 매핑/설정을 **component template**로 재사용하는가(중복 정의 회피).
- [ ] 레거시 `_template`(deprecated) 대신 **composable `_index_template`** 을 쓰는가.
- [ ] 롤오버 인덱스에 `ism_template`/alias 사전 설정이 있는가.

## composable index template
- **`_index_template`**: `index_patterns`(매칭 패턴) + `template`(settings/mappings/aliases) +
  `priority` + `composed_of`(component template 목록).
- 레거시 `_template`은 deprecated → 신규는 composable 사용.

## component template
- **`_component_template`**: 재사용 가능한 매핑/설정 조각. 여러 index template이 `composed_of`로
  조합한다 → 공통 필드(타임스탬프·공통 keyword)·설정(replica·refresh)을 한 곳에서 관리.

## 우선순위 / 병합 규칙
- 한 인덱스 패턴에 **하나의 composable index template만** 적용된다(가장 높은 `priority`).
  레거시와 달리 여러 개가 동시 병합되지 않는다.
- 한 템플릿 내부에서는 `composed_of` 컴포넌트들이 **나열 순서대로 병합**되고, 인라인 `template`이
  최종 우선한다. 충돌 시 뒤(또는 인라인)가 이긴다.

## settings / mappings / aliases
- `settings`: `number_of_shards`/`number_of_replicas`/`refresh_interval`/`index.knn` 등.
- `mappings`: 필드 타입·dynamic 정책.
- `aliases`: 쓰기 alias(`is_write_index: true`) 등 — 롤오버의 전제.

## ism_template (자동 정책 연결)
- ISM 정책의 `ism_template`에 `index_patterns`를 두면 매칭되는 **새 인덱스에 정책이 자동 적용**된다
  (운영 상세는 optimization 스킬의 cluster-ops KB).

## 근거
- composable index template이 priority로 단일 선택되고 component template로 조합된다는 점,
  레거시 `_template`이 deprecated라는 점은 공식 index-templates 문서에 근거한다.
