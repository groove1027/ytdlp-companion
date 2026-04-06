import type {
  Action,
  AudioClipTrackItem,
  ClipProjectItem,
  Component,
  ComponentParam,
  CompoundAction,
  Keyframe,
  PointF,
  premierepro,
  Project,
  ProjectItem,
  Sequence,
  TickTime,
  VideoClipTrackItem
} from "premierepro";

function getRuntimeRequire(): (<T = unknown>(id: string) => T) | undefined {
  const runtime = globalThis as typeof globalThis & {
    require?: <T = unknown>(id: string) => T;
  };

  return runtime.require;
}

const runtimeRequire = getRuntimeRequire();

if (!runtimeRequire) {
  throw new Error("Premiere Pro UXP runtime was not detected.");
}

export const ppro = runtimeRequire<premierepro>("premierepro");

export type {
  Action,
  AudioClipTrackItem,
  ClipProjectItem,
  Component,
  ComponentParam,
  CompoundAction,
  Keyframe,
  PointF,
  Project,
  ProjectItem,
  Sequence,
  TickTime,
  VideoClipTrackItem
};
