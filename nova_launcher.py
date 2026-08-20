"""
NOVA Launcher — se ejecuta al iniciar Windows.
Muestra una ventana preguntando si quieres arrancar NOVA ahora.
Si dices que sí, lanza el agente Python, el servidor de voz y el frontend.

Instalación (una sola vez):
    Este script se coloca en la carpeta de inicio de Windows para que
    se ejecute automáticamente al encender el PC. Ver instrucciones abajo.

No requiere librerías adicionales — usa tkinter, que viene con Python.
"""

import subprocess
import sys
import os
import time
from pathlib import Path
import tkinter as tk
from tkinter import ttk

NOVA_ROOT = Path(__file__).parent.resolve()

# Comandos para arrancar cada pieza — ajusta si tu proyecto usa otros nombres
COMANDOS = {
    "agente": ["python", str(NOVA_ROOT / "nova_agent.py")],
    "voz": ["python", str(NOVA_ROOT / "piper_server.py")],
    "frontend": ["npm", "run", "dev"],
}


def lanzar_nova():
    """Arranca las tres piezas de NOVA en ventanas de consola separadas."""
    try:
        # Agente Python (control de PC, auto-mejora, notificaciones)
        subprocess.Popen(
            f'start "NOVA — Agente" cmd /k python "{NOVA_ROOT / "nova_agent.py"}"',
            shell=True, cwd=str(NOVA_ROOT)
        )
        time.sleep(1)

        # Servidor de voz Piper
        piper_path = NOVA_ROOT / "piper_server.py"
        if piper_path.exists():
            subprocess.Popen(
                f'start "NOVA — Voz" cmd /k python "{piper_path}"',
                shell=True, cwd=str(NOVA_ROOT)
            )
            time.sleep(1)

        # Frontend Vite
        subprocess.Popen(
            'start "NOVA — Frontend" cmd /k npm run dev',
            shell=True, cwd=str(NOVA_ROOT)
        )
        time.sleep(2)

        # Abrir el navegador en la URL de NOVA
        os.startfile("http://localhost:5173")

    except Exception as e:
        mostrar_error(str(e))


def mostrar_error(msg):
    root = tk.Tk()
    root.withdraw()
    from tkinter import messagebox
    messagebox.showerror("NOVA — Error", f"No se pudo iniciar NOVA:\n{msg}")
    root.destroy()


def mostrar_ventana_confirmacion():
    root = tk.Tk()
    root.title("NOVA")
    root.geometry("380x220")
    root.resizable(False, False)
    root.configure(bg="#01020a")

    # Centrar en pantalla
    root.update_idletasks()
    w, h = 380, 220
    x = (root.winfo_screenwidth() // 2) - (w // 2)
    y = (root.winfo_screenheight() // 2) - (h // 2)
    root.geometry(f"{w}x{h}+{x}+{y}")

    root.attributes("-topmost", True)

    style = ttk.Style()
    style.theme_use("clam")
    style.configure("TButton", font=("Segoe UI", 10), padding=10)
    style.configure(
        "Accept.TButton",
        background="#4a9eff", foreground="#01020a"
    )
    style.configure(
        "Decline.TButton",
        background="#1a1f2e", foreground="#c8d5e8"
    )

    titulo = tk.Label(
        root, text="N O V A",
        font=("Segoe UI", 22, "bold"),
        fg="#4a9eff", bg="#01020a"
    )
    titulo.pack(pady=(28, 4))

    subtitulo = tk.Label(
        root, text="sistema autónomo de inteligencia",
        font=("Segoe UI", 8),
        fg="#5a6b85", bg="#01020a"
    )
    subtitulo.pack(pady=(0, 20))

    pregunta = tk.Label(
        root, text="¿Iniciar NOVA ahora?",
        font=("Segoe UI", 11),
        fg="#e1ebfa", bg="#01020a"
    )
    pregunta.pack(pady=(0, 20))

    frame_botones = tk.Frame(root, bg="#01020a")
    frame_botones.pack()

    resultado = {"iniciar": False}

    def on_si():
        resultado["iniciar"] = True
        root.destroy()

    def on_no():
        resultado["iniciar"] = False
        root.destroy()

    btn_si = tk.Button(
        frame_botones, text="Sí, iniciar",
        font=("Segoe UI", 10, "bold"),
        bg="#4a9eff", fg="#01020a",
        activebackground="#7bbfff", activeforeground="#01020a",
        relief="flat", padx=20, pady=8, cursor="hand2",
        command=on_si
    )
    btn_si.grid(row=0, column=0, padx=8)

    btn_no = tk.Button(
        frame_botones, text="Ahora no",
        font=("Segoe UI", 10),
        bg="#1a1f2e", fg="#c8d5e8",
        activebackground="#2a3550", activeforeground="#c8d5e8",
        relief="flat", padx=20, pady=8, cursor="hand2",
        command=on_no
    )
    btn_no.grid(row=0, column=1, padx=8)

    # Auto-cerrar tras 20s sin respuesta (por defecto: no iniciar)
    root.after(20000, root.destroy)

    root.mainloop()
    return resultado["iniciar"]


if __name__ == "__main__":
    quiere_iniciar = mostrar_ventana_confirmacion()
    if quiere_iniciar:
        lanzar_nova()