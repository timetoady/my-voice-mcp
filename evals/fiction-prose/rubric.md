# Human Review Rubric — Fiction Prose Voice

Score each draft from 1 to 5 on the following:

- Voice match: does this sound like the bundled narrative voice—its narration distance, scene rhythm, paragraph pacing, dialogue behavior, and recurring syntactic habits—rather than generic "literary" prose?
- Scene-intent & POV preservation: does it hold a single, consistent point of view and narration distance, and (for rewrites) preserve the scene's intent and plot facts?
- Narration-distance & pacing fidelity: does the prose keep the source's distance and pacing instead of flattening everything to one register or one paragraph length?
- Prose quality: does it read like lived fiction—observed, specific, restrained—rather than commentary about style or a pile of adjectives?
- Meaning/coherence: for rewrites, does it preserve meaning; for generation, does it stay coherent and on brief without inventing unsupported plot?

Acceptance target for this milestone:

- Average at least 4 out of 5 for voice match across the full review set.
- Average at least 4 out of 5 for scene-intent & POV preservation across the full review set.
- No case below 3 out of 5 on meaning/coherence.
- Reviewed mode should outperform fast mode in at least 4 of the 6 total rewrite and generate tasks.

Note: a configured model-backed provider (openai-compatible, ollama, or bedrock) is required to exercise reviewed mode meaningfully. With no provider configured, both fast and reviewed fall back to the heuristic baseline and will read identically; that run only validates the harness end to end, not the reviewed-vs-fast quality gap.
