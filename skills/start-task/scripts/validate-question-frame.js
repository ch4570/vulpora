#!/usr/bin/env node
'use strict';

const fs = require('node:fs');

function reject(code) {
  process.stderr.write(`${code}\n`);
  process.exit(1);
}

function focusTokens(value) {
  const stop = new Set(['가장', '관련', '대한', '아직', '충분히', '정해지지', '불확실', '정확도', '높이려면', '알려주시겠어요']);
  return value.split(/[^가-힣A-Za-z0-9_-]+/).filter(Boolean).map((token) =>
    token.replace(/(?:에서|으로|에게|부터|까지|해도|은|는|이|가|을|를|과|와|의|에|로|도|만)$/u, ''))
    .filter((token) => token.length >= 2 && !stop.has(token));
}

function hasPositiveProceedSentence(value) {
  const action = '(?:구현|실행|진행|시작|착수|만들|삭제|제거|폐기|초기화|변경|적용|전송|송신|게시|배포|업로드|공개|병합|머지|merge|푸시|push|공유|커밋|commit|승인|권한\\s*부여)';
  const patterns = [
    new RegExp(`${action}.{0,24}(?:해도|하여도|하셔도)\\s*(?:됩니다|괜찮습니다)`),
    new RegExp(`${action}.{0,24}할\\s*수\\s*있(?:습니다|어요)`),
    new RegExp(`${action}.{0,24}(?:하겠습니다|할게요|할 것입니다|해\\s*보겠습니다|어\\s*보겠습니다)`),
    new RegExp(`${action}.{0,24}(?:가능합니다|허용됩니다)`),
  ];
  return value.split(/\n|[.!。]\s*/).some((sentence) =>
    sentence.split(/(?:습니다만|지만|으나|그러나|다만|,)/).some((clause) => patterns.some((pattern) => {
      const match = clause.match(pattern);
      return match && !/(?:하지\s*않|않기로|중단|취소|보류|멈추|금지)/.test(match[0]);
    })));
}

function parseArguments(argv) {
  let mode = 'clarification';
  let expectedClarity = null;
  let riskCategory = null;
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!['--mode', '--expected-clarity', '--risk-category'].includes(option) || value === undefined || seen.has(option)) {
      reject('INVALID_ARGUMENTS');
    }
    seen.add(option);
    if (option === '--mode') mode = value;
    if (option === '--expected-clarity') expectedClarity = Number(value);
    if (option === '--risk-category') riskCategory = value;
  }
  if (!Number.isInteger(expectedClarity) || expectedClarity < 0 || expectedClarity > 100) {
    reject('EXPECTED_CLARITY_REQUIRED');
  }
  const categories = new Set(['goal', 'scope', 'acceptance', 'constraints', 'authority', 'destructive', 'credential', 'external_write', 'public_contract', 'material_data_model', 'verification', 'implementation_detail']);
  if (!categories.has(riskCategory)) reject('RISK_CATEGORY_REQUIRED');
  const nonBypassable = new Set(['goal', 'authority', 'destructive', 'credential', 'external_write', 'public_contract', 'material_data_model']);
  if ((mode === 'safety-blocked') !== nonBypassable.has(riskCategory)) reject('RISK_MODE_MISMATCH');
  return {mode, expectedClarity, riskCategory};
}

const {mode, expectedClarity, riskCategory} = parseArguments(process.argv.slice(2));
if (!['clarification', 'safety-blocked'].includes(mode)) reject('INVALID_MODE');

const text = fs.readFileSync(0, 'utf8').replace(/\r/g, '').trim();
const lines = text.split('\n');
if (text.length === 0 || lines.length > 7) {
  reject('INVALID_QUESTION_LINE_COUNT');
}
if (text.length > 800 || lines.some((line) => line.length === 0 || line.length > 240)) reject('QUESTION_TOO_LONG');
const question = text.match(/(?:^|[.!。]\s+|\n)([^.!。?？\n]+[?？])$/)?.[1] || '';
if (question.length === 0) reject('INVALID_QUESTION');
if ((text.match(/[?？]/g) || []).length !== 1) reject('MULTIPLE_QUESTION_MARKS');
const clarityMatches = [...text.matchAll(/명확도(?:는|가|:)?\s*(\d{1,3})\/100/g)];
const ambiguityMatches = [...text.matchAll(/모호성(?:은|이|:)?\s*(\d{1,3})\/100/g)];
if (clarityMatches.length !== 1 || ambiguityMatches.length !== 1) reject('SCORE_SUMMARY_REQUIRED');
const clarityMatch = clarityMatches[0];
const ambiguityMatch = ambiguityMatches[0];
const clarityScore = Number(clarityMatch[1]);
const ambiguityScore = Number(ambiguityMatch[1]);
if (clarityScore < 0 || clarityScore > 100 || ambiguityScore < 0 || ambiguityScore > 100
  || clarityScore + ambiguityScore !== 100) reject('SCORE_SUMMARY_INVALID');
if (clarityScore !== expectedClarity) reject('DISPLAYED_SCORE_DRIFT');
if (clarityScore >= 85) reject('QUESTION_AT_OR_ABOVE_THRESHOLD');
const narrative = text.slice(0, text.length - question.length);
const uncertaintyParts = narrative.split(/\n|[.!。]\s*/).filter((part) => /아직|덜|부족|정해지지|불확실/.test(part));
if (uncertaintyParts.length === 0 || uncertaintyParts.every((part) =>
  /(?:불확실(?:하다는 뜻은)?|부족(?:한 것은)?|미정(?:인 것은)?)\s*(?:아닙니다|하지 않습니다)/.test(part))) {
  reject('UNCERTAINTY_SUMMARY_REQUIRED');
}
if (mode === 'clarification') {
  const hasProceedLanguage = hasPositiveProceedSentence(narrative);
  if (!hasProceedLanguage || !/(?:가정|위험|불확실)/.test(narrative)
    || !/(?:구현|실행|진행|시작|착수|만들)/.test(narrative)) {
    reject('USER_PROCEED_CHOICE_REQUIRED');
  }
  if (!/(?:작업\s*)?(?:명세|요구사항).{0,24}(?:확정|고정)/.test(narrative)) {
    reject('USER_SPEC_CONFIRMATION_CHOICE_REQUIRED');
  }
  const recommendations = [...narrative.matchAll(/추천 기본값:[^.!。?？\n]+[.!。]?/g)].map((match) => match[0]);
  if (recommendations.length !== 1
    || !/(?:위해|때문|므로|해서|줄이|피하|보존|유지)/.test(recommendations[0])
    || /[?？]|(?:해주세요|하십시오|하세요)/.test(recommendations[0])) {
    reject('ACTIONABLE_DEFAULT_REQUIRED');
  }
  if (!/기본값/.test(question) || !/(?:원하|직접|다른)/.test(question)) {
    reject('CUSTOM_ANSWER_PATH_REQUIRED');
  }
} else {
  const safetyUnresolvedLine = {
    goal: '실행 가능한 목표와 성공 결과가 아직 정해지지 않았습니다.',
    authority: '필요한 권한 범위와 승인 주체가 아직 정해지지 않았습니다.',
    destructive: '파괴적 작업의 대상과 복구 범위가 아직 정해지지 않았습니다.',
    credential: '필요한 자격 증명과 사용 범위가 아직 정해지지 않았습니다.',
    external_write: '외부 변경의 대상과 영향 범위가 아직 정해지지 않았습니다.',
    public_contract: '공개 계약의 변경 범위와 호환성 기준이 아직 정해지지 않았습니다.',
    material_data_model: '데이터 모델 변경 범위와 마이그레이션 기준이 아직 정해지지 않았습니다.',
  }[riskCategory];
  const safetyBlockingLines = new Set([
    '이 결정이 확인되기 전에는 실행을 시작할 수 없습니다.',
    '이 결정이 확인될 때까지 실행을 시작하지 않겠습니다.',
  ]);
  if (lines.length !== 4 || question !== lines[3]
    || !/^현재 명확도는 \d{1,3}\/100이고 모호성은 \d{1,3}\/100입니다[.]$/.test(lines[0])
    || lines[1] !== safetyUnresolvedLine) {
    reject('SAFETY_FRAME_SHAPE_INVALID');
  }
  const blockingLine = lines[2];
  if (!safetyBlockingLines.has(blockingLine)) {
    reject('SAFETY_BLOCK_LINE_INVALID');
  }
  if (hasPositiveProceedSentence(narrative)) reject('SAFETY_PROCEED_CHOICE_FORBIDDEN');
  if (!/(?:확인|결정)/.test(narrative)
    || !/(?:전에는|전까지|될 때까지)/.test(narrative)
    || !/(?:구현|실행|진행|착수)/.test(narrative)
    || !/(?:수 없습니다|하지\s*않(?:기로)?\s*하겠습니다|시작하지 않겠습니다|착수하지 않겠습니다)/.test(narrative)) {
    reject('SAFETY_BLOCK_NOTICE_REQUIRED');
  }
}
if (/\b(?:needs_input|round|threshold|weakest|gate|skip|accepted risk|freeze|blocker|spec|DAG|ledger)\b/i.test(text)) {
  reject('WORKFLOW_JARGON_VISIBLE');
}
if (/^(?:\s*[-*]\s+|\s*\d+[.)]\s+|\s*[A-Da-d][.)]\s+|\s*\[[ xX]\]\s+)/m.test(text)) {
  reject('OBJECTIVE_CHOICE_MARKER');
}
if (/다음\s*중|복수\s*선택|하나를\s*선택|선택지/.test(text)) reject('OBJECTIVE_CHOICE_TEXT');
if (/(?:알려|정해|선택해|확인해|결정해)\s*(?:주세요|주십시오|주시기\s*바랍니다)|(?:하십시오|하세요)/.test(narrative)) {
  reject('ADDITIONAL_REQUEST');
}
if (/^이 디렉터리에서 설치할 시스템 범위를 어디까지로 잡을까요[?？]$/.test(question)) {
  reject('VAGUE_INSTALL_SCOPE');
}
const unresolvedText = narrative.split(/\n|[.!。]\s*/).filter((part) => /아직|덜|부족|정해지지|불확실/.test(part)).join(' ');
const unresolvedTokens = new Set(focusTokens(unresolvedText));
const focusOverlap = new Set(focusTokens(question).filter((token) => unresolvedTokens.has(token)));
if (focusOverlap.size < 2) reject('QUESTION_FOCUS_UNBOUND');
const interrogatives = question.match(/(?:무엇|어디|언제|누가|어떻게|왜|어느|얼마|몇)/g) || [];
if (interrogatives.length > 1
  || /[,，;；·/]|(?:^|\s)(?:그리고|및|각각)(?:\s|$)|(?:이며|이고|거나|면서)|[가-힣A-Za-z0-9)](?:과|와)\s+[가-힣A-Za-z0-9]/.test(question)) {
  reject('COMPOUND_DECISION_FOCUS');
}
process.stdout.write(JSON.stringify({
  outcome: 'pass',
  mode,
  ambiguity_score: ambiguityScore,
  clarity_score: clarityScore,
  risk_category: riskCategory,
  question_count: 1,
  frame_lines: lines.length,
  concise_question: true,
  actionable_default: mode === 'clarification',
  custom_answer_path: mode === 'clarification',
  user_can_proceed_with_uncertainty: mode === 'clarification',
  turn_ends_with_question: true,
}) + '\n');
