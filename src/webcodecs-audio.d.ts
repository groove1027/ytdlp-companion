interface AudioEncoderConfig {
  codec: string;
  sampleRate: number;
  numberOfChannels: number;
  bitrate?: number;
}

interface AudioEncoderSupport {
  supported: boolean;
  config: AudioEncoderConfig;
}

interface AudioEncoderInit {
  output: (chunk: EncodedAudioChunk, metadata?: EncodedAudioChunkMetadata) => void;
  error: (error: Error) => void;
}

type AudioSampleFormat = string;

interface AudioDataInit {
  format: AudioSampleFormat;
  sampleRate: number;
  numberOfFrames: number;
  numberOfChannels: number;
  timestamp: number;
  data: BufferSource;
}

interface EncodedAudioChunkMetadata {
  decoderConfig?: Record<string, unknown>;
}

declare class EncodedAudioChunk {}

declare class AudioData {
  constructor(init: AudioDataInit);
  close(): void;
}

declare class AudioEncoder {
  constructor(init: AudioEncoderInit);
  static isConfigSupported(config: AudioEncoderConfig): Promise<AudioEncoderSupport>;
  configure(config: AudioEncoderConfig): void;
  encode(data: AudioData): void;
  flush(): Promise<void>;
  close(): void;
}
