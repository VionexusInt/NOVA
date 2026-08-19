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
        print("FFmpeg detectado, post-procesamiento activo.")
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        _ffmpeg_disponible = False
        print("FFmpeg no encontrado. El audio sonara sin post-procesar.")
        print("Instalalo desde https://ffmpeg.org/download.html para el efecto completo.")
    return _ffmpeg_disponible


def descargar_modelo_si_falta(clave):
    import urllib.request
    info = VOCES[clave]
    onnx_path = MODELS_DIR / f"{info['nombre']}.onnx"
    json_path = MODELS_DIR / f"{info['nombre']}.onnx.json"
    if onnx_path.exists() and json_path.exists():
        return onnx_path, json_path
    print(f"Descargando modelo de voz {info['nombre']} (solo la primera vez)...")
    urllib.request.urlretrieve(f"{info['url']}/{info['nombre']}.onnx", onnx_path)
    urllib.request.urlretrieve(f"{info['url']}/{info['nombre']}.onnx.json", json_path)
    print("Modelo descargado.")
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
        print(f"Error en post-procesamiento, usando audio sin filtrar: {e}")
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
            "--input", txt_path,
            "--output_file", wav_path,
            "--length_scale", str(LENGTH_SCALE),
            "--noise_scale", str(NOISE_SCALE),
            "--noise_w", str(NOISE_W),
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
    return jsonify({'voz_activa': VOZ_ACTIVA, 'disponibles': list(VOCES.keys())})


if __name__ == '__main__':
    print("=" * 55)
    print("NOVA - Servidor de voz (Piper TTS, modo JARVIS)")
    print(f"Voz activa: {VOCES[VOZ_ACTIVA]['nombre']}")
    print(f"Cadencia: pausada y grave (length_scale={LENGTH_SCALE})")
    comprobar_ffmpeg()
    print("100% local - sin GPU - sin coste - sin limite")
    print("=" * 55)
    app.run(host='0.0.0.0', port=5000, debug=False)