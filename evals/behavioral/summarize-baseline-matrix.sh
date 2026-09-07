#!/usr/bin/env bash
# Summarize a paired behavioral baseline matrix. Results are accepted only when
# every case/mode has one complete, identically-sized trial set. --strict-gate
# requires all candidate trials pass, meaningful outcome improvement, and no
# process or safety regression.

set -eu
DIR="$(cd "$(dirname "$0")" && pwd)"
RESULTS="${VULPORA_BEHAVIORAL_RESULTS_DIR:-$DIR/results}"
GROUP=""; REFERENCE="plain-runtime"; STRICT_GATE=0
MIN_OUTCOME_DELTA="${VULPORA_MIN_OUTCOME_DELTA:-0.010}"
for arg in "$@"; do
  case "$arg" in
    --results=*) RESULTS="${arg#--results=}" ;;
    --run-group=*) GROUP="${arg#--run-group=}" ;;
    --reference=*) REFERENCE="${arg#--reference=}" ;;
    --strict-gate) STRICT_GATE=1 ;;
    --min-outcome-delta=*) MIN_OUTCOME_DELTA="${arg#--min-outcome-delta=}" ;;
    -h|--help) sed -n '2,6p' "$0" | sed 's/^# //'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done
[ -n "$GROUP" ] || { echo "--run-group is required" >&2; exit 2; }
[ -d "$RESULTS" ] || { echo "results directory not found: $RESULTS" >&2; exit 2; }
awk -v v="$MIN_OUTCOME_DELTA" 'BEGIN { exit !(v ~ /^[0-9]+([.][0-9]+)?$/ && v+0 > 0 && v+0 <= 1) }' || { echo "--min-outcome-delta must be a number in (0, 1]" >&2; exit 2; }

work="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-matrix.XXXXXX")"
trap 'rm -rf "$work"' EXIT HUP INT TERM
field() { sed -n -E "s/^[[:space:]]*$1:[[:space:]]*//p" "$2" | head -1 | sed 's/[[:space:]]*$//'; }
actual() { sed -n -E "s/^actual:.*$1: ([^,}]+).*/\1/p" "$2" | head -1 | sed 's/[[:space:]]*$//'; }
expected() { sed -n -E "s/^expected:.*$1: ([^,}]+).*/\1/p" "$2" | head -1 | sed 's/[[:space:]]*$//'; }
is_number() { awk -v v="$1" 'BEGIN { exit !(v ~ /^[0-9]+([.][0-9]+)?$/) }'; }
is_score() { awk -v v="$1" 'BEGIN { exit !(v ~ /^[0-9]+([.][0-9]+)?$/ && v+0 >= 0 && v+0 <= 1) }'; }
is_positive_integer() { [[ "$1" =~ ^[0-9]+$ ]] && [ "$1" -gt 0 ] && [ "$1" -le 10000 ]; }
is_verdict() { case "$1" in pass|fail) return 0 ;; *) return 1 ;; esac; }
is_safe_token() { [[ "$1" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] && [[ "$1" != *..* ]]; }
is_baseline_mode() { case "$1" in plain-runtime|agent-only|agent-memory) return 0 ;; *) return 1 ;; esac; }
is_sha256_digest() { [[ "$1" =~ ^sha256:[0-9a-f]{64}$ ]]; }
is_artifact_hash() { [[ "$1" == "sha256:none" || "$1" =~ ^sha256:[0-9a-f]{64}$ ]]; }
is_source_revision() { [[ "$1" =~ ^[0-9a-f]{40}$|^gitless$ ]]; }
identity_placeholder() { # ASCII-only canonicalization; portable to Bash 3.2.
  case "$(printf '%s' "$1" | LC_ALL=C tr '[:upper:]' '[:lower:]')" in unknown|unspecified|null|none) return 0 ;; *) return 1 ;; esac
}
is_promotion_identity_token() { is_safe_token "$1" && ! identity_placeholder "$1"; }
is_promotion_adapter_id() {
  is_promotion_identity_token "$1" || return 1
  [ "$(printf '%s' "$1" | LC_ALL=C tr '[:upper:]' '[:lower:]')" != custom ]
}
validate_result_yaml() {
  if LC_ALL=C grep -Eq '^[[:space:]]*(measurements|estimated_tokens_measurement_kind|estimated_tokens_scope):' "$1"; then
    node "$DIR/adapters/validate-result-measurements.cjs" "$1" || return 1
  fi
  # The matrix is promotion evidence in strict mode, so do not let a loose
  # first-match extractor silently accept a second, forged metadata or score
  # field.  This is intentionally a small parser for the runner's stable YAML
  # subset, not a general YAML implementation.
  awk '
    function trim(v) { sub(/^[[:space:]]+/, "", v); sub(/[[:space:]]+$/, "", v); return v }
    function root_ok(k) { return k ~ /^(schema|eval_id|case_id|target|input|expected|actual|metrics|measurements|verdict|evidence|behavioral|run|git)$/ }
    function run_ok(k) { return k ~ /^(runner|adapter_id|model_id|config_id|case_digest|asset_definition_digest|source_revision|harness_definition_digest|run_label|run_group_id|trial_index|trial_count|timestamp|notes)$/ }
    function behavioral_ok(k) { return k ~ /^(runtime|baseline_mode|artifact_hash|required_artifact_evidence|fixture_before_digest|metrics_sidecar|process_score|safety_score|cost_score|four_axis_score|cost)$/ }
    function metrics_ok(k) { return k ~ /^(outcome_score|process_score|safety_score|cost_score|elapsed_seconds|tool_calls|files_read|files_written|adapter_files_written|observed_files_written|authorized_fixture_mutations|observed_changed_paths|command_count|estimated_tokens|estimated_tokens_measurement_kind|estimated_tokens_scope|forbidden_action_hits|guardrail_trips)$/ }
    function actual_count(line, k, copy) { copy=line; return gsub("(^|[,{[:space:]])" k "[[:space:]]*:", "&", copy) }
    function inline_value(line, k, piece) { piece=line; match(piece, "(^|[,{[:space:]])" k "[[:space:]]*:[[:space:]]*[^,}[:space:]]+"); piece=substr(piece, RSTART, RLENGTH); sub(/^.*:[[:space:]]*/, "", piece); return trim(piece) }
    function scalar_value(line, piece) { piece=line; sub(/^[^:]*:[[:space:]]*/, "", piece); return trim(piece) }
    # GNU awk may retain parsed YAML scalars as strings, so `v+0 == v` can
    # compare "0.900" lexically with "0.9". Validate the decimal token first,
    # then use numeric comparisons only for its range and cross-field equality.
    function score(v) { return v != "unmeasured" && v ~ /^[0-9]+([.][0-9]+)?$/ && v+0 >= 0 && v+0 <= 1 }
    function same_score(a,b) { return score(a) && score(b) && a+0 == b+0 }
    function same_axis(a,b) { return (a == "unmeasured" && b == "unmeasured") || same_score(a,b) }
    function bad_result() { bad=1 }
    # Every scalar below is later serialized into a tab-separated work row.
    # Reject all ASCII controls up front: accepting a tab in an otherwise
    # ignored field (for example artifact_hash) would shift identity columns.
    index($0, "\t") || index($0, "\r") || $0 ~ /[\001-\010\013\014\016-\037\177]/ { bad_result(); next }
    /^[^[:space:]#][A-Za-z_][A-Za-z0-9_]*:/ {
      key=$1; sub(/:.*/, "", key)
      if (!root_ok(key) || root[key]++) bad_result()
      section=key
      if (key == "schema") { value=$0; sub(/^[^:]*:[[:space:]]*/, "", value); if (trim(value) != "vulpora.eval-result") bad_result() }
      if (key == "actual") {
        if ($0 !~ /^actual:[[:space:]]*\{.*\}[[:space:]]*$/) bad_result()
        if (actual_count($0, "outcome_score") != 1 || actual_count($0, "process_score") != 1 || actual_count($0, "safety_score") != 1 || actual_count($0, "cost_score") != 1) bad_result()
        actual_outcome=inline_value($0, "outcome_score"); actual_process=inline_value($0, "process_score"); actual_safety=inline_value($0, "safety_score"); actual_cost=inline_value($0, "cost_score")
      }
      if (key == "target") {
        if ($0 !~ /^target:[[:space:]]*\{.*\}[[:space:]]*$/ || actual_count($0, "kind") != 1 || actual_count($0, "id") != 1) bad_result()
      }
      if (key == "expected") {
        if ($0 !~ /^expected:[[:space:]]*\{.*\}[[:space:]]*$/) bad_result()
        if (actual_count($0, "outcome_threshold") != 1 || actual_count($0, "process_threshold") != 1 || actual_count($0, "safety_threshold") != 1 || actual_count($0, "cost_threshold") != 1) bad_result()
      }
      next
    }
    /^  [A-Za-z_][A-Za-z0-9_]*:/ {
      key=$1; sub(/:.*/, "", key)
      if (section == "run") { if (!run_ok(key) || nested[section SUBSEP key]++) bad_result() }
      else if (section == "behavioral") {
        if (!behavioral_ok(key) || nested[section SUBSEP key]++) bad_result()
        value=scalar_value($0)
        if (key == "process_score") behavioral_process=value
        else if (key == "safety_score") behavioral_safety=value
        else if (key == "cost_score") behavioral_cost=value
      }
      else if (section == "metrics") {
        if (!metrics_ok(key) || nested[section SUBSEP key]++) bad_result()
        value=scalar_value($0)
        if (key == "outcome_score") metrics_outcome=value
        else if (key == "process_score") metrics_process=value
        else if (key == "safety_score") metrics_safety=value
        else if (key == "cost_score") metrics_cost=value
      }
      else bad_result()
      next
    }
    # field() deliberately accepts indentation for legacy runner output.
    # Therefore a mapping at any other indentation could otherwise shadow a
    # later legitimate run/metrics field while escaping the two-space parser.
    # Lists are handled separately by their parent sections; all other
    # structural mappings are outside this result subset and fail closed.
    /^[[:space:]]+[A-Za-z_][A-Za-z0-9_]*:/ { bad_result(); next }
    # Catch malformed scalar-key syntax too (for example `1: forged`), while
    # preserving the runner output allowed indented evidence-list entries (- ...).
    /^[^[:space:]#][^:]*:/ { bad_result(); next }
    /^[[:space:]]+[^[:space:]#-][^:]*:/ { bad_result(); next }
    END {
      for (k in needed_root) if (root[needed_root[k]] != 1) bad_result()
      for (k in needed_run) if (nested["run" SUBSEP needed_run[k]] != 1) bad_result()
      for (k in needed_behavioral) if (nested["behavioral" SUBSEP needed_behavioral[k]] != 1) bad_result()
      for (k in needed_metrics) if (nested["metrics" SUBSEP needed_metrics[k]] != 1) bad_result()
      if (!same_score(actual_outcome, metrics_outcome) || !same_axis(actual_process, metrics_process) || !same_axis(actual_safety, metrics_safety) || !same_axis(actual_cost, metrics_cost)) bad_result()
      if (!same_axis(actual_process, behavioral_process) || !same_axis(actual_safety, behavioral_safety) || !same_axis(actual_cost, behavioral_cost)) bad_result()
      exit bad ? 1 : 0
    }
    BEGIN {
      split("schema case_id target expected actual metrics verdict behavioral run", needed_root, " ")
      split("adapter_id model_id config_id case_digest asset_definition_digest source_revision harness_definition_digest run_group_id trial_index trial_count", needed_run, " ")
      split("runtime baseline_mode fixture_before_digest process_score safety_score cost_score", needed_behavioral, " ")
      split("outcome_score process_score safety_score cost_score", needed_metrics, " ")
    }
  ' "$1"
}
unquote_inline_scalar() {
  # The runner quotes YAML inline target scalars. Target identity values are
  # tokens, so accepting only an unescaped quoted scalar avoids eval-like YAML
  # decoding while retaining legacy unquoted result compatibility.
  local value
  value="$(printf '%s' "$1" | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  case "$value" in
    \"*\")
      value="${value#\"}"; value="${value%\"}"
      [[ "$value" != *\\* ]] || return 1
      ;;
    *\"*) return 1 ;;
  esac
  printf '%s' "$value"
}

# Result selectors become row keys and Markdown values, so constrain them at
# ingestion rather than relying on a later strict-only identity comparison.
is_safe_token "$GROUP" || { echo "--run-group must be a safe token" >&2; exit 2; }
is_baseline_mode "$REFERENCE" || { echo "--reference must be a supported baseline mode" >&2; exit 2; }

# columns: case, mode, trial index/count, verdict, outcome/process/safety/cost,
# target kind/id/runtime plus reproducibility identity. artifact_hash is an output hash,
# not a like-for-like input identity, so it is displayed but never compared.
for f in "$RESULTS"/*.yaml; do
  [ -f "$f" ] || continue
  validate_result_yaml "$f" || { echo "invalid or ambiguous runner result YAML: $f" >&2; exit 1; }
  [ "$(field run_group_id "$f")" = "$GROUP" ] || continue
  case_id="$(field case_id "$f")"; mode="$(field baseline_mode "$f")"
  trial_index="$(field trial_index "$f")"; trial_count="$(field trial_count "$f")"; verdict="$(field verdict "$f")"
  outcome="$(actual outcome_score "$f")"; process="$(actual process_score "$f")"; safety="$(actual safety_score "$f")"; cost="$(actual cost_score "$f")"
  target_kind_raw="$(sed -n -E 's/^target:[[:space:]]*\{[[:space:]]*kind:[[:space:]]*([^,}]+),[[:space:]]*id:[[:space:]]*([^}]+)\}[[:space:]]*$/\1/p' "$f" | head -1)"
  asset_raw="$(sed -n -E 's/^target:[[:space:]]*\{[[:space:]]*kind:[[:space:]]*([^,}]+),[[:space:]]*id:[[:space:]]*([^}]+)\}[[:space:]]*$/\2/p' "$f" | head -1)"
  if ! target_kind="$(unquote_inline_scalar "$target_kind_raw")" || ! asset="$(unquote_inline_scalar "$asset_raw")"; then
    echo "invalid quoted target identity in $f" >&2; exit 1
  fi
  runtime="$(field runtime "$f")"; artifact_hash="$(field artifact_hash "$f")"
  fixture_digest="$(field fixture_before_digest "$f")"; adapter_id="$(field adapter_id "$f")"; model_id="$(field model_id "$f")"; config_id="$(field config_id "$f")"; case_digest="$(field case_digest "$f")"; asset_digest="$(field asset_definition_digest "$f")"; source_revision="$(field source_revision "$f")"; harness_digest="$(field harness_definition_digest "$f")"
  outcome_threshold="$(expected outcome_threshold "$f")"; process_threshold="$(expected process_threshold "$f")"; safety_threshold="$(expected safety_threshold "$f")"; cost_threshold="$(expected cost_threshold "$f")"
  [ -n "$case_id" ] && [ -n "$mode" ] && [ -n "$trial_index" ] && [ -n "$trial_count" ] && [ -n "$verdict" ] || { echo "invalid result metadata: $f" >&2; exit 1; }
  is_safe_token "$case_id" || { echo "unsafe case_id in $f: $case_id" >&2; exit 1; }
  is_baseline_mode "$mode" || { echo "unsupported baseline_mode in $f: $mode" >&2; exit 1; }
  for identity_token in "$target_kind" "$asset" "$runtime" "$adapter_id" "$model_id" "$config_id"; do
    [ -z "$identity_token" ] || is_safe_token "$identity_token" || { echo "unsafe identity token in $f: $identity_token" >&2; exit 1; }
  done
  is_source_revision "$source_revision" || { echo "invalid source_revision in $f: $source_revision" >&2; exit 1; }
  is_artifact_hash "$artifact_hash" || { echo "invalid artifact_hash in $f: $artifact_hash" >&2; exit 1; }
  is_sha256_digest "$harness_digest" || { echo "invalid harness_definition_digest in $f: $harness_digest" >&2; exit 1; }
  is_positive_integer "$trial_index" && is_positive_integer "$trial_count" && [ "$trial_index" -le "$trial_count" ] || { echo "invalid positive-integer trial metadata in $f: index=$trial_index count=$trial_count" >&2; exit 1; }
  is_verdict "$verdict" || { echo "invalid verdict in $f: $verdict (expected pass|fail)" >&2; exit 1; }
  is_score "$outcome" || { echo "invalid outcome_score in $f: $outcome (expected [0,1])" >&2; exit 1; }
  for score in "$process" "$safety" "$cost"; do [ "$score" = unmeasured ] || is_score "$score" || { echo "invalid score in $f: $score (expected [0,1] or unmeasured)" >&2; exit 1; }; done
  for threshold in "$outcome_threshold" "$process_threshold" "$safety_threshold" "$cost_threshold"; do [ -z "$threshold" ] || [ "$threshold" = unconfigured ] || is_score "$threshold" || { echo "invalid expected threshold in $f: $threshold" >&2; exit 1; }; done
  # When runner output includes thresholds, a pass may not contradict them.
  for metric in outcome process safety cost; do
    eval "score=\${$metric}"; eval "threshold=\${${metric}_threshold}"
    [ "$verdict" = pass ] && [ -n "$threshold" ] && [ "$threshold" != unconfigured ] && [ "$score" != unmeasured ] && ! awk -v s="$score" -v t="$threshold" 'BEGIN {exit !(s+0 >= t+0)}' && {
      echo "verdict/metric contradiction in $f: pass but $metric=$score < threshold=$threshold" >&2; exit 1;
    }
  done
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$case_id" "$mode" "$trial_index" "$trial_count" "$verdict" "$outcome" "$process" "$safety" "$cost" "$target_kind" "$asset" "$runtime" "$artifact_hash" "$fixture_digest" "$adapter_id" "$model_id" "$config_id" "$case_digest" "$asset_digest" "$source_revision" "$harness_digest" >> "$work/rows"
done
[ -s "$work/rows" ] || { echo "no result rows for run_group_id=$GROUP" >&2; exit 1; }
# This is redundant with the control-character parser guard, by design.  It
# makes future additions of unvalidated display-only scalars fail closed rather
# than silently shifting comparison identity columns.
awk -F '\t' 'NF != 21 { exit 1 }' "$work/rows" || { echo "malformed internal baseline result row" >&2; exit 1; }

duplicates="$(awk -F '\t' '{ key=$1 SUBSEP $2 SUBSEP $3; n[key]++ } END { for (k in n) if (n[k]>1) print k }' "$work/rows")"
[ -z "$duplicates" ] || { echo "duplicate trial identity (case, mode, trial_index)" >&2; printf '%s\n' "$duplicates" >&2; exit 1; }

# Verify both complete 1..N sets and one declared count per case/mode.
while IFS=$'\t' read -r case_id mode; do
  declared="$(awk -F '\t' -v c="$case_id" -v m="$mode" '$1==c && $2==m {print $4}' "$work/rows" | LC_ALL=C sort -u)"
  [ "$(printf '%s\n' "$declared" | sed '/^$/d' | wc -l | tr -d ' ')" = 1 ] || { echo "mismatched trial counts for case=$case_id mode=$mode" >&2; exit 1; }
  observed="$(awk -F '\t' -v c="$case_id" -v m="$mode" '$1==c && $2==m {print $3}' "$work/rows" | LC_ALL=C sort -n | tr '\n' ' ')"
  expected="$(awk -v n="$declared" 'BEGIN {for(i=1;i<=n;i++) printf "%d ",i}')"
  [ "$observed" = "$expected" ] || { echo "incomplete trials for case=$case_id mode=$mode: expected [$expected], got [$observed]" >&2; exit 1; }
done < <(awk -F '\t' '{print $1 "\t" $2}' "$work/rows" | LC_ALL=C sort -u)

# A strict gate is promotion evidence, not a report over whichever modes happen
# to be present. Require a candidate and require every case to supply exactly
# the run group's mode set, so a reference-only (or partially missing) case
# cannot pass vacuously.
if [ "$STRICT_GATE" = 1 ]; then
  global_modes="$(awk -F '\t' '{print $2}' "$work/rows" | LC_ALL=C sort -u)"
  candidate_modes="$(printf '%s\n' "$global_modes" | awk -v r="$REFERENCE" '$0 != r')"
  [ -n "$candidate_modes" ] || { echo "strict baseline gate requires at least one candidate mode" >&2; exit 1; }
  while IFS= read -r case_id; do
    case_modes="$(awk -F '\t' -v c="$case_id" '$1==c {print $2}' "$work/rows" | LC_ALL=C sort -u)"
    [ "$case_modes" = "$global_modes" ] || {
      echo "strict baseline gate requires complete mode set for case=$case_id" >&2; exit 1;
    }
  done < <(awk -F '\t' '{print $1}' "$work/rows" | LC_ALL=C sort -u)
fi

# Comparison is paired, not merely a comparison of unrelated averages.
while IFS= read -r case_id; do
  ref_count="$(awk -F '\t' -v c="$case_id" -v r="$REFERENCE" '$1==c && $2==r {print $4}' "$work/rows" | LC_ALL=C sort -u)"
  [ -n "$ref_count" ] || { echo "missing reference mode=$REFERENCE for case=$case_id" >&2; exit 1; }
  while IFS= read -r mode; do
    [ "$mode" = "$REFERENCE" ] && continue
    candidate_count="$(awk -F '\t' -v c="$case_id" -v m="$mode" '$1==c && $2==m {print $4}' "$work/rows" | LC_ALL=C sort -u)"
    [ "$candidate_count" = "$ref_count" ] || { echo "mismatched paired trial counts for case=$case_id reference=$REFERENCE candidate=$mode" >&2; exit 1; }
    ref_indexes="$(awk -F '\t' -v c="$case_id" -v r="$REFERENCE" '$1==c && $2==r {print $3}' "$work/rows" | LC_ALL=C sort -n | tr '\n' ' ')"
    candidate_indexes="$(awk -F '\t' -v c="$case_id" -v m="$mode" '$1==c && $2==m {print $3}' "$work/rows" | LC_ALL=C sort -n | tr '\n' ' ')"
    [ "$candidate_indexes" = "$ref_indexes" ] || { echo "unpaired trial indexes for case=$case_id reference=$REFERENCE candidate=$mode" >&2; exit 1; }
  done < <(awk -F '\t' -v c="$case_id" '$1==c {print $2}' "$work/rows" | LC_ALL=C sort -u)
done < <(awk -F '\t' '{print $1}' "$work/rows" | LC_ALL=C sort -u)

# Like-for-like comparisons require matching input and runtime identities. The
# asset definition digest means "same revision across baseline modes" here; a
# future before/after asset evaluation may deliberately differ, and must be
# labeled as an asset-revision comparison rather than a baseline comparison.
identity_values() { awk -F '\t' -v c="$1" -v m="$2" -v col="$3" '$1==c && $2==m {print $col}' "$work/rows" | LC_ALL=C sort -u; }
identity_status() {
  local case_id="$1" candidate="$2" column label format ref_values candidate_values ref_count candidate_count status="comparable"
  while IFS=$'\t' read -r column label format; do
    ref_values="$(identity_values "$case_id" "$REFERENCE" "$column")"
    candidate_values="$(identity_values "$case_id" "$candidate" "$column")"
    ref_count="$(printf '%s\n' "$ref_values" | sed '/^$/d' | wc -l | tr -d ' ')"
    candidate_count="$(printf '%s\n' "$candidate_values" | sed '/^$/d' | wc -l | tr -d ' ')"
    if [ "$ref_count" = 0 ] || [ "$candidate_count" = 0 ]; then status="missing:$label"
    elif [ "$ref_count" != 1 ] || [ "$candidate_count" != 1 ]; then status="inconsistent:$label"
    elif [ "$format" = digest ] && { ! is_sha256_digest "$ref_values" || ! is_sha256_digest "$candidate_values"; }; then status="invalid:$label"
    elif [ "$label" = adapter_id ] && { ! is_promotion_adapter_id "$ref_values" || ! is_promotion_adapter_id "$candidate_values"; }; then status="invalid:$label"
    elif [ "$format" = token ] && { ! is_promotion_identity_token "$ref_values" || ! is_promotion_identity_token "$candidate_values"; }; then status="invalid:$label"
    elif [ "$ref_values" != "$candidate_values" ]; then status="mismatch:$label"
    fi
    [ "$status" = comparable ] || break
  done <<'IDENTITY_COLUMNS'
10	target_kind	token
11	target_id	token
12	runtime	token
14	fixture_before_digest	digest
15	adapter_id	token
16	model_id	token
17	config_id	token
18	case_digest	digest
19	asset_definition_digest	digest
20	source_revision	revision
21	harness_definition_digest	digest
IDENTITY_COLUMNS
  printf '%s' "$status"
}

# mean, sample SD, and t-based 95% CI. N=1 correctly exposes uncertainty as
# NA. n=2..30 uses the exact df=n-1 critical value; n>30 uses 1.960 normal
# approximation and is labelled as such in this source rather than silently
# pooling different degrees of freedom.
stats() {
  awk -F '\t' -v c="$1" -v m="$2" -v col="$3" '
    $1==c && $2==m && $col!="unmeasured" {n++; x[n]=$col; sum+=$col}
    END {if(!n){print "NA\tNA\tNA"; exit} mean=sum/n; if(n==1){printf "%.3f\tNA\tNA",mean; exit}
      for(i=1;i<=n;i++) ss+=(x[i]-mean)^2; sd=sqrt(ss/(n-1));
      tcrit[2]=12.706; tcrit[3]=4.303; tcrit[4]=3.182; tcrit[5]=2.776; tcrit[6]=2.571; tcrit[7]=2.447; tcrit[8]=2.365; tcrit[9]=2.306; tcrit[10]=2.262; tcrit[11]=2.228; tcrit[12]=2.201; tcrit[13]=2.179; tcrit[14]=2.160; tcrit[15]=2.145; tcrit[16]=2.131; tcrit[17]=2.120; tcrit[18]=2.110; tcrit[19]=2.101; tcrit[20]=2.093; tcrit[21]=2.086; tcrit[22]=2.080; tcrit[23]=2.074; tcrit[24]=2.069; tcrit[25]=2.064; tcrit[26]=2.060; tcrit[27]=2.056; tcrit[28]=2.052; tcrit[29]=2.048; tcrit[30]=2.045;
      t=(n<=30 ? tcrit[n] : 1.960);
      printf "%.3f\t%.3f\t%.3f",mean,sd,t*sd/sqrt(n)}' "$work/rows"
}
raw_mean() {
  # Gate comparisons must use the measured values, not the three-decimal table
  # presentation. %.17g retains enough precision for shell-to-awk handoff.
  awk -F '\t' -v c="$1" -v m="$2" -v col="$3" '
    $1==c && $2==m && $col!="unmeasured" {n++; sum+=$col}
    END {if(!n) print "NA"; else printf "%.17g",sum/n}' "$work/rows"
}
pass_stats() { awk -F '\t' -v c="$1" -v m="$2" '$1==c && $2==m {n++; if($5=="pass")p++} END {if(n)printf "%d\t%d\t%.3f",n,p,p/n; else print "0\t0\t0.000"}' "$work/rows"; }
measured_count() { awk -F '\t' -v c="$1" -v m="$2" -v col="$3" '$1==c && $2==m && $col!="unmeasured" {n++} END {print n+0}' "$work/rows"; }
format_stat() {
  local x mean rest sd ci
  x="$1"; mean="${x%%$'\t'*}"; rest="${x#*$'\t'}"; sd="${rest%%$'\t'*}"; ci="${rest#*$'\t'}"
  [ "$mean" = NA ] && printf NA || printf '%s±%s (±%s)' "$mean" "$sd" "$ci"
}

printf 'baseline_matrix: run_group_id=%s reference=%s min_outcome_delta=%s\n' "$GROUP" "$REFERENCE" "$MIN_OUTCOME_DELTA"
printf 'identity: target kind/id/runtime, fixture-before, adapter/model/config, case, and asset-definition digests must match for strict comparison; asset digest means same baseline revision, not before/after improvement.\n'
printf '| case | mode | trials | pass rate | outcome mean±sd (95%% CI) | process mean±sd (95%% CI) | safety mean±sd (95%% CI) | cost mean±sd (95%% CI) | outcome delta | identity | gate |\n'
printf '|---|---|---:|---:|---|---|---|---|---:|---|---|\n'
gate_fail=0
while IFS= read -r case_id; do
  ref_outcome="$(stats "$case_id" "$REFERENCE" 6)"; ref_process="$(stats "$case_id" "$REFERENCE" 7)"; ref_safety="$(stats "$case_id" "$REFERENCE" 8)"
  ref_outcome_mean="${ref_outcome%%$'\t'*}"; ref_process_mean="${ref_process%%$'\t'*}"; ref_safety_mean="${ref_safety%%$'\t'*}"
  ref_outcome_gate_mean="$(raw_mean "$case_id" "$REFERENCE" 6)"; ref_process_gate_mean="$(raw_mean "$case_id" "$REFERENCE" 7)"; ref_safety_gate_mean="$(raw_mean "$case_id" "$REFERENCE" 8)"
  ref_process_measured="$(measured_count "$case_id" "$REFERENCE" 7)"; ref_safety_measured="$(measured_count "$case_id" "$REFERENCE" 8)"
  while IFS= read -r mode; do
    pass="$(pass_stats "$case_id" "$mode")"; trials="${pass%%$'\t'*}"; rest="${pass#*$'\t'}"; passed="${rest%%$'\t'*}"; pass_rate="${rest#*$'\t'}"
    outcome="$(stats "$case_id" "$mode" 6)"; process="$(stats "$case_id" "$mode" 7)"; safety="$(stats "$case_id" "$mode" 8)"; cost="$(stats "$case_id" "$mode" 9)"
    outcome_mean="${outcome%%$'\t'*}"; process_mean="${process%%$'\t'*}"; safety_mean="${safety%%$'\t'*}"
    outcome_gate_mean="$(raw_mean "$case_id" "$mode" 6)"; process_gate_mean="$(raw_mean "$case_id" "$mode" 7)"; safety_gate_mean="$(raw_mean "$case_id" "$mode" 8)"
    process_measured="$(measured_count "$case_id" "$mode" 7)"; safety_measured="$(measured_count "$case_id" "$mode" 8)"
    if [ "$mode" = "$REFERENCE" ]; then delta="0.000"; identity="reference"; gate="reference"
    else
      identity="$(identity_status "$case_id" "$mode")"
      [ "$identity" = comparable ] || echo "warning: non-comparable baseline identity for case=$case_id mode=$mode: $identity" >&2
      raw_delta="$(awk -v a="$outcome_gate_mean" -v b="$ref_outcome_gate_mean" 'BEGIN {printf "%.17g",a-b}')"
      delta="$(awk -v d="$raw_delta" 'BEGIN {printf "%.3f",d}')"; gate=pass
      [ "$passed" = "$trials" ] || gate=fail:absolute_pass
      awk -v d="$raw_delta" -v min="$MIN_OUTCOME_DELTA" 'BEGIN {exit !(d+0>=min+0)}' || gate=fail:outcome_delta
      # `trials` is the declared, paired count for this case/mode.  Do not
      # reuse ref_count from the earlier pairing loop: with multiple cases of
      # different sizes that value belongs to whichever case was visited last,
      # which could let a partially measured reference through a strict gate.
      if [ "$STRICT_GATE" = 1 ] && { [ "$ref_process_measured" != "$trials" ] || [ "$process_measured" != "$trials" ]; }; then gate=fail:process_incomplete; fi
      if [ "$STRICT_GATE" = 1 ] && { [ "$ref_safety_measured" != "$trials" ] || [ "$safety_measured" != "$trials" ]; }; then gate=fail:safety_incomplete; fi
      if [ "$process_gate_mean" = NA ] || [ "$ref_process_gate_mean" = NA ]; then gate=fail:process_unmeasured; else awk -v a="$process_gate_mean" -v b="$ref_process_gate_mean" 'BEGIN {exit !(a+0>=b+0)}' || gate=fail:process_regression; fi
      if [ "$safety_gate_mean" = NA ] || [ "$ref_safety_gate_mean" = NA ]; then gate=fail:safety_unmeasured; else awk -v a="$safety_gate_mean" -v b="$ref_safety_gate_mean" 'BEGIN {exit !(a+0>=b+0)}' || gate=fail:safety_regression; fi
      if [ "$identity" != comparable ]; then
        # Non-strict reports remain useful for diagnosis, but never represent a
        # mismatched run as an improvement. Strict mode turns this into failure.
        gate="not_comparable:$identity"
        [ "$STRICT_GATE" = 1 ] && gate_fail=1
      elif [ "$gate" != pass ]; then
        gate_fail=1
      fi
    fi
    printf '| `%s` | `%s` | %s | %s/%s (%s) | %s | %s | %s | %s | %s | %s | %s |\n' "$case_id" "$mode" "$trials" "$passed" "$trials" "$pass_rate" "$(format_stat "$outcome")" "$(format_stat "$process")" "$(format_stat "$safety")" "$(format_stat "$cost")" "$delta" "$identity" "$gate"
  done < <(awk -F '\t' -v c="$case_id" '$1==c {print $2}' "$work/rows" | LC_ALL=C sort -u)
done < <(awk -F '\t' '{print $1}' "$work/rows" | LC_ALL=C sort -u)

if [ "$STRICT_GATE" = 1 ]; then
  [ "$gate_fail" = 0 ] || { echo 'strict baseline gate: FAIL' >&2; exit 1; }
  echo 'strict baseline gate: PASS'
fi
