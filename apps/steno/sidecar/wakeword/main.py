"""
OpenWakeWord sidecar process for wake word detection.

Communicates with the Rust host via JSON lines on stdin/stdout:
  - stdout: {"event": "wake_word", "phrase": "hey jarvis", "confidence": 0.92}
  - stdout: {"event": "status", "status": "running"}
  - stdin:  {"command": "set_threshold", "value": 0.5}
  - stdin:  {"command": "shutdown"}
"""

import json
import sys
import threading
import signal
import numpy as np


SAMPLE_RATE = 16000
CHUNK_SAMPLES = 1280  # 80ms at 16kHz - recommended by openwakeword
CHANNELS = 1

_shutdown = threading.Event()
_threshold = 0.5
_threshold_lock = threading.Lock()


def _emit(obj: dict):
    """Write a JSON line to stdout (consumed by Rust sidecar manager)."""
    try:
        sys.stdout.write(json.dumps(obj) + "\n")
        sys.stdout.flush()
    except (BrokenPipeError, OSError):
        _shutdown.set()


def _stdin_reader():
    """Read JSON commands from stdin. Runs in a background thread."""
    global _threshold
    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                continue

            cmd = msg.get("command")
            if cmd == "shutdown":
                _shutdown.set()
                return
            elif cmd == "set_threshold":
                val = msg.get("value", 0.5)
                with _threshold_lock:
                    _threshold = float(val)
                _emit({"event": "threshold_updated", "value": _threshold})
    except (EOFError, OSError):
        pass
    # stdin closed = parent process gone
    _shutdown.set()


def main():
    global _threshold

    # Handle SIGINT/SIGTERM gracefully
    def _handle_signal(signum, frame):
        _shutdown.set()

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    # Parse CLI args for initial threshold
    if len(sys.argv) > 1:
        try:
            _threshold = float(sys.argv[1])
        except ValueError:
            pass

    # Start stdin reader thread
    stdin_thread = threading.Thread(target=_stdin_reader, daemon=True)
    stdin_thread.start()

    # Import dependencies (report missing clearly)
    try:
        import pyaudio
    except ImportError:
        _emit({"event": "error", "message": "pyaudio not installed. Run: pip install pyaudio"})
        sys.exit(1)

    try:
        from openwakeword.model import Model as OWWModel
    except ImportError:
        _emit({"event": "error", "message": "openwakeword not installed. Run: pip install openwakeword"})
        sys.exit(1)

    FORMAT = pyaudio.paInt16

    # Initialize OpenWakeWord model (downloads default models on first run)
    try:
        oww_model = OWWModel()
    except Exception as e:
        _emit({"event": "error", "message": f"Failed to load OpenWakeWord model: {e}"})
        sys.exit(1)

    # Initialize PyAudio
    pa = pyaudio.PyAudio()
    stream = None
    try:
        stream = pa.open(
            format=FORMAT,
            channels=CHANNELS,
            rate=SAMPLE_RATE,
            input=True,
            frames_per_buffer=CHUNK_SAMPLES,
        )
    except Exception as e:
        _emit({"event": "error", "message": f"Failed to open microphone: {e}"})
        pa.terminate()
        sys.exit(1)

    _emit({"event": "status", "status": "running"})

    try:
        while not _shutdown.is_set():
            try:
                audio_bytes = stream.read(CHUNK_SAMPLES, exception_on_overflow=False)
            except OSError:
                break

            audio_i16 = np.frombuffer(audio_bytes, dtype=np.int16)

            # Run inference
            oww_model.predict(audio_i16)

            # Check each model's score against threshold
            with _threshold_lock:
                current_threshold = _threshold

            for model_name, score in oww_model.prediction_buffer.items():
                # score is a list of recent predictions; check the latest
                if len(score) > 0 and score[-1] >= current_threshold:
                    _emit({
                        "event": "wake_word",
                        "phrase": model_name,
                        "confidence": round(float(score[-1]), 4),
                    })
                    # Reset the buffer for this model to avoid repeated triggers
                    oww_model.prediction_buffer[model_name] = []

    finally:
        if stream:
            stream.stop_stream()
            stream.close()
        pa.terminate()
        _emit({"event": "status", "status": "stopped"})


if __name__ == "__main__":
    main()
