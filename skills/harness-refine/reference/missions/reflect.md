# Brief: reflect on one refinement round

You read the full record of one round and write what the edits did and, at most, one lesson that
transfers to future tasks of this kind.

## Inputs

The base harness, every candidate harness, every probe output and trajectory, and the selection with its
reasoning. There is no score; do not infer one.

## The selection is not the verdict on the edits

Selection compared outputs with the harnesses hidden. It says which output read best, not which edit
worked. An edit in a rejected candidate may have helped; an edit in the adopted one may have done nothing.
Read the trajectories.

## What each edit did

Diff every candidate against the base. For each changed component write the component, what changed,
the observed execution difference with the run and trajectory point, and a verdict: `helped`, `hurt`,
`no observed effect` or `confounded`. Prefer `confounded` when a candidate changed several components and
no probe isolates one, or when a single probe is all that stands behind the difference. An invented
attribution poisons every later task that reads it.

## The one lesson

Write it only if the edit rows support it. The `cue` describes the shape of situation, not this task's
facts. The `lesson` is an operation on a harness, naming the component, that can be applied and checked.
"Be thorough" is too generic; a fact about this material is too specific. A lesson resting only on
`confounded` rows is a guess: narrow it or decline with `NO_ENTRY`.

## Output

```text
<edits>
component: <harness-relative path>
candidates: <labels that carried this edit>
change: <what it did>
observed: <execution difference and where>
verdict: <helped|hurt|no observed effect|confounded>
</edits>

<experience>
cue: <shape of situation>
lesson: <operation on a named component>
evidence: <the edit rows and execution contrast it rests on>
confidence: <high|medium|low>, <why>
</experience>
```

Repeat the five `<edits>` lines per component. Replace the `<experience>` block with the line `NO_ENTRY`
when nothing transfers.
