declare module "premierepro" {
  export interface Action {}

  export interface CompoundAction {
    addAction(action: Action): boolean;
    readonly empty: boolean;
  }

  export interface PointF {
    x: number;
    y: number;
    distanceTo(point: PointF): number;
  }

  export interface Color {
    red: number;
    green: number;
    blue: number;
    alpha: number;
  }

  export interface Keyframe {
    value: { value: string | number | boolean | Color | PointF };
    position: TickTime;
  }

  export interface TickTime {
    equals(tickTime: TickTime): boolean;
    add(tickTime: TickTime): TickTime;
    subtract(tickTime: TickTime): TickTime;
    multiply(factor: number): TickTime;
    divide(divisor: number): TickTime;
    readonly seconds: number;
    readonly ticks: string;
    readonly ticksNumber: number;
  }

  export interface TickTimeStatic {
    createWithSeconds(seconds: number): TickTime;
    createWithTicks(ticks: string): TickTime;
    readonly TIME_ZERO: TickTime;
  }

  export interface RectF {
    width: number;
    height: number;
  }

  export interface ProjectItem {
    getId(): string;
    readonly type: number;
    readonly name: string;
  }

  export interface ClipProjectItem extends ProjectItem {
    getMediaFilePath(): Promise<string>;
  }

  export interface ClipProjectItemStatic {
    cast(projectItem: ProjectItem): ClipProjectItem;
  }

  export interface ComponentParam {
    createKeyframe(inValue: number | string | boolean | PointF | Color): Keyframe;
    getValueAtTime(
      time: TickTime
    ): Promise<number | string | boolean | PointF | Color>;
    createRemoveKeyframeAction(inTime: TickTime, updateUI?: boolean): Action;
    createSetValueAction(inKeyFrame: Keyframe, inSafeForPlayback?: boolean): Action;
    createAddKeyframeAction(inKeyFrame: Keyframe): Action;
    createSetTimeVaryingAction(inTimeVarying: boolean): Action;
    getStartValue(): Promise<Keyframe>;
    getKeyframeListAsTickTimes(): TickTime[];
    isTimeVarying(): boolean;
    createSetInterpolationAtKeyframeAction(
      inTime: TickTime,
      interpolationMode: number,
      updateUI?: boolean
    ): Action;
    areKeyframesSupported(): Promise<boolean>;
    readonly displayName: string;
  }

  export interface Component {
    getParam(paramIndex?: number): ComponentParam;
    getDisplayName(): Promise<string>;
    getParamCount(): number;
  }

  export interface VideoComponentChain {
    getComponentAtIndex(componentIndex: number): Component;
    getComponentCount(): number;
  }

  export interface VideoClipTrackItem {
    getName(): Promise<string>;
    getIsSelected(): Promise<boolean>;
    getStartTime(): Promise<TickTime>;
    getEndTime(): Promise<TickTime>;
    getDuration(): Promise<TickTime>;
    getTrackIndex(): Promise<number>;
    getProjectItem(): Promise<ProjectItem>;
    getComponentChain(): Promise<VideoComponentChain>;
  }

  export interface AudioClipTrackItem {
    getName(): Promise<string>;
  }

  export interface VideoTrack {
    getTrackItems(trackItemType: number, includeEmptyTrackItems: boolean): VideoClipTrackItem[];
    readonly name: string;
    readonly id: number;
  }

  export interface TrackItemSelection {
    getTrackItems(): Promise<(VideoClipTrackItem | AudioClipTrackItem)[]>;
  }

  export interface Sequence {
    getVideoTrackCount(): Promise<number>;
    getVideoTrack(trackIndex: number): Promise<VideoTrack>;
    getFrameSize(): Promise<RectF>;
    getSelection(): Promise<TrackItemSelection>;
    readonly guid: string;
    readonly name: string;
  }

  export interface Project {
    getActiveSequence(): Promise<Sequence>;
    executeTransaction(
      callback: (compoundAction: CompoundAction) => void,
      undoString?: string
    ): boolean;
    lockedAccess(callback: () => void | Promise<void>): void;
    readonly guid: string;
  }

  export interface EventManagerStatic {
    addGlobalEventListener(
      eventName: string | number,
      eventHandler: (event?: object) => void,
      inCapturePhase?: boolean
    ): void;
    removeGlobalEventListener(
      eventName: string | number,
      eventHandler: (event?: object) => void
    ): void;
  }

  export interface ConstantsNamespace {
    TrackItemType: {
      EMPTY: number;
      CLIP: number;
      TRANSITION: number;
      PREVIEW: number;
      FEEDBACK: number;
    };
    InterpolationMode: {
      BEZIER: number;
      HOLD: number;
      LINEAR: number;
      TIME: number;
      TIME_TRANSITION_END: number;
      TIME_TRANSITION_START: number;
    };
    ProjectEvent: {
      OPENED: number;
      CLOSED: number;
      DIRTY: number;
      ACTIVATED: number;
      PROJECT_ITEM_SELECTION_CHANGED: number;
    };
    SequenceEvent: {
      ACTIVATED: number;
      CLOSED: number;
      SELECTION_CHANGED: number;
    };
    MediaType: {
      ANY: number;
      DATA: number;
      VIDEO: number;
      AUDIO: number;
    };
  }

  export interface premierepro {
    Project: {
      getActiveProject(): Promise<Project | undefined>;
    };
    TickTime: TickTimeStatic;
    ClipProjectItem: ClipProjectItemStatic;
    EventManager: EventManagerStatic;
    Constants: ConstantsNamespace;
  }

  const ppro: premierepro;
  export = ppro;
}

interface Window {
  require?: <T = unknown>(id: string) => T;
}
