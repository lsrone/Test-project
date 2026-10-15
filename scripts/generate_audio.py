"""Compose the original Volna instrumental demo catalog. Requires numpy and ffmpeg.
Audio is generated locally; no external recordings, licenses or API keys are needed.
Run from the repository root: python3 scripts/generate_audio.py
"""
from pathlib import Path
import subprocess
import tempfile
import wave
import numpy as np

RATE = 44100
DURATION = 48
OUT = Path(__file__).resolve().parent.parent / 'public' / 'audio'
OUT.mkdir(parents=True, exist_ok=True)
SPECS = [
    ('blue-hour', 100, 50, .8, 12),
    ('weightless', 72, 48, .12, 23),
    ('neon-dreams', 112, 45, .95, 34),
    ('first-light', 82, 53, .45, 45),
    ('slow-motion', 86, 46, .4, 56),
    ('velvet-sky', 90, 55, .35, 67),
    ('momentum', 120, 48, 1.0, 78),
    ('somewhere', 68, 43, .08, 89),
]

def frequency(note):
    return 440 * 2 ** ((note - 69) / 12)

for name, bpm, root, intensity, seed in SPECS:
    rng = np.random.default_rng(seed)
    signal = np.zeros((RATE * DURATION, 2), dtype=np.float64)
    beat = 60 / bpm

    def mix(start, duration, sound, pan=0.0):
        begin = int(start * RATE)
        count = min(int(duration * RATE), len(signal) - begin)
        if count <= 0:
            return
        t = np.arange(count) / RATE
        values = sound(t)
        signal[begin:begin + count, 0] += values * np.sqrt((1 - pan) / 2)
        signal[begin:begin + count, 1] += values * np.sqrt((1 + pan) / 2)

    progression = [(0, 3, 7, 10), (8, 12, 15, 19), (3, 7, 10, 14), (10, 14, 17, 21)]
    bar = 4 * beat
    for bar_index, start in enumerate(np.arange(0, DURATION, bar)):
        chord = progression[bar_index % 4]
        for voice_index, interval in enumerate(chord):
            f = frequency(root + interval)
            def pad(t, f=f):
                envelope = np.minimum(t / .4, 1) * np.minimum(np.maximum((bar + .8 - t) / 1.0, 0), 1)
                tone = np.sin(2 * np.pi * f * t) + .25 * np.sin(2 * np.pi * f * 2.002 * t) + .12 * np.sin(2 * np.pi * f * .998 * t)
                return .095 * envelope * tone
            mix(start, bar + .8, pad, (voice_index - 1.5) * .35)
        for step in range(8):
            note = root + 12 + chord[[0, 2, 1, 3, 2, 1, 3, 0][(step + seed) % 8]]
            f = frequency(note)
            def bell(t, f=f):
                return .12 * (1 - np.exp(-t * 70)) * np.exp(-t * 3) * (np.sin(2 * np.pi * f * t) + .22 * np.sin(2 * np.pi * f * 2.01 * t))
            when = start + step * beat / 2
            if bar_index > 0 or step % 2 == 0:
                mix(when, 2.1, bell, (-1) ** step * .45)
                mix(when + beat * .75, 2.1, lambda t, f=f: .035 * np.exp(-t * 3) * np.sin(2 * np.pi * f * t), (-1) ** (step + 1) * .65)
        bass_f = frequency(root + chord[0] - 12)
        for beat_index in range(4):
            mix(start + beat_index * beat, beat * .9, lambda t, f=bass_f: .15 * np.sin(2 * np.pi * f * t) * np.minimum(t * 45, 1) * np.exp(-t * 2.2))
            if intensity > .2:
                mix(start + beat_index * beat, .25, lambda t: intensity * .27 * np.sin(2 * np.pi * (48 * t + 9 * (1 - np.exp(-t * 32)))) * np.exp(-t * 20))
                if beat_index % 2:
                    mix(start + beat_index * beat, .13, lambda t: intensity * .06 * rng.normal(size=len(t)) * np.exp(-t * 35), .15)
                mix(start + beat_index * beat + beat / 2, .06, lambda t: intensity * .026 * rng.normal(size=len(t)) * np.exp(-t * 80), -.3)
    fade = np.minimum(np.arange(len(signal)) / (RATE * 1.5), 1)
    fade *= np.minimum(np.arange(len(signal))[::-1] / (RATE * 2.5), 1)
    signal *= fade[:, None]
    signal = np.tanh(signal * 1.25)
    signal *= .87 / max(.87, np.max(np.abs(signal)))
    pcm = (signal * 32767).astype('<i2')
    with tempfile.NamedTemporaryFile(suffix='.wav') as temporary:
        with wave.open(temporary.name, 'wb') as wav:
            wav.setnchannels(2)
            wav.setsampwidth(2)
            wav.setframerate(RATE)
            wav.writeframes(pcm.tobytes())
        subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', temporary.name,
                        '-codec:a', 'libmp3lame', '-b:a', '128k', '-metadata', f'title={name}',
                        '-metadata', 'artist=Volna Originals', str(OUT / f'{name}.mp3')], check=True)
    print(f'Composed {name}: {DURATION}s', flush=True)
