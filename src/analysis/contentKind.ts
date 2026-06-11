import type { ProfileType } from "../domain/types.js";

/**
 * Single source of truth for the content-type-specific wording used across providers
 * and bundle distillation. Keeps email-vs-fiction differences out of the provider bodies
 * so each provider stays a thin transport over shared, profile-type-aware prompts.
 */
export interface ContentKind {
  profileType: ProfileType;
  /** Noun for the produced artifact, e.g. "email draft" or "prose passage". */
  artifactNoun: string;
  /** Generation instruction with a `{length}` placeholder for the requested length. */
  generateInstruction: string;
  /** System-prompt bullets for the bundle distillation step. */
  distillFocus: string[];
  /** System-prompt bullets for the critique step. */
  critiquePriorities: string[];
  /** Closing line of the revision checklist baked into the prompt pack. */
  revisionClosing: string;
}

const EMAIL_FORMAL: ContentKind = {
  profileType: "email-formal",
  artifactNoun: "email draft",
  generateInstruction: "Generate a {length} email draft in the target voice from this brief.",
  distillFocus: [
    "You distill a formal email voice profile from multiple normalized samples.",
    "Find cross-sample commonalities and avoid overfitting to project-specific nouns."
  ],
  critiquePriorities: [
    "For rewrites prioritize meaning preservation, tone fidelity, and reduction of generic assistant phrasing.",
    "For generation prioritize voice fidelity, coherence, and whether the result sounds like an actual email draft."
  ],
  revisionClosing: "Keep the output readable and professionally polished."
};

const FICTION_PROSE: ContentKind = {
  profileType: "fiction-prose",
  artifactNoun: "prose passage",
  generateInstruction:
    "Write a {length} prose passage in the target narrative voice from this brief. Continue or render the scene as lived fiction, not commentary about style.",
  distillFocus: [
    "You distill a long-form fiction narrative voice from multiple normalized prose excerpts.",
    "Capture durable craft traits: point of view and narration distance, scene rhythm and paragraph pacing, dialogue behavior and attribution habits, descriptive density, interiority, and recurring syntactic patterns.",
    "Separate stable voice traits from scene- or topic-specific artifacts, and avoid overfitting to proper nouns, settings, or plot details."
  ],
  critiquePriorities: [
    "For rewrites prioritize preserving scene intent, plot facts, and point of view while shifting the prose toward the target narrative voice.",
    "For generation prioritize narration distance, scene rhythm, pacing, dialogue behavior, and descriptive density, and whether the result reads like lived prose rather than commentary about style.",
    "Flag flattened narration distance, drifting point of view, topic-noun overfitting, 'more adjectives' mistaken for style, and generic literary pastiche."
  ],
  revisionClosing:
    "Keep the output reading like authored prose with a consistent narration distance and point of view, not styled commentary."
};

const REGISTRY: Record<Exclude<ProfileType, "generic">, ContentKind> = {
  "email-formal": EMAIL_FORMAL,
  "fiction-prose": FICTION_PROSE
};

export function contentKindFor(profileType?: ProfileType): ContentKind {
  if (profileType === "fiction-prose") {
    return FICTION_PROSE;
  }
  return EMAIL_FORMAL;
}

export function isBundleProfileType(value: string): value is keyof typeof REGISTRY {
  return value in REGISTRY;
}
