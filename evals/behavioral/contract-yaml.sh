#!/usr/bin/env bash
# Narrow, dependency-free YAML subset for behavioral case contracts.  It is not
# a general YAML parser: it deliberately accepts the indentation/list shapes we
# support and rejects required fields placed under another section.

yaml_section_values() {
  local section="$1" key="$2" file="$3"
  awk -v s="$section" -v k="$key" '
    $0 ~ "^"s":[[:space:]]*$" { insection=1; next }
    insection && /^[^[:space:]#]/ { insection=0 }
    insection && $0 ~ "^[[:space:]]+"k":[[:space:]]*$" { depth=match($0,/[^ ]/); inlist=1; next }
    inlist {
      if ($0 ~ /^[[:space:]]*-[[:space:]]/) { sub(/^[[:space:]]*-[[:space:]]*/, ""); print; next }
      if ($0 ~ /^[[:space:]]*[^[:space:]#]/ && match($0,/[^ ]/) <= depth) inlist=0
    }
  ' "$file"
}
yaml_section_scalar() {
  local section="$1" key="$2" file="$3"
  awk -v s="$section" -v k="$key" '
    $0 ~ "^"s":[[:space:]]*$" { insection=1; next }
    insection && /^[^[:space:]#]/ { insection=0 }
    insection && $0 ~ "^[[:space:]]+"k":[[:space:]]*[^[:space:]#]" {
      sub("^[[:space:]]+"k":[[:space:]]*", ""); sub(/[[:space:]]+#.*$/, ""); gsub(/[[:space:]]+$/, ""); print; exit
    }
  ' "$file"
}
yaml_contract_validate() {
  local file="$1"
  awk '
    function err(x) { printf " [%s]", x }
    function allowed_root(k) { return k ~ /^(id|asset|agent|runtime|fixture_repo|prompt|baseline|expected|safety|metrics|pass_threshold|retention|score_weights)$/ }
    function allowed_child(parent, k) {
      if (parent=="baseline") return k=="compare_with"
      if (parent=="expected") return k ~ /^(must_find|must_not_claim|required_artifacts)$/
      if (parent=="safety") return k=="forbidden_actions"
      if (parent=="metrics") return k=="track"
      if (parent=="pass_threshold") return k ~ /^(outcome|process|safety|cost)$/
      if (parent=="retention") return k ~ /^(raw_log_policy|keep_summary_only)$/
      if (parent=="score_weights") return k ~ /^(outcome|process|safety|cost|portability)$/
      return 0
    }
    function is_list_child(parent, k) {
      return (parent=="expected" && k ~ /^(must_find|must_not_claim|required_artifacts)$/) ||
             (parent=="safety" && k=="forbidden_actions") ||
             (parent=="metrics" && k=="track")
    }
    function count_child(parent, k) {
      child[parent SUBSEP k]++
      if (!allowed_child(parent,k)) err("unknown." parent "." k)
    }
    function inline_children(parent, value,    body,n,i,p,k) {
      if (value !~ /^\{.*\}$/) { err("invalid_inline." parent); return }
      body=value; sub(/^\{/, "", body); sub(/\}$/, "", body)
      n=split(body,p,",")
      for (i=1;i<=n;i++) { k=p[i]; sub(/^[[:space:]]*/,"",k); sub(/[[:space:]]*:.*/,"",k); if (k=="") err("invalid_inline." parent); else count_child(parent,k) }
    }
    BEGIN { split(need, parts, " "); for (i in parts) needed[parts[i]]=1; root="" }
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    /^[ ]*-[[:space:]]*/ {
      # prompt: | is the sole supported block scalar; its content is data, not
      # contract structure. Everywhere else list evidence is exactly 4-space.
      if (root=="prompt" && prompt_block) next
      if ($0 !~ /^    -[[:space:]]/) err("invalid_list_indent")
      else if (active_list=="") err("list_outside_declared_child")
      next
    }
    /^[^[:space:]#-][^:]*:/ {
      key=$1; sub(/:.*/, "", key); root=key; roots[key]++; active_list=""; prompt_block=0
      if (!allowed_root(key)) err("unknown.root." key)
      value=$0; sub(/^[^:]*:[[:space:]]*/, "", value); sub(/[[:space:]]+#.*$/, "", value)
      if (value ~ /^\{/) inline_children(key,value)
      if (key=="prompt" && value ~ /^\|/) prompt_block=1
      next
    }
    /^[[:space:]]+[A-Za-z_][A-Za-z0-9_]*:/ {
      key=$1; sub(/:.*/, "", key); active_list=""
      if (root ~ /^(baseline|expected|safety|metrics|pass_threshold|retention|score_weights)$/) {
        # Supported mappings have exactly two spaces. Three-or-more spaces are
        # nested data, not a permissive alternate spelling of a contract key.
        if ($0 !~ /^  [^ ]/) err("invalid_indent." root "." key)
        else { count_child(root,key); if (is_list_child(root,key) && $0 ~ /:[[:space:]]*$/) active_list=root SUBSEP key }
      }
      next
    }
    END {
      for (k in roots) if (roots[k] > 1) err("duplicate.root." k)
      for (ck in child) if (child[ck] > 1) { split(ck, cparts, SUBSEP); err("duplicate." cparts[1] "." cparts[2]) }
      for (k in roots) seen[k]=roots[k]
      for (k in needed) if (!seen[k]) err("missing." k)
      if (!roots["asset"] && !roots["agent"]) err("missing.asset_or_agent")
      if (roots["asset"] && roots["agent"]) err("ambiguous.asset_and_agent")
      if (!child["expected" SUBSEP "must_find"]) err("missing.expected.must_find")
      if (!child["expected" SUBSEP "must_not_claim"]) err("missing.expected.must_not_claim")
      if (!child["expected" SUBSEP "required_artifacts"]) err("missing.expected.required_artifacts")
      if (!child["safety" SUBSEP "forbidden_actions"]) err("missing.safety.forbidden_actions")
      if (!child["metrics" SUBSEP "track"]) err("missing.metrics.track")
      if (!child["pass_threshold" SUBSEP "outcome"] || !child["pass_threshold" SUBSEP "process"] || !child["pass_threshold" SUBSEP "safety"]) err("missing.pass_threshold.required")
      if (!child["retention" SUBSEP "raw_log_policy"]) err("missing.retention.raw_log_policy")
    }
  ' need='id runtime fixture_repo prompt baseline expected safety metrics pass_threshold retention' "$file"
}
