# Novel Voice Bootstrap

This document is a handoff prompt and decision guide for the deferred long-form fiction milestone in `my-voice-mcp`.

It is not an implementation of novel voice support. Its purpose is to help a future AI session resume the work with the right context, scope boundaries, and quality goals.

## Project context

`my-voice-mcp` is a local-first MCP server that turns writing samples into compact voice profiles and then applies those profiles to new text through compare, rewrite, hint, snippet, and generation flows.

What is already implemented:

- legacy single-PDF voice profiles
- bundled `email-formal` voice profiles from multiple samples
- reviewed rewrite and generation mode with one draft -> critic -> revise loop
- local filesystem profile storage
- provider paths for:
  - `openai-compatible`
  - `ollama`
  - `bedrock`
- evaluation harness for the formal email milestone

## Why the current email-first process does not solve novel voice yet

The current process is tuned for short professional prose and does not yet model the traits that matter most in fiction. Email voice transfer can get good results from concise body paragraphs, stable phrase habits, and work-tone consistency. Novel voice usually depends on broader and subtler patterns:

- scene rhythm
- narration distance
- paragraph pacing
- sentence pressure and release
- interiority
- dialogue behavior
- descriptive density by moment
- recurring syntactic habits
- shifts between exposition, action, reflection, and spoken exchange

If the current process is reused without adaptation, it will tend to:

- overfit to topic nouns and surface phrases
- under-model scene and chapter structure
- flatten narrative distance
- produce “styled” prose that sounds cosmetically similar but not convincingly authored

## Goals for the novel milestone

- Build a stronger multi-sample fiction voice process without jumping straight to fine-tuning.
- Keep token use bounded by producing compact, reusable guides instead of replaying huge source texts.
- Improve process quality first, not one showcase output at a time.
- Support both rewrite and prompt-to-draft generation for fiction.
- Preserve meaning and scene function during rewrites while shifting the prose toward the target narrative voice.

## Preferred approach

Use bundled multi-sample source input as the default path. Do not rely on single-source heuristics as the primary quality workflow.

Profile construction should prioritize:

- chapter or excerpt bundles, not isolated paragraphs
- recurring syntactic and rhythmic patterns
- narration distance and interiority markers
- paragraph pacing
- dialogue shape and attribution behavior
- descriptive density and sensory emphasis
- scene-transition habits

Markers should be split into:

- stable cross-sample voice traits
- topic- or scene-specific artifacts

The rewrite and generation loop should keep the same complexity ceiling unless strong evidence shows otherwise:

- pass 1: draft
- pass 2: structured critic
- pass 3: one revision pass

Do not assume training or fine-tuning is necessary. Treat it as a later option only if guide-and-rewrite orchestration clearly plateaus after strong multi-sample profiling and evaluation.

## Likely failure modes

- Overfitting to recurring proper nouns, settings, or plot details instead of durable voice traits
- Confusing “more adjectives” with actual narrative style
- Losing narration distance or point-of-view discipline during rewrite
- Producing fiction that sounds like instructions about style rather than lived prose
- Generating polished paragraphs that do not behave like scenes
- Sacrificing meaning or plot function during rewrite in pursuit of voice similarity
- Letting the critic over-correct into generic literary pastiche

## Acceptance criteria

- A bundled fiction profile should come from multiple excerpts, not a single source block.
- The resulting guide should explicitly model fiction-specific traits beyond lexical markers.
- Rewrite output should preserve scene intent, plot facts, and POV while improving voice match.
- Generation output should read like real fiction prose, not style commentary.
- Evaluation should compare `fast` and `reviewed` modes on a fixed fiction review set, similar to the email milestone.
- Process quality should be the success metric, not one impressive sample.

## First recommended tasks for the next agent

1. Define a constrained fiction MVP, such as one narrator voice or one novel chapter style family, instead of “all fiction.”
2. Design a bundled fiction profile schema that adds narrative-distance, dialogue, pacing, and scene-structure dimensions.
3. Create a small fiction evaluation harness with:
   - 3 to 5 bundled source excerpts
   - rewrite cases
   - prompt-to-draft generation cases
   - human scoring rubric
4. Decide how to normalize fiction inputs without stripping away the exact paragraph and dialogue behavior the model needs to learn.
5. Test whether the existing reviewed loop is enough before considering multi-critic or multi-agent complexity.

## Ready-to-paste bootstrap prompt

```md
You are continuing work on `my-voice-mcp`, a local-first MCP server for voice profile creation and rewrite/generation.

Current implemented state:
- bundled `email-formal` profiles exist and are the strongest current workflow
- reviewed mode uses one draft -> critic -> revise loop
- providers currently supported in code are `openai-compatible`, `ollama`, and `bedrock`
- eval harness exists for the email milestone

Your task is NOT to improve an individual email output. Your task is to design and implement the next milestone for long-form novel voice quality.

Important constraints and defaults:
- use bundled multi-sample fiction input, not single-source heuristics, as the primary quality path
- emphasize scene rhythm, narration distance, paragraph pacing, dialogue behavior, descriptive density, and recurring syntactic patterns over topic nouns
- keep process quality ahead of one-off sample tweaking
- keep the draft -> critic -> revise ceiling unless strong evidence justifies more complexity
- do not jump to training/fine-tuning unless guide-and-rewrite orchestration clearly plateaus

What to do first:
1. inspect the current email-formal bundle workflow, reviewed mode, and eval harness
2. propose a fiction-specific profile schema and evaluation set
3. identify where email-specific assumptions must be generalized or replaced
4. implement the smallest fiction milestone that can be evaluated repeatably

Success looks like:
- a fiction-oriented bundled profile flow
- a fixed fiction eval set
- reviewed mode outputs that better preserve scene intent and sound more convincingly like the target voice than fast mode
```
