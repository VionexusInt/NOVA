import io
import subprocess
import sys
import tempfile
import os
import traceback
from pathlib import Path
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

MODELS_DIR = Path(__file__).parent / "voces"
MODELS_DIR.mkdir(exist_ok=True)

VOCES = {
    "sharvard": {
        "nombre": "es_ES-sharvard-medium",
        "url": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/sharvard/medium",
        "lang": "es",
        "desc": "Espanol de Espana, masculina, clara y profesional",
    },
    "davefx": {
        "nombre": "es_ES-davefx-medium",
        "url": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/davefx/medium",
        "lang": "es",
        "desc": "Espanol de Espana, masculina, neutra",
    },
    "carlfm": {
        "nombre": "es_ES-carlfm-high",
        "url": "https://huggingface.co/friyin/vits-piper-es_ES-carlfm-high/resolve/main",
        "lang": "es",
        "desc": "Espanol de Espana, grave y lenta",
    },
}

# ============================================================
# CONFIGURACION DEFINITIVA - VOZ MASCULINA PROFESIONAL
# ============================================================

# "sharvard" = es_ES-sharvard-medium
#   Voz masculina espanola, clara, profesional
#   NO es femenina, NO es mexicana, NO es grave/lenta
#
# "davefx" = alternativa si sharvard no convence
# "carlfm" = solo si quieres voz de narrador documental

VOZ_ACTIVA = "sharvard"

# PARAMETROS ULTRA-AFINADOS (no robotico, no imperativo):
# length_scale: 0.88 = ritmo rapido-profesional pero natural
# noise_scale: 0.48 = expresivo y humano (0.3=robot, 0.6=dramatico)
# noise_w: 0.45 = cadencia natural con variacion sutil
# sentence_silence: 0.18 = pausas suaves entre frases
LENGTH_SCALE = 0.88
NOISE_SCALE = 0.48
NOISE_W = 0.45
SENTENCE_SILENCE = 0.18

# POST-PROCESO: "sutil" o "ninguno"
#   "sutil" = compresion ligera + normalizacion + eco de sala muy leve
#   "ninguno" = solo normalizacion de volumen (maxima naturalidad)
MODO_POSTPROCESO = "sutil"

# ============================================================
# FILTROS FFmpeg
# ============================================================

# Sutil: compresion ligera, normalizacion, y un eco de sala muy leve
# para dar profundidad sin sonar metalico
FFMPEG_SUTIL = (
    "acompressor=threshold=-20dB:ratio=2.5:attack=6:release=80,"
    "aecho=0.25:0.2:35:0.05,"
    "equalizer=f=350:t=q:w=1:g=1.2,"
    "equalizer=f=2000:t=q:w=1.2:g=1.5,"
    "loudnorm=I=-16:TP=-1.5:LRA=10"
)

# Ninguno: solo compresion y normalizacion, sin efectos
FFMPEG_NINGUNO = (
    "acompressor=threshold=-18dB:ratio=2:attack=8:release=100,"
    "loudnorm=I=-16:TP=-1.5:LRA=12"
)

FFMPEG_FILTRO = FFMPEG_SUTIL if MODO_POSTPROCESO == "sutil" else FFMPEG_NINGUNO

POST_PROCESADO_ACTIVO = True

_ffmpeg_disponible = None


def comprobar_ffmpeg():
    global _ffmpeg_disponible
    if _ffmpeg_disponible is not None:
        return _ffmpeg_disponible
    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True, check=True, timeout=5
        )
        _ffmpeg_disponible = True
        print("FFmpeg detectado.")
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        _ffmpeg_disponible = False
        print("FFmpeg no encontrado. Audio sin post-procesar.")
    return _ffmpeg_disponible


def descargar_modelo_si_falta(clave):
    import urllib.request
    info = VOCES[clave]
    onnx_path = MODELS_DIR / f"{info['nombre']}.onnx"
    json_path = MODELS_DIR / f"{info['nombre']}.onnx.json"
    if onnx_path.exists() and json_path.exists():
        return onnx_path, json_path
    print(f"Descargando modelo {info['nombre']}...")
    print(f"  {info['desc']}")
    urllib.request.urlretrieve(f"{info['url']}/{info['nombre']}.onnx", onnx_path)
    urllib.request.urlretrieve(f"{info['url']}/{info['nombre']}.onnx.json", json_path)
    print("  Listo.")
    return onnx_path, json_path


def postprocesar_audio(wav_path):
    if not comprobar_ffmpeg():
        return wav_path
    path_out = wav_path.replace('.wav', '_out.wav')
    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", wav_path,
                "-af", FFMPEG_FILTRO,
                path_out
            ],
            capture_output=True, check=True, timeout=15
        )
        return path_out
    except Exception as e:
        print(f"Error post-procesamiento: {e}")
        return wav_path


def sintetizar_wav(texto):
    onnx_path, json_path = descargar_modelo_si_falta(VOZ_ACTIVA)
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as f_in:
        f_in.write(texto)
        txt_path = f_in.name
    
    wav_path = txt_path.replace('.txt', '.wav')
    
    try:
        cmd = [
            sys.executable, "-m", "piper",
            "--model", str(onnx_path),
            "--config", str(json_path),
            "--input-file", txt_path,
            "--output-file", wav_path,
            "--length-scale", str(LENGTH_SCALE),
            "--noise-scale", str(NOISE_SCALE),
            "--noise-w-scale", str(NOISE_W),
            "--sentence-silence", str(SENTENCE_SILENCE),
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode != 0:
            raise RuntimeError(f"Piper error: {result.stderr}")
        
        if POST_PROCESADO_ACTIVO:
            wav_path = postprocesar_audio(wav_path)
        
        with open(wav_path, 'rb') as f:
            audio_bytes = f.read()
        
        return io.BytesIO(audio_bytes)
        
    finally:
        for p in (txt_path, wav_path, wav_path.replace('.wav', '_out.wav')):
            try:
                if os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass


@app.route('/tts', methods=['POST'])
def tts():
    data = request.get_json() or {}
    texto = data.get('text', '').strip()
    if not texto:
        return jsonify({'error': 'Falta el texto'}), 400
    try:
        buffer = sintetizar_wav(texto)
        return send_file(buffer, mimetype='audio/wav')
    except Exception as e:
        print(f"Error TTS: {e}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/ping', methods=['GET'])
def ping():
    return jsonify({
        'ok': True,
        'voz': VOCES[VOZ_ACTIVA]['nombre'],
        'postprocesado': POST_PROCESADO_ACTIVO and comprobar_ffmpeg()
    })


@app.route('/voces', methods=['GET'])
def listar_voces():
    return jsonify({
        'voz_activa': VOZ_ACTIVA,
        'disponibles': {k: v['desc'] for k, v in VOCES.items()}
    })


if __name__ == '__main__':
    print("=" * 60)
    print("NOVA - Servidor de voz (Piper TTS)")
    print(f"Voz: {VOCES[VOZ_ACTIVA]['nombre']}")
    print(f"  -> {VOCES[VOZ_ACTIVA]['desc']}")
    print(f"Velocidad: {LENGTH_SCALE} | Expresion: {NOISE_SCALE} | Cadencia: {NOISE_W}")
    print(f"Pausas: {SENTENCE_SILENCE}s | Post-proceso: {MODO_POSTPROCESO}")
    comprobar_ffmpeg()
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=False)