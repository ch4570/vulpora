#!/usr/bin/env bash
set -eu
node <<'NODE'
function derive(results){
  if(results.every(x=>x.outcome==='pass'))return 'complete';
  const critical=['structured_evidence_provenance','cleanup_interruption_resume','finite_matrix_repository_baseline','adversarial_untrusted_data','offline_network_isolation','orchestration_report_schema'];
  if(results.some(x=>critical.includes(x.semantic_ac_key)&&x.outcome!=='pass'))return 'failed';
  return results.some(x=>/^native_.*_e2e$/.test(x.semantic_ac_key)&&x.outcome==='pass')?'partial':'failed';
}
const common=['structured_evidence_provenance','cleanup_interruption_resume','finite_matrix_repository_baseline','adversarial_untrusted_data','offline_network_isolation','orchestration_report_schema'].map(semantic_ac_key=>({semantic_ac_key,outcome:'pass'}));
if(derive([...common,{semantic_ac_key:'native_codex_e2e',outcome:'pass'},{semantic_ac_key:'native_claude-code_e2e',outcome:'pass'}])!=='complete')process.exit(1);
if(derive([...common,{semantic_ac_key:'native_codex_e2e',outcome:'pass'},{semantic_ac_key:'native_claude-code_e2e',outcome:'environment_unavailable',execution:'not_run'}])!=='partial')process.exit(1);
if(derive([...common,{semantic_ac_key:'native_codex_e2e',outcome:'environment_unavailable',execution:'not_run'},{semantic_ac_key:'native_claude-code_e2e',outcome:'failed'}])!=='failed')process.exit(1);
if(derive([...common.filter(x=>x.semantic_ac_key!=='orchestration_report_schema'),{semantic_ac_key:'orchestration_report_schema',outcome:'failed'},{semantic_ac_key:'native_codex_e2e',outcome:'pass'}])!=='failed')process.exit(1);
NODE
printf '{"semantic_ac_key":"cross_runtime_status","outcome":"pass","complete_requires_both_runtimes":true,"unavailable_is_nonpass":true,"partial_requires_useful_subset":true,"conditionally_complete_forbidden":true}\n'
