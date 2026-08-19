import io
import subprocess
import sys
import tempfile
import os
import re
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
        "lang": "es",
        "desc": "Espanol alta calidad, masculina profesional",
    },
    "sharvard": {
        "nombre": "es_ES-sharvard-medium",
        "url": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/sharvard/medium",
        "lang": "es",
        "desc": "Espanol masculina clara",
    },
    "davefx": {
        "nombre": "es_ES-davefx-medium",
        "url": "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/es/es_ES/davefx/medium",
        "lang": "es",
        "desc": "Espanol masculina neutra",
    },
}

# ============================================================
# CONFIGURACION JARVIS - Replica exacta del audio de muestra
# ============================================================
# Analisis del audio de muestra:
# - Pitch: ~147 Hz (voz muy grave)
# - Formantes: F1=215Hz, F2=334Hz, F3=452Hz (muy bajos)
# - Energia: 91.6% por debajo de 500 Hz (muy grave)
# - Eco metalico visible
# - Compresion fuerte

VOZ_ACTIVA = "carlfm"

# Sintesis: parametros para voz grave y lenta
LENGTH_SCALE = 0.95
NOISE_SCALE = 0.5
NOISE_W = 0.45
SENTENCE_SILENCE = 0.2

# PITCH SHIFTING: bajar la voz para que suene mas grave
# Factor 0.72 = baja el pitch un 28% (de ~200Hz a ~144Hz)
# Ajusta esto si quieres mas o menos grave:
#   0.65 = muy grave (tipo Darth Vader)
#   0.72 = grave (tipo JARVIS) <-- RECOMENDADO
#   0.80 = grave moderado
#   1.0 = sin cambio
PITCH_FACTOR = 0.72

# ============================================================
# POST-PROCESAMIENTO: Replica exacta del perfil de frecuencias
# ============================================================
# Orden de operaciones CRITICO:
# 1. asetrate = cambia el pitch (baja la voz)
# 2. atempo = compensa la velocidad para que no suene lenta
# 3. highpass = elimina sub-graves
# 4. lowpass = corta agudos (el original corta en ~900 Hz)
# 5. equalizer = boost masivo en graves (200-500 Hz)
# 6. aecho = eco metalico
# 7. acompressor = compresion fuerte
# 8. loudnorm = volumen uniforme

FFMPEG_JARVIS = (
    "asetrate=22050*" + str(PITCH_FACTOR) + ","
    "atempo=" + str(1.0/PITCH_FACTOR) + ","
    "highpass=f=60,"
    "lowpass=f=900,"
    "equalizer=f=100:t=q:w=2:g=8,"
    "equalizer=f=200:t=q:w=1.5:g=10,"
    "equalizer=f=300:t=q:w=1:g=8,"
    "equalizer=f=400:t=q:w=1:g=6,"
    "equalizer=f=500:t=q:w=1:g=4,"
    "equalizer=f=700:t=q:w=1:g=-2,"
    "equalizer=f=1000:t=q:w=1:g=-8,"
    "aecho=0.5:0.4:15:0.2,"
    "acompressor=threshold=-20dB:ratio=8:attack=1:release=30,"
    "loudnorm=I=-14:TP=-1:LRA=4"
)

# Alternativa sin efecto JARVIS:
FFMPEG_NATURAL = (
    "acompressor=threshold=-20dB:ratio=2:attack=8:release=100,"
    "loudnorm=I=-15:TP=-1:LRA=13"
)

# Cambia esto: "jarvis" o "natural"
MODO_AUDIO = "jarvis"

FFMPEG_FILTRO = FFMPEG_JARVIS if MODO_AUDIO == "jarvis" else FFMPEG_NATURAL
POST_PROCESADO_ACTIVO = True

_ffmpeg_disponible = None


_EMOJI_PATTERN = re.compile(
    "["
    "\U0001F600-\U0001F64F"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F6FF"
    "\U0001F1E0-\U0001F1FF"
    "\U00002600-\U000026FF"
    "\U00002700-\U000027BF"
    "\U0001F900-\U0001F9FF"
    "\U0001FA00-\U0001FA6F"
    "\U000024C2-\U0001F251"
    "]+",
    flags=re.UNICODE,
)


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
        print("FFmpeg OK.")
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


def preparar_texto_prosodia(texto):
    texto = texto.strip()
    if texto and texto[-1] not in '.!?':
        texto += '.'
    texto = re.sub(r'\s+', ' ', texto)
    texto = re.sub(r'([.,;:!?])([^\s])', r'\1 \2', texto)
    texto = _EMOJI_PATTERN.sub('', texto)
    texto = texto.replace('⚡', '').replace('✅', '').replace('⚠️', '').replace('⚠', '')
    texto = texto.replace('🔍', '').replace('📄', '').replace('⏪', '').replace('❌', '')
    texto = texto.replace('📋', '').replace('🔧', '').replace('🎙️', '')
    texto = ''.join(c for c in texto if c.isprintable() or c in '\n\t')
    return texto.strip()


def postprocesar_audio(wav_path):
    if not POST_PROCESADO_ACTIVO or not comprobar_ffmpeg():
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
        print(f"Error post-proceso: {e}")
        return wav_path


def sintetizar_wav(texto):
    onnx_path, json_path = descargar_modelo_si_falta(VOZ_ACTIVA)
    texto_procesado = preparar_texto_prosodia(texto)
    if not texto_procesado:
        raise ValueError("Texto vacio despues de limpiar")
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8') as f_in:
        f_in.write(texto_procesado)
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
        
        wav_path_final = postprocesar_audio(wav_path)
        
        with open(wav_path_final, 'rb') as f:
            audio_bytes = f.read()
        
        return io.BytesIO(audio_bytes)
        
    finally:
        for p in (txt_path, wav_path):
            try:
                if os.path.exists(p):
                    os.remove(p)
            except Exception:
                pass
        out_path = wav_path.replace('.wav', '_out.wav')
        if os.path.exists(out_path):
            try:
                os.remove(out_path)
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
        'postprocesado': POST_PROCESADO_ACTIVO and comprobar_ffmpeg(),
        'modo_audio': MODO_AUDIO,
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
    print(f"Pitch shift: {PITCH_FACTOR} ({int((1-PITCH_FACTOR)*100)}% mas grave)")
    print(f"Ritmo: {LENGTH_SCALE} | Expresion: {NOISE_SCALE} | Cadencia: {NOISE_W}")
    print(f"Pausas: {SENTENCE_SILENCE}s | Modo: {MODO_AUDIO.upper()}")
    comprobar_ffmpeg()
    print("=" * 60)
    app.run(host='0.0.0.0', port=5000, debug=False)