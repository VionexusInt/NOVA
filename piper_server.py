"""
Servidor TTS con Piper para NOVA — voz afinada estilo JARVIS en español.

100% local, CPU, gratis, sin límites.

Instalación (una sola vez):

pip install piper-tts flask flask-cors

Requiere FFmpeg instalado en el sistema para el post-procesamiento de audio:

Windows: descargar de https://ffmpeg.org/download.html y añadir al PATH

(comprueba con: ffmpeg -version en una terminal)

Arranque:

python piper_server.py

La primera vez descarga automáticamente los modelos de voz (~120MB).

"""

import io
import wave
import re
import subprocess
import tempfile
import os
from pathlib import Path
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

MODELS_DIR = Path(__file__).parent / "voces"
MODELS_DIR.mkdir(exist_ok=True)

VOCES = {
    "carlfm": {
        "nombre": "es_ES-carlfm-high",
        "url": "https://huggingface.co/friyin/vits-piper-es_ES-carlfm-high/resolve/main",
    },
    "davefx": {
        "nombre": "es_ES-davefx-medium",
        "url": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/davefx/medium",
    },
}

VOZ_ACTIVA = "carlfm"

LENGTH_SCALE = 1.1
NOISE_SCALE = 0.5
NOISE_W = 0.6

POST_PROCESADO_ACTIVO = True
FFMPEG_FILTRO = (
    "highpass=f=90,"
    "lowpass=f=9000,"
    "acompressor=threshold=-18dB:ratio=3:attack=5:release=80,"
    "aecho=0.6:0.3:20:0.15,"
    "equalizer=f=250:t=q:w=1:g=-2,"
    "equalizer=f=3000:t=q:w=1.5:g=2"
)

_voice = None
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
        print("✅ FFmpeg detectado, post-procesamiento activo.")
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        _ffmpeg_disponible = False
        print("⚠️ FFmpeg no encontrado. El audio sonará sin post-procesar.")
        print(" Instálalo desde https://ffmpeg.org/download.html para el efecto completo.")
    return _ffmpeg_disponible

def descargar_modelo_si_falta(clave):
    import urllib.request
    info = VOCES[clave]
    onnx_path = MODELS_DIR / f"{info['nombre']}.onnx"
    json_path = MODELS_DIR / f"{info['nombre']}.onnx.json"
    if onnx_path.exists() and json_path.exists():
        return onnx_path, json_path
    print(f"📥 Descargando modelo de voz {info['nombre']} (solo la primera vez)...")
    urllib.request.urlretrieve(f"{info['url']}/{info['nombre']}.onnx", onnx_path)
    urllib.request.urlretrieve(f"{info['url']}/{info['nombre']}.onnx.json", json_path)
    print("✅ Modelo descargado.")
    return onnx_path, json_path

def cargar_voz():
    global _voice
    if _voice is not None:
        return _voice
    from piper import PiperVoice
    onnx_path, json_path = descargar_modelo_si_falta(VOZ_ACTIVA)
    print(f"🎙️ Cargando voz {VOCES[VOZ_ACTIVA]['nombre']}...")
    _voice = PiperVoice.load(str(onnx_path), config_path=str(json_path))
    print("✅ Voz cargada y lista.")
    return _voice

def preparar_texto(texto):
    texto = texto.strip()
    texto = re.sub(r'([.,;:!?])(?=[^\s])', r'\1 ', texto)
    return texto

def postprocesar_audio(wav_bytes):
    if not comprobar_ffmpeg():
        return wav_bytes
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f_in:
        f_in.write(wav_bytes)
        path_in = f_in.name
        path_out = path_in.replace('.wav', '_out.wav')
    try:
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", path_in,
                "-af", FFMPEG_FILTRO,
                path_out
            ],
            capture_output=True, check=True, timeout=15
        )
        with open(path_out, 'rb') as f_out:
            resultado = f_out.read()
        return resultado
    except Exception as e:
        print(f"⚠️ Error en post-procesamiento, usando audio sin filtrar: {e}")
        return wav_bytes
    finally:
        for p in (path_in, path_out):
            try:
                if os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass

def sintetizar_wav(texto):
    voice = cargar_voz()
    texto = preparar_texto(texto)
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as wav_file:
        voice.synthesize(
            texto,
            wav_file,
            length_scale=LENGTH_SCALE,
            noise_scale=NOISE_SCALE,
            noise_w=NOISE_W,
        )
    buffer.seek(0)
    wav_bytes = buffer.read()
    if POST_PROCESADO_ACTIVO:
        wav_bytes = postprocesar_audio(wav_bytes)
    return io.BytesIO(wav_bytes)

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
        print(f"❌ Error TTS: {e}")
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
    return jsonify({'voz_activa': VOZ_ACTIVA, 'disponibles': list(VOCES.keys())})

if __name__ == '__main__':
    print("=" * 55)
    print("🎙️ NOVA — Servidor de voz (Piper TTS, modo JARVIS)")
    print(f" Voz activa: {VOCES[VOZ_ACTIVA]['nombre']}")
    print(f" Cadencia: pausada y grave (length_scale={LENGTH_SCALE})")
    comprobar_ffmpeg()
    print(" 100% local · sin GPU · sin coste · sin límite")
    print("=" * 55)
    cargar_voz()
    app.run(host='0.0.0.0', port=5000, debug=False)