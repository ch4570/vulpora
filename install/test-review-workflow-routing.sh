#!/usr/bin/env bash
set -eu

DIR="$(cd "$(dirname "$0")" && pwd -P)"
ROOT="$(cd "$DIR/.." && pwd -P)"

for workflow in \
  architecture-review-workflow \
  backend-code-review-workflow \
  java-spring-review-workflow \
  kotlin-spring-review-workflow \
  opensearch-review-workflow \
  postgres-review-workflow; do
  skill="$ROOT/skills/$workflow/SKILL.md"
  grep -Fq 'fork_turns: none' "$skill"
  grep -Fq 'model_selection: explicit-native-override' "$skill"
  grep -Fq 'reasoning_effort' "$skill"
  grep -Fq 'Never inherit the primary model' "$skill"
done

JAVA_WORKFLOW="$ROOT/skills/java-spring-review-workflow/SKILL.md"
grep -Fq 'Exactly three mandatory passes' "$JAVA_WORKFLOW"
grep -Fq '`java-reviewer`' "$JAVA_WORKFLOW"
grep -Fq '`oop-design-review`' "$JAVA_WORKFLOW"
grep -Fq '`design-pattern-apply`' "$JAVA_WORKFLOW"
grep -Fq 'maximum of three active native children' "$JAVA_WORKFLOW"
grep -Fq 'java-reviewer | `standard` | `medium`' "$JAVA_WORKFLOW"
grep -Fq 'oop-design-review | `frugal` | `low`' "$JAVA_WORKFLOW"
grep -Fq 'design-pattern-apply | `frugal` | `low`' "$JAVA_WORKFLOW"

JAVA_AGENT="$ROOT/agents/java-reviewer.md"
SPRING_BEANS_KB="$ROOT/agents/java-review/reference/kb/spring-beans-transactions.md"
SPRING_JPA_KB="$ROOT/agents/java-review/reference/kb/spring-data-jpa.md"
SPRING_WEB_KB="$ROOT/agents/java-review/reference/kb/spring-web-testing.md"
grep -Fq 'Java + Spring' "$JAVA_AGENT"
grep -Fq 'spring-beans-transactions.md' "$ROOT/agents/java-review/reference/kb/INDEX.md"
grep -Fq 'spring-data-jpa.md' "$ROOT/agents/java-review/reference/kb/INDEX.md"
grep -Fq 'spring-web-testing.md' "$ROOT/agents/java-review/reference/kb/INDEX.md"
grep -Fq 'transaction boundary' "$JAVA_AGENT"
grep -Fq 'test slice' "$JAVA_AGENT"
grep -Fq 'https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html' "$SPRING_BEANS_KB"
grep -Fq 'self-invocation' "$SPRING_BEANS_KB"
grep -Fq 'https://docs.spring.io/spring-data/jpa/reference/jpa/entity-persistence.html' "$SPRING_JPA_KB"
grep -Fq 'https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html' "$SPRING_WEB_KB"

ROUTING_DOC="$ROOT/docs/review-workflow-model-routing.md"
grep -Fq 'exactly three child' "$ROUTING_DOC" 2>/dev/null || grep -Fq '정확히 세 child' "$ROUTING_DOC"
grep -Fq '`fork_turns: none`' "$ROUTING_DOC"
grep -Fq '`inheritance_used: false`' "$ROUTING_DOC"
grep -Fq 'Rule volume is not a frontier signal' "$ROUTING_DOC"
grep -Fq 'Luna / Haiku' "$ROUTING_DOC"
grep -Fq 'Terra / Sonnet' "$ROUTING_DOC"
grep -Fq 'Sol / Opus' "$ROUTING_DOC"

BACKEND_WORKFLOW="$ROOT/skills/backend-code-review-workflow/SKILL.md"
grep -Fq 'applicability manifest' "$BACKEND_WORKFLOW"
grep -Fq 'shared evidence capsule' "$BACKEND_WORKFLOW"
grep -Fq 'lane-specific evidence capsule' "$BACKEND_WORKFLOW"
grep -Fq '`NOT_APPLICABLE`' "$BACKEND_WORKFLOW"
grep -Fq 'The workflow owner and reconciliation default to `standard/medium`' "$BACKEND_WORKFLOW"

printf '{"outcome":"pass","workflow":"java-spring-review-workflow","parallel_passes":3,"explicit_model_routing":true,"primary_inheritance":false,"java_spring_review_hardened":true}\n'
