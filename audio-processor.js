/**
 * AudioWorklet processor for capturing microphone audio
 * and converting to Int16 PCM for Soniox WebSocket streaming.
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._bufferSize = 4096;
    this._buffer = new Float32Array(this._bufferSize);
    this._writeIndex = 0;
  }

  /**
   * Convert Float32 samples (-1 to 1) to Int16 PCM bytes
   */
  float32ToInt16(float32Array) {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array.buffer;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // mono

    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._writeIndex++] = channelData[i];

      if (this._writeIndex >= this._bufferSize) {
        const pcmBuffer = this.float32ToInt16(this._buffer);
        this.port.postMessage(pcmBuffer, [pcmBuffer]);
        this._buffer = new Float32Array(this._bufferSize);
        this._writeIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
