#!/usr/bin/env bash
# Dependency-free structural validator for improvement-record v1.
# Explicit cryptographic evidence verification additionally requires Node.js.
# This intentionally accepts a small, auditable YAML subset rather than trying
# to parse general YAML with grep. See README for the supported strict inputs.

set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
DEFAULT="$DIR/records"
STRICT=0
VERIFY_PROMOTION=0
TRUST_POLICY=""
EVIDENCE_BUNDLE=""
RESULTS_DIR=""
RESULTS_INDEX=""
MIN_OUTCOME_DELTA="0.01"

usage() {
  cat <<'EOF'
Usage: validate-improvement-records.sh [--strict-promotion] [--min-outcome-delta N] [--results-dir DIR | --results-index FILE] [record-or-directory ...]
       validate-improvement-records.sh --verify-promotion --trust-policy FILE --evidence-bundle FILE [strict options] record.yaml

Default mode validates the record's restricted YAML structure and evidence
reference syntax. --strict-promotion additionally resolves promoted-record
evidence against supplied eval results and verifies a like-for-like, positive,
non-regressive comparison. It requires exactly one results source.
Both are lint only; exit 0 never authorizes promotion. --verify-promotion implies
strict mode and invokes the signed-evidence verifier for exactly one promoted
record. Invalid evidence fails; valid signatures still exit 3 with promotion
BLOCKED because operational controls and record-to-bundle binding are unverified.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --strict-promotion) STRICT=1; shift ;;
    --verify-promotion) VERIFY_PROMOTION=1; STRICT=1; shift ;;
    --trust-policy) [ "$#" -ge 2 ] && [ -z "$TRUST_POLICY" ] || { usage >&2; exit 2; }; TRUST_POLICY="$2"; shift 2 ;;
    --evidence-bundle) [ "$#" -ge 2 ] && [ -z "$EVIDENCE_BUNDLE" ] || { usage >&2; exit 2; }; EVIDENCE_BUNDLE="$2"; shift 2 ;;
    --results-dir) [ "$#" -ge 2 ] || { usage >&2; exit 2; }; RESULTS_DIR="$2"; shift 2 ;;
    --results-dir=*) RESULTS_DIR="${1#*=}"; shift ;;
    --results-index) [ "$#" -ge 2 ] || { usage >&2; exit 2; }; RESULTS_INDEX="$2"; shift 2 ;;
    --results-index=*) RESULTS_INDEX="${1#*=}"; shift ;;
    --min-outcome-delta) [ "$#" -ge 2 ] || { usage >&2; exit 2; }; MIN_OUTCOME_DELTA="$2"; shift 2 ;;
    --min-outcome-delta=*) MIN_OUTCOME_DELTA="${1#*=}"; shift ;;
    --help|-h) usage; exit 0 ;;
    --*) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
    *) break ;;
  esac
done

if [ "$VERIFY_PROMOTION" -eq 1 ]; then
  [ -n "$TRUST_POLICY" ] && [ -n "$EVIDENCE_BUNDLE" ] || {
    echo "--verify-promotion requires --trust-policy and --evidence-bundle; promotion=BLOCKED" >&2; exit 2;
  }
elif [ -n "$TRUST_POLICY$EVIDENCE_BUNDLE" ]; then
  echo "evidence options require --verify-promotion; promotion=NOT_AUTHORIZED" >&2; exit 2
fi

if [ "$STRICT" -eq 1 ]; then
  if [ -n "$RESULTS_DIR" ] && [ -n "$RESULTS_INDEX" ]; then
    echo "use only one of --results-dir or --results-index" >&2; exit 2
  fi
  if [ -z "$RESULTS_DIR$RESULTS_INDEX" ]; then
    echo "--strict-promotion requires --results-dir or --results-index" >&2; exit 2
  fi
  printf '%s' "$MIN_OUTCOME_DELTA" | LC_ALL=C grep -Eq '^(0|0\.[0-9]+|1|1\.0+)$' || { echo "--min-outcome-delta must be in [0,1]" >&2; exit 2; }
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/vulpora-improvement.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT HUP INT TERM

# Emits tab-separated E(error), S(section scalar), and L(list item) records.
# Grammar: top-level mapping sections, two-space child keys, four-space scalar
# list items. Unsupported YAML is rejected rather than guessed at.
parse_record() {
  awk '
    function trim(s) { sub(/^[[:space:]]+/, "", s); sub(/[[:space:]]+$/, "", s); return s }
    function scalar(s) {
      s=trim(s); sub(/[[:space:]]+#.*/, "", s); s=trim(s)
      if (s ~ /^".*"$/ || s ~ /^\047.*\047$/) s=substr(s,2,length(s)-2)
      return s
    }
    function err(s) { print "E\t" s }
    function allowed_root(k) { return k ~ /^(schema_version|id|status|lineage|hypothesis|affected_asset|proposed_change|change_author|evaluation|approval|rollback)$/ }
    function allowed_child(section,k) {
      return (section == "lineage" && k ~ /^(source_failure_or_incident|source_id)$/) ||
             (section == "affected_asset" && k ~ /^(kind|id)$/) ||
             (section == "evaluation" && k ~ /^(before_evidence|after_evidence)$/) ||
             (section == "approval" && k ~ /^(independent_approver|approved_at)$/) ||
             (section == "rollback" && k ~ /^(plan|trigger)$/)
    }
    /^[[:space:]]*($|#)/ { next }
    {
      raw=$0
      if (raw ~ /\t/) { err("tab at line " NR); next }
      match(raw,/[^ ]/); ind=RSTART-1; text=substr(raw,ind+1)
      if (text ~ /^-[[:space:]]*/) {
        if (ind != 4 || list == "") { err("list item outside evaluation evidence at line " NR); next }
        v=scalar(substr(text,2))
        if (v == "" || v ~ /^[-[{|>]/ || v ~ /:[[:space:]]/ || v ~ /:$/) err("malformed " list " item at line " NR)
        else { print "L\tevaluation\t" list "\t" v "\t" NR; list_count[list]++ }
        next
      }
      list=""
      if (text !~ /^[A-Za-z_][A-Za-z0-9_]*:[[:space:]]*/) { err("unsupported YAML syntax at line " NR); next }
      split(text,p,/:/); key=p[1]; value=scalar(substr(text,length(key)+2))
      if (ind == 0) {
        if (!allowed_root(key)) { err("unknown top-level key " key " at line " NR); section=""; next }
        if (seen["root" SUBSEP key]++) err("duplicate top-level key " key " at line " NR)
        section=key
        if (key ~ /^(lineage|affected_asset|evaluation|approval|rollback)$/) {
          if (value != "") err("section " key " must be a mapping at line " NR)
        } else {
          if (value == "" || value ~ /^[\[{|>]/) err("missing or unsupported scalar " key " at line " NR)
          else print "S\troot\t" key "\t" value "\t" NR
        }
        next
      }
      if (ind != 2 || section !~ /^(lineage|affected_asset|evaluation|approval|rollback)$/) { err("misplaced key " key " at line " NR); next }
      if (!allowed_child(section,key)) { err("unknown or misplaced " section "." key " at line " NR); next }
      if (seen[section SUBSEP key]++) err("duplicate " section "." key " at line " NR)
      if (section == "evaluation") {
        if (value != "") err("malformed " key " list at line " NR)
        else { list=key; list_seen[key]=1 }
      } else {
        if (value == "" || value ~ /^[\[{|>]/) err("missing or unsupported scalar " section "." key " at line " NR)
        else print "S\t" section "\t" key "\t" value "\t" NR
      }
    }
    END {
      for (k in list_seen) if (list_count[k] == 0) print "L\tevaluation\t" k "\t\t0"
    }
  ' "$1"
}

field() { awk -F '\t' -v sec="$1" -v key="$2" '$1 == "S" && $2 == sec && $3 == key { print $4; exit }' "$3"; }
list_values() { awk -F '\t' -v key="$1" '$1 == "L" && $3 == key && $4 != "" { print $4 }' "$2"; }
list_count() { awk -F '\t' -v key="$1" '$1 == "L" && $3 == key && $4 != "" { n++ } END { print n+0 }' "$2"; }
add_error() { ERRORS="$ERRORS [$1]"; }
safe_token() { printf '%s' "$1" | LC_ALL=C grep -Eq '^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$'; }
safe_case_id() { printf '%s' "$1" | LC_ALL=C grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}(/[A-Za-z0-9][A-Za-z0-9._-]{0,79})?$'; }
immutable_ref() {
  case "$1" in
    result_id:*|incident_id:*) safe_token "${1#*:}" ;;
    uri:*) printf '%s' "${1#uri:}" | LC_ALL=C grep -Eq '^[A-Za-z][A-Za-z0-9+.-]*://[^[:space:]#]+#sha256=[A-Fa-f0-9]{64}$' ;;
    path:*) p="${1#path:}"; [ "${p#/}" = "$p" ] && printf '%s' "$p" | LC_ALL=C grep -Eq '^[^[:space:]#][^[:space:]]*#sha256=[A-Fa-f0-9]{64}$' && ! printf '%s' "$p" | grep -qE '(^|/)\.\.(/|$)' ;;
    *) safe_token "$1" ;;
  esac
}
timestamp_ok() {
  value="$1"
  printf '%s' "$value" | LC_ALL=C grep -Eq '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$' || return 1
  month="${value:5:2}"; day="${value:8:2}"; hour="${value:11:2}"; minute="${value:14:2}"; second="${value:17:2}"
  [ "$month" -ge 1 ] && [ "$month" -le 12 ] && [ "$day" -ge 1 ] && [ "$hour" -le 23 ] && [ "$minute" -le 59 ] && [ "$second" -le 59 ] || return 1
  # RFC 3339 requires a real calendar date, not merely a day in 1..31.
  awk -v y="${value:0:4}" -v m="$month" -v d="$day" '
    BEGIN {
      leap = ((y % 4 == 0 && y % 100 != 0) || y % 400 == 0)
      max = (m == 2 ? (leap ? 29 : 28) : (m == 4 || m == 6 || m == 9 || m == 11 ? 30 : 31))
      exit !(d <= max)
    }' || return 1
  case "$value" in *Z) return 0 ;; esac
  zone_hour="${value: -5:2}"; zone_minute="${value: -2}"
  [ "$zone_hour" -le 23 ] && [ "$zone_minute" -le 59 ]
}
# Compare RFC 3339 times without relying on platform-specific `date` parsing.
# Strict results normally use UTC, but offset timestamps are compared correctly.
timestamp_not_before() {
  awk -v approved="$1" -v evidence="$2" '
    function epoch(v,    y,m,d,h,mi,s,off,sign,oh,om,days,tail,fraction) {
      y=substr(v,1,4)+0; m=substr(v,6,2)+0; d=substr(v,9,2)+0
      h=substr(v,12,2)+0; mi=substr(v,15,2)+0; s=substr(v,18,2)+0
      if (m <= 2) y--
      days=365*y + int(y/4) - int(y/100) + int(y/400) + int((153*(m + (m > 2 ? -3 : 9)) + 2)/5) + d - 719469
      off=0
      if (v !~ /Z$/) { sign=(substr(v,length(v)-5,1)=="-" ? -1 : 1); oh=substr(v,length(v)-4,2)+0; om=substr(v,length(v)-1,2)+0; off=sign*(oh*3600+om*60) }
      fraction=0; tail=substr(v,20)
      if (match(tail, /^\.[0-9]+/)) fraction=(substr(tail,2,RLENGTH-1)+0) / (10 ^ (RLENGTH-1))
      return days*86400+h*3600+mi*60+s+fraction-off
    }
    BEGIN { exit !(epoch(approved) >= epoch(evidence)) }'
}
number_01() { printf '%s' "$1" | LC_ALL=C grep -Eq '^(0|1|0\.[0-9]+|1\.0+)$'; }
greater_than() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a > b) }'; }
not_less_than() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a >= b) }'; }
identity_value() {
  case "$(printf '%s' "$1" | LC_ALL=C tr '[:upper:]' '[:lower:]')" in
    ''|unknown|unspecified|null|none) return 1 ;;
    *) return 0 ;;
  esac
}
sha256_digest() { printf '%s' "$1" | LC_ALL=C grep -Eq '^sha256:[A-Fa-f0-9]{64}$'; }
source_revision() { printf '%s' "$1" | LC_ALL=C grep -Eq '^([a-f0-9]{40}|gitless)$'; }
is_baseline_mode() { case "$1" in plain-runtime|agent-only|agent-memory) return 0 ;; *) return 1 ;; esac; }
trial_number() { printf '%s' "$1" | LC_ALL=C grep -Eq '^[1-9][0-9]*$'; }
valid_trial_pair() { trial_number "$1" && trial_number "$2" && [ "$1" -le "$2" ] && [ "$2" -le 10000 ]; }
strict_identity_tokens() { safe_case_id "$1" && safe_token "$2" && safe_token "$3" && safe_token "$4" && safe_token "$5" && safe_token "$6"; }
canonical_principal() {
  # No identity provider exists here: accept only canonical lower-case,
  # email-shaped ASCII principal names. This is not an authentication claim.
  printf '%s' "$1" | LC_ALL=C grep -Eq '^[a-z0-9][a-z0-9._+-]{0,63}@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
}
same_principal_ascii_casefold() {
  [ "$(printf '%s' "$1" | LC_ALL=C tr '[:upper:]' '[:lower:]')" = "$(printf '%s' "$2" | LC_ALL=C tr '[:upper:]' '[:lower:]')" ]
}

# Directory result records must use the metadata emitted by the behavioral
# runner. The index alternative is the versioned v5 TSV format documented in README.
parse_result_yaml() {
  if LC_ALL=C grep -Eq '^[[:space:]]*(measurements|estimated_tokens_measurement_kind|estimated_tokens_scope):' "$1"; then
    node "$DIR/../behavioral/adapters/validate-result-measurements.cjs" "$1" || {
      printf 'E\tinvalid result measurement schema or provenance\n'; return;
    }
  fi
  awk '
    function clean(s) { sub(/^[[:space:]]*[\047"]/, "", s); sub(/[\047"][[:space:]]*$/, "", s); return s }
    function val(s) { sub(/^[^:]*:[[:space:]]*/, "", s); sub(/[[:space:]]+#.*/, "", s); return clean(s) }
    function score(s) { return s ~ /^(0|1|0\.[0-9]+|1\.0+)$/ }
    function inline(s,k,  r) { r="(^|[, {])" k ":[[:space:]]*[^,} ]+"; if (match(s,r)) { x=substr(s,RSTART,RLENGTH); sub(/^.*:[[:space:]]*/, "", x); return clean(x) } return "" }
    function inline_count(s,k,  r,rest,n) { r="(^|[, {])" k ":[[:space:]]*[^,} ]+"; rest=s; while (match(rest,r)) { n++; rest=substr(rest,RSTART+RLENGTH) } return n }
    function bad_result() { bad=1 }
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    /^[^[:space:]][A-Za-z_][A-Za-z0-9_]*:/ {
      key=$1; sub(/:.*/, "", key); v=val($0)
      section=(v == "" ? key : "")
      if (key == "schema" || key == "eval_id" || key == "case_id" || key == "target" || key == "actual" || key == "verdict" || key == "behavioral" || key == "run") if (seen["root" SUBSEP key]++) bad_result()
      if (key == "schema") schema=v
      else if (key == "eval_id") rid=v
      else if (key == "case_id") cid=v
      else if (key == "verdict") verdict=v
      else if (key == "target") {
        target_inline=(v != ""); tk=inline($0,"kind"); ti=inline($0,"id")
        if (target_inline && (inline_count($0,"kind") != 1 || inline_count($0,"id") != 1)) bad_result()
      } else if (key == "actual") {
        actual_line=$0; actual_inline=(v != ""); outcome=inline($0,"outcome_score"); process=inline($0,"process_score"); safety=inline($0,"safety_score")
        if (actual_inline && (inline_count($0,"outcome_score") != 1 || inline_count($0,"process_score") != 1 || inline_count($0,"safety_score") != 1)) bad_result()
      }
      else if (key == "outcome_score" || key == "process_score" || key == "safety_score") bad_result()
      next
    }
    /^[ ]{2}[A-Za-z_][A-Za-z0-9_]*:/ {
      key=$1; sub(/:.*/, "", key); v=val($0)
      if (section == "target") {
        if (key == "kind" || key == "id") { if (seen["target" SUBSEP key]++) bad_result(); if (key == "kind") tk=v; else ti=v }
      }
      else if (section == "actual") {
        if (key == "outcome_score" || key == "process_score" || key == "safety_score") {
          if (seen["actual" SUBSEP key]++) bad_result()
          if (key == "outcome_score") outcome=v
          else if (key == "process_score") process=v
          else safety=v
        }
      } else if (section == "metrics") {
        if (key == "outcome_score" || key == "process_score" || key == "safety_score") {
          if (seen["metrics" SUBSEP key]++) bad_result()
          if (key == "outcome_score") metrics_outcome=v
          else if (key == "process_score") metrics_process=v
          else metrics_safety=v
        }
      } else if (section == "behavioral") {
        if (key == "runtime" || key == "baseline_mode" || key == "fixture_before_digest" || key == "process_score" || key == "safety_score") {
          if (seen["behavioral" SUBSEP key]++) bad_result()
          if (key == "runtime") runtime=v
          else if (key == "baseline_mode") baseline_mode=v
          else if (key == "fixture_before_digest") fixture=v
          else if (key == "process_score") behavioral_process=v
          else behavioral_safety=v
        }
      } else if (section == "run") {
        if (key ~ /^(run_group_id|timestamp|adapter_id|model_id|config_id|case_digest|asset_definition_digest|source_revision|harness_definition_digest|trial_index|trial_count)$/) {
          if (seen["run" SUBSEP key]++) bad_result()
          if (key == "run_group_id") run_group=v
          else if (key == "timestamp") run_timestamp=v
          else if (key == "adapter_id") adapter=v
          else if (key == "model_id") model=v
          else if (key == "config_id") cfg=v
          else if (key == "case_digest") case_digest=v
          else if (key == "asset_definition_digest") asset_digest=v
          else if (key == "source_revision") source_revision=v
          else if (key == "harness_definition_digest") harness_digest=v
          else if (key == "trial_index") trial_index=v
          else trial_count=v
        }
      }
      next
    }
    END {
      if (schema != "vulpora.eval-result") bad_result()
      if (verdict !~ /^(pass|fail)$/) bad_result()
      for (k in required) if (seen["root" SUBSEP required[k]] != 1) bad_result()
      if (target_inline) { if (seen["target" SUBSEP "kind"] || seen["target" SUBSEP "id"]) bad_result() }
      else if (seen["target" SUBSEP "kind"] != 1 || seen["target" SUBSEP "id"] != 1) bad_result()
      if (actual_inline) { if (seen["actual" SUBSEP "outcome_score"] || seen["actual" SUBSEP "process_score"] || seen["actual" SUBSEP "safety_score"]) bad_result() }
      else if (seen["actual" SUBSEP "outcome_score"] != 1 || seen["actual" SUBSEP "process_score"] != 1 || seen["actual" SUBSEP "safety_score"] != 1) bad_result()
      if (seen["behavioral" SUBSEP "runtime"] != 1 || seen["behavioral" SUBSEP "baseline_mode"] != 1 || seen["behavioral" SUBSEP "fixture_before_digest"] != 1) bad_result()
      for (k in run_required) if (seen["run" SUBSEP run_required[k]] != 1) bad_result()
      if (metrics_outcome != "" && (!score(metrics_outcome) || !score(outcome) || metrics_outcome + 0 != outcome + 0)) bad_result()
      if (metrics_process != "" && (!score(metrics_process) || !score(process) || metrics_process + 0 != process + 0)) bad_result()
      if (metrics_safety != "" && (!score(metrics_safety) || !score(safety) || metrics_safety + 0 != safety + 0)) bad_result()
      if (behavioral_process != "" && (!score(behavioral_process) || !score(process) || behavioral_process + 0 != process + 0)) bad_result()
      if (behavioral_safety != "" && (!score(behavioral_safety) || !score(safety) || behavioral_safety + 0 != safety + 0)) bad_result()
      if (bad) print "E\tinvalid or ambiguous runner eval-result YAML"
      else print rid "\t" cid "\t" tk "\t" ti "\t" runtime "\t" baseline_mode "\t" run_group "\t" run_timestamp "\t" model "\t" cfg "\t" case_digest "\t" fixture "\t" adapter "\t" asset_digest "\t" source_revision "\t" harness_digest "\t" trial_index "\t" trial_count "\t" outcome "\t" process "\t" safety "\t" verdict
    }
    BEGIN {
      split("schema eval_id case_id target actual verdict behavioral run", required, " ")
      split("run_group_id timestamp adapter_id model_id config_id case_digest asset_definition_digest source_revision harness_definition_digest trial_index trial_count", run_required, " ")
    }
  ' "$1"
}

load_results() {
  RESULTS="$TMP/results.tsv"; : > "$RESULTS"
  if [ -n "$RESULTS_INDEX" ]; then
    [ -f "$RESULTS_INDEX" ] || { echo "results index not found: $RESULTS_INDEX" >&2; return 1; }
    awk -F '\t' '
      BEGIN { header="result_id\tcase_id\ttarget_kind\ttarget_id\truntime\tbaseline_mode\trun_group_id\ttimestamp\tmodel_id\tconfig_id\tcase_digest\tfixture_before_digest\tadapter_id\tasset_definition_digest\tsource_revision\tharness_definition_digest\ttrial_index\ttrial_count\toutcome_score\tprocess_score\tsafety_score\tverdict" }
      NR == 1 { if ($0 != "vulpora.improvement-results-index/v5") { print "E\t" NR "\texpected vulpora.improvement-results-index/v5" }; next }
      NR == 2 { if ($0 != header) { print "E\t" NR "\tinvalid v5 column header" }; next }
      /^[[:space:]]*($|#)/ { next }
      NF != 22 { print "E\t" NR "\texpected 22 tab-separated fields"; next }
      { print }
    ' "$RESULTS_INDEX" > "$RESULTS"
  else
    [ -d "$RESULTS_DIR" ] || { echo "results dir not found: $RESULTS_DIR" >&2; return 1; }
    found=0
    while IFS= read -r result; do
      found=1; parse_result_yaml "$result" >> "$RESULTS"
    done < <(find "$RESULTS_DIR" -type f \( -name '*.yaml' -o -name '*.yml' \) | LC_ALL=C sort)
    [ "$found" -eq 1 ] || { echo "results dir has no YAML result records: $RESULTS_DIR" >&2; return 1; }
  fi
  if awk -F '\t' 'NF != 22 || $1 == "" || $2 == "" || $3 == "" || $4 == "" || $5 == "" || $6 == "" || $7 == "" || $8 == "" || $9 == "" || $10 == "" || $11 == "" || $12 == "" || $13 == "" || $14 == "" || $15 == "" || $16 == "" || $17 == "" || $18 == "" || $19 == "" || $20 == "" || $21 == "" || $22 == "" { exit 1 }' "$RESULTS"; then :; else
    echo "malformed/incomplete eval result source" >&2; return 1
  fi
  if awk -F '\t' 'seen[$1]++ { exit 1 }' "$RESULTS"; then :; else
    echo "duplicate eval result id in result source" >&2; return 1
  fi
}

resolve_result() {
  ref="$1"; out="$2"
  case "$ref" in result_id:*) ref="${ref#result_id:}" ;; esac
  safe_token "$ref" || return 1
  awk -F '\t' -v id="$ref" '$1 == id { print; n++ } END { exit(n == 1 ? 0 : 1) }' "$RESULTS" > "$out"
}

audit_trial_set() {
  awk -F '\t' '
    { group=$2 SUBSEP $3 SUBSEP $4 SUBSEP $9 SUBSEP $10 SUBSEP $11 SUBSEP $12 SUBSEP $13; trial=$17; total=$18
      if (trial !~ /^[1-9][0-9]*$/ || total !~ /^[1-9][0-9]*$/ || trial > total || total > 10000) { bad=1; next }
      if (declared[group] != "" && declared[group] != total) bad=1
      declared[group]=total
      if (runtime[group] != "" && runtime[group] != $5) bad=1
      runtime[group]=$5
      if (mode[group] != "" && mode[group] != $6) bad=1
      mode[group]=$6
      if (run_group[group] != "" && run_group[group] != $7) bad=1
      run_group[group]=$7
      if (revision[group] != "" && revision[group] != $14) bad=1
      revision[group]=$14
      if (source[group] != "" && source[group] != $15) bad=1
      source[group]=$15
      if (harness[group] != "" && harness[group] != $16) bad=1
      harness[group]=$16
      if (seen[group SUBSEP trial]++) bad=1
      present[group SUBSEP trial]=1
    }
    END { for (g in declared) for (i=1; i<=declared[g]; i++) if (!present[g SUBSEP i]) bad=1; exit bad ? 1 : 0 }
  ' "$1"
}

verify_linked_promotion() {
  before_file="$TMP/before.tsv"; after_file="$TMP/after.tsv"; pairs_file="$TMP/pairs.tsv"
  : > "$before_file"; : > "$after_file"; : > "$pairs_file"
  for ref in $(list_values before_evidence "$PARSED"); do resolve_result "$ref" "$TMP/one.tsv" || { add_error "strict.unresolved_before:$ref"; continue; }; cat "$TMP/one.tsv" >> "$before_file"; done
  for ref in $(list_values after_evidence "$PARSED"); do resolve_result "$ref" "$TMP/one.tsv" || { add_error "strict.unresolved_after:$ref"; continue; }; cat "$TMP/one.tsv" >> "$after_file"; done
  [ -s "$before_file" ] && [ -s "$after_file" ] || return
  record_kind="$(field affected_asset kind "$PARSED")"; record_id="$(field affected_asset id "$PARSED")"
  safe_token "$record_kind" && safe_token "$record_id" || add_error "strict.invalid_record_asset_identity"
  while IFS=$'\t' read -r bid bcase bkind btarget bruntime bmode bgroup btimestamp bmodel bcfg bcase_digest bfixture badapter basset_digest bsource_revision bharness_digest btrial_index btrial_count bout bprocess bsafety bverdict; do
    [ "$bkind" = "$record_kind" ] && [ "$btarget" = "$record_id" ] || add_error "strict.target_mismatch:$bid"
    strict_identity_tokens "$bcase" "$bkind" "$btarget" "$bmodel" "$bcfg" "$badapter" || add_error "strict.invalid_before_identity_tokens:$bid"
    safe_token "$bruntime" && is_baseline_mode "$bmode" && safe_token "$bgroup" && timestamp_ok "$btimestamp" || add_error "strict.invalid_before_provenance:$bid"
    identity_value "$bmodel" && identity_value "$bcfg" && identity_value "$badapter" && sha256_digest "$bcase_digest" && sha256_digest "$bfixture" && sha256_digest "$basset_digest" && source_revision "$bsource_revision" && sha256_digest "$bharness_digest" || add_error "strict.invalid_before_identity:$bid"
    valid_trial_pair "$btrial_index" "$btrial_count" || add_error "strict.invalid_before_trial:$bid"
    number_01 "$bout" && number_01 "$bprocess" && number_01 "$bsafety" || add_error "strict.invalid_before_metrics:$bid"
    [ "$bverdict" = pass ] || [ "$bverdict" = fail ] || add_error "strict.invalid_before_verdict:$bid"
  done < "$before_file"
  audit_trial_set "$before_file" || add_error "strict.before_trials_incomplete_duplicate_or_mixed_revision"
  audit_trial_set "$after_file" || add_error "strict.after_trials_incomplete_duplicate_or_mixed_revision"
  approved="$(field approval approved_at "$PARSED")"
  while IFS=$'\t' read -r aid acase akind atarget aruntime amode agroup atimestamp amodel acfg acase_digest afixture aadapter aasset_digest asource_revision aharness_digest atrial_index atrial_count aout aprocess asafety averdict; do
    [ "$akind" = "$record_kind" ] && [ "$atarget" = "$record_id" ] || { add_error "strict.target_mismatch:$aid"; continue; }
    strict_identity_tokens "$acase" "$akind" "$atarget" "$amodel" "$acfg" "$aadapter" || { add_error "strict.invalid_after_identity_tokens:$aid"; continue; }
    safe_token "$aruntime" && is_baseline_mode "$amode" && safe_token "$agroup" && timestamp_ok "$atimestamp" || { add_error "strict.invalid_after_provenance:$aid"; continue; }
    timestamp_not_before "$approved" "$atimestamp" || { add_error "strict.approval_precedes_after_evidence:$aid"; continue; }
    identity_value "$amodel" && identity_value "$acfg" && identity_value "$aadapter" && sha256_digest "$acase_digest" && sha256_digest "$afixture" && sha256_digest "$aasset_digest" && source_revision "$asource_revision" && sha256_digest "$aharness_digest" || { add_error "strict.invalid_after_identity:$aid"; continue; }
    valid_trial_pair "$atrial_index" "$atrial_count" || { add_error "strict.invalid_after_trial:$aid"; continue; }
    number_01 "$aout" && number_01 "$aprocess" && number_01 "$asafety" || { add_error "strict.invalid_after_metrics:$aid"; continue; }
    [ "$averdict" = pass ] || { add_error "strict.after_not_pass:$aid"; continue; }
    matches="$(awk -F '\t' -v c="$acase" -v k="$akind" -v t="$atarget" -v r="$aruntime" -v o="$amode" -v q="$agroup" -v m="$amodel" -v g="$acfg" -v d="$acase_digest" -v f="$afixture" -v a="$aadapter" -v h="$aharness_digest" -v i="$atrial_index" '$2==c && $3==k && $4==t && $5==r && $6==o && $7==q && $9==m && $10==g && $11==d && $12==f && $13==a && $16==h && $17==i { print }' "$before_file")"
    count="$(printf '%s\n' "$matches" | awk 'NF { n++ } END { print n+0 }')"
    [ "$count" -eq 1 ] || { add_error "strict.not_comparable:$aid"; continue; }
    IFS=$'\t' read -r bid bcase bkind btarget bruntime bmode bgroup btimestamp bmodel bcfg bcase_digest bfixture badapter basset_digest bsource_revision bharness_digest btrial_index btrial_count bout bprocess bsafety bverdict <<< "$matches"
    [ "$atrial_count" = "$btrial_count" ] || { add_error "strict.trial_count_mismatch:$aid"; continue; }
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$acase" "$akind" "$atarget" "$aruntime" "$amode" "$agroup" "$amodel" "$acfg" "$acase_digest" "$afixture" "$aadapter" "$bout" "$bprocess" "$bsafety" "$aout" "$aprocess" "$asafety" >> "$pairs_file"
  done < "$after_file"
  while IFS=$'\t' read -r bid bcase bkind btarget bruntime bmode bgroup btimestamp bmodel bcfg bcase_digest bfixture badapter basset_digest bsource_revision bharness_digest btrial_index btrial_count bout bprocess bsafety bverdict; do
    count="$(awk -F '\t' -v c="$bcase" -v k="$bkind" -v t="$btarget" -v r="$bruntime" -v o="$bmode" -v q="$bgroup" -v m="$bmodel" -v g="$bcfg" -v d="$bcase_digest" -v f="$bfixture" -v a="$badapter" -v h="$bharness_digest" -v i="$btrial_index" '$2==c && $3==k && $4==t && $5==r && $6==o && $7==q && $9==m && $10==g && $11==d && $12==f && $13==a && $16==h && $17==i { n++ } END { print n+0 }' "$after_file")"
    [ "$count" -eq 1 ] || add_error "strict.before_not_paired:$bid"
  done < "$before_file"
  while IFS= read -r aggregate_error; do add_error "$aggregate_error"; done < <(
    awk -F '\t' -v min="$MIN_OUTCOME_DELTA" '
      { g=$1 SUBSEP $2 SUBSEP $3 SUBSEP $4 SUBSEP $5 SUBSEP $6 SUBSEP $7 SUBSEP $8 SUBSEP $9 SUBSEP $10 SUBSEP $11; n[g]++; bo[g]+=$12; bp[g]+=$13; bs[g]+=$14; ao[g]+=$15; ap[g]+=$16; as[g]+=$17 }
      END { for (g in n) { if ((ao[g]-bo[g])/n[g] <= min) print "strict.no_mean_outcome_delta"; if (ap[g]/n[g] < bp[g]/n[g]) print "strict.mean_process_regression"; if (as[g]/n[g] < bs[g]/n[g]) print "strict.mean_safety_regression" } }
    ' "$pairs_file" | LC_ALL=C sort -u
  )
}

if [ "$STRICT" -eq 1 ]; then load_results || exit 2; fi

files=""
if [ "$#" -gt 0 ]; then
  for path in "$@"; do
    if [ -d "$path" ]; then files="$files $(find "$path" -name '*.yaml' -type f | LC_ALL=C sort)"
    else files="$files $path"; fi
  done
else
  [ -d "$DEFAULT" ] && files="$(find "$DEFAULT" -name '*.yaml' -type f | LC_ALL=C sort)"
fi
if [ -z "${files// }" ]; then
  echo "improvement records: 0 (nothing to validate); promotion=NOT_AUTHORIZED"
  [ "$VERIFY_PROMOTION" -eq 0 ] || { echo "promotion=BLOCKED reason=MISSING_PROMOTED_RECORD" >&2; exit 1; }
  exit 0
fi

pass=0; fail=0; promoted=0
for file in $files; do
  [ -f "$file" ] || { echo "  x missing: $file" >&2; fail=$((fail+1)); continue; }
  PARSED="$TMP/record.tsv"; parse_record "$file" > "$PARSED"
  ERRORS=""
  while IFS=$'\t' read -r mark detail; do [ "$mark" = E ] && add_error "yaml:$detail"; done < "$PARSED"
  for root in schema_version id status hypothesis proposed_change change_author; do
    [ -n "$(field root "$root" "$PARSED")" ] || add_error "missing:$root"
  done
  [ "$(field root schema_version "$PARSED")" = "vulpora.improvement-record/v1" ] || add_error "schema_version"
  for item in lineage.source_failure_or_incident lineage.source_id affected_asset.kind affected_asset.id; do
    sec="${item%%.*}"; key="${item#*.}"; [ -n "$(field "$sec" "$key" "$PARSED")" ] || add_error "missing:$item"
  done
  for list in before_evidence after_evidence; do
    awk -F '\t' -v k="$list" '$1 == "L" && $3 == k { found=1 } END { exit found ? 0 : 1 }' "$PARSED" || add_error "missing:evaluation.$list"
    while IFS= read -r ref; do immutable_ref "$ref" || add_error "invalid_evidence:$list:$ref"; done < <(list_values "$list" "$PARSED")
  done
  status="$(field root status "$PARSED")"
  case "$status" in quarantined|validated|promoted|rejected|rolled_back) ;; *) add_error "status_enum:$status" ;; esac
  if [ "$status" = promoted ]; then
    promoted=$((promoted+1))
    [ "$(list_count before_evidence "$PARSED")" -gt 0 ] || add_error "promoted.before_evidence"
    [ "$(list_count after_evidence "$PARSED")" -gt 0 ] || add_error "promoted.after_evidence"
    author="$(field root change_author "$PARSED")"; approver="$(field approval independent_approver "$PARSED")"
    canonical_principal "$author" || add_error "promoted.change_author_principal"
    [ -n "$approver" ] || add_error "promoted.independent_approver"
    [ -z "$approver" ] || canonical_principal "$approver" || add_error "promoted.independent_approver_principal"
    [ -z "$approver" ] || ! same_principal_ascii_casefold "$approver" "$author" || add_error "promoted.approval_not_independent"
    approved="$(field approval approved_at "$PARSED")"; timestamp_ok "$approved" || add_error "promoted.approved_at_timestamp"
    [ -n "$(field rollback plan "$PARSED")" ] || add_error "promoted.rollback.plan"
    [ -n "$(field rollback trigger "$PARSED")" ] || add_error "promoted.rollback.trigger"
    [ "$STRICT" -eq 0 ] || verify_linked_promotion
  fi
  if [ -n "$ERRORS" ]; then echo "  x $file$ERRORS"; fail=$((fail+1)); else echo "  ok $file"; pass=$((pass+1)); fi
done
echo "improvement records: $pass PASS, $fail FAIL; promotion=NOT_AUTHORIZED"
[ "$fail" -eq 0 ] || exit 1
if [ "$VERIFY_PROMOTION" -eq 1 ]; then
  [ "$pass" -eq 1 ] && [ "$promoted" -eq 1 ] || {
    echo "promotion=BLOCKED reason=REQUIRE_ONE_PROMOTED_RECORD" >&2; exit 1;
  }
  command -v node >/dev/null 2>&1 || { echo "promotion=BLOCKED reason=NODE_REQUIRED" >&2; exit 2; }
  node "$DIR/../../install/eval-evidence.js" verify "$TRUST_POLICY" "$EVIDENCE_BUNDLE"
  evidence_status=$?
  # The verifier checks signed trial evidence, not its binding to this record or
  # actual operational isolation/storage. Never upgrade its exit to approval.
  echo "promotion=BLOCKED reason=OPERATIONAL_AND_RECORD_BINDING_UNVERIFIED" >&2
  [ "$evidence_status" -eq 3 ] && exit 3
  exit 1
fi
exit 0
