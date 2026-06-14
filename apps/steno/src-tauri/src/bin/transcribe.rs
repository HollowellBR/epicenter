use std::path::PathBuf;
use std::process::Command;
use transcribe_rs::engines::parakeet::{
    ParakeetEngine, ParakeetInferenceParams, ParakeetModelParams, TimestampGranularity,
};
use transcribe_rs::TranscriptionEngine;

/// 5 minutes of audio at 16kHz
const CHUNK_SAMPLES: usize = 16000 * 60 * 5;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("Usage: transcribe <audio_file> <model_path> [output_file]");
        std::process::exit(1);
    }

    let audio_path = PathBuf::from(&args[1]);
    let model_path = PathBuf::from(&args[2]);
    let output_path = args.get(3).map(PathBuf::from);

    if !audio_path.exists() {
        eprintln!("Error: audio file not found: {}", audio_path.display());
        std::process::exit(1);
    }
    if !model_path.exists() {
        eprintln!("Error: model path not found: {}", model_path.display());
        std::process::exit(1);
    }

    eprintln!("Audio: {}", audio_path.display());
    eprintln!("Model: {}", model_path.display());

    // Step 1: Convert audio to 16kHz mono WAV using FFmpeg
    eprintln!("Converting audio to 16kHz mono WAV...");
    let wav_data = convert_to_wav(&audio_path).expect("Failed to convert audio");
    eprintln!("WAV data: {} bytes", wav_data.len());

    // Step 2: Extract f32 samples from WAV
    eprintln!("Extracting samples...");
    let samples = extract_samples(&wav_data).expect("Failed to extract samples");
    let total_samples = samples.len();
    let duration_secs = total_samples as f64 / 16000.0;
    eprintln!(
        "Samples: {} ({:.1} minutes)",
        total_samples,
        duration_secs / 60.0
    );

    if samples.is_empty() {
        eprintln!("Error: no audio samples found");
        std::process::exit(1);
    }

    // Step 3: Load parakeet model
    eprintln!("Loading Parakeet model (this may take a few seconds)...");
    let mut engine = ParakeetEngine::new();
    engine
        .load_model_with_params(&model_path, ParakeetModelParams::fp32())
        .expect("Failed to load model");
    eprintln!("Model loaded.");

    // Step 4: Transcribe in chunks
    let chunks: Vec<&[f32]> = samples.chunks(CHUNK_SAMPLES).collect();
    let total_chunks = chunks.len();
    eprintln!(
        "Processing {} chunks ({} min each)...",
        total_chunks,
        CHUNK_SAMPLES / 16000 / 60
    );

    let mut full_transcript = String::new();

    for (i, chunk) in chunks.iter().enumerate() {
        let chunk_start = i * CHUNK_SAMPLES;
        let start_min = chunk_start as f64 / 16000.0 / 60.0;
        let end_min = (chunk_start + chunk.len()) as f64 / 16000.0 / 60.0;
        eprintln!(
            "  Chunk {}/{} ({:.1}m - {:.1}m)...",
            i + 1,
            total_chunks,
            start_min,
            end_min
        );

        let params = ParakeetInferenceParams {
            timestamp_granularity: TimestampGranularity::Segment,
            ..Default::default()
        };

        match engine.transcribe_samples(chunk.to_vec(), Some(params)) {
            Ok(result) => {
                let text = result.text.trim();
                if !text.is_empty() {
                    if !full_transcript.is_empty() {
                        full_transcript.push(' ');
                    }
                    full_transcript.push_str(text);
                }
                eprintln!("    -> {} chars", text.len());
            }
            Err(e) => {
                eprintln!("    -> ERROR: {}", e);
            }
        }
    }

    // Step 5: Output
    if let Some(out_path) = &output_path {
        std::fs::write(out_path, &full_transcript).expect("Failed to write output file");
        eprintln!("Transcript written to: {}", out_path.display());
    }

    println!("{}", full_transcript);

    // Cleanup
    engine.unload_model();
}

fn convert_to_wav(audio_path: &PathBuf) -> Result<Vec<u8>, String> {
    let output_file = tempfile::Builder::new()
        .suffix(".wav")
        .tempfile()
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    let output = {
        let mut cmd = Command::new("ffmpeg");
        cmd.args([
            "-i",
            &audio_path.to_string_lossy(),
            "-ar",
            "16000",
            "-ac",
            "1",
            "-c:a",
            "pcm_s16le",
            "-y",
            &output_file.path().to_string_lossy(),
        ]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        cmd.output()
    }
    .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "FFmpeg failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    std::fs::read(output_file.path()).map_err(|e| format!("Failed to read converted WAV: {}", e))
}

fn extract_samples(wav_data: &[u8]) -> Result<Vec<f32>, String> {
    let cursor = std::io::Cursor::new(wav_data);
    let mut reader =
        hound::WavReader::new(cursor).map_err(|e| format!("Failed to parse WAV: {}", e))?;

    let samples: Vec<f32> = reader
        .samples::<i16>()
        .map(|s| s.map(|sample| sample as f32 / 32768.0))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read samples: {}", e))?;

    Ok(samples)
}
