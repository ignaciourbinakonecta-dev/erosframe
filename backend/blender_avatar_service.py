import modal
import base64
import os
import subprocess
import json
import tempfile
from typing import Any

# Definición del contenedor con Blender y dependencias
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("curl", "libxi6", "libxrender1", "libxkbcommon0", "libgl1", "libsm6", "libice6", "libxext6", "libwayland-client0", "libwayland-server0", "unzip")
    .run_commands(
        "curl -L https://download.blender.org/release/Blender4.1/blender-4.1.1-linux-x64.tar.xz -o blender.tar.xz",
        "tar -xf blender.tar.xz",
        "mv blender-4.1.1-linux-x64 /opt/blender",
        "ln -s /opt/blender/blender /usr/local/bin/blender"
    )
    .pip_install("fastapi[standard]", "httpx")
    # Instalación de MPFB2 como addon legado en 4.1
    .run_commands(
        "curl -L https://github.com/makehumancommunity/mpfb2/releases/download/v2.0-b1/mpfb-2.0-b1.zip -o /tmp/mpfb2.zip",
        "mkdir -p /opt/blender/4.1/scripts/addons",
        "unzip /tmp/mpfb2.zip -d /opt/blender/4.1/scripts/addons"
    )
)

app = modal.App("blender-avatar-service")

# Script de Blender que se ejecutará internamente
BLENDER_GENERATOR_SCRIPT = """
import bpy
import sys
import json
import os
import addon_utils

def run():
    # Obtener parámetros de los argumentos de la línea de comandos
    try:
        args = sys.argv[sys.argv.index("--") + 1:]
        params = json.loads(args[0])
    except (ValueError, IndexError):
        params = {}

    print(f"DEBUG: Params recibidos: {params}")

    # Limpiar escena
    bpy.ops.wm.read_factory_settings(use_empty=True)

    try:
        # Refrescar paths de scripts para que Blender vea el nuevo addon
        bpy.utils.refresh_script_paths()
        
        # Listar addons disponibles (depuración)
        print("DEBUG: Listando todos los addons registrados...")
        import addon_utils
        available_modules = [mod.__name__ for mod in addon_utils.modules()]
        print(f"DEBUG: Addons disponibles: {available_modules}")
        
        # Habilitar MPFB2
        addon_name = "mpfb"
        if addon_name not in bpy.context.preferences.addons:
            print(f"DEBUG: Intentando habilitar addon {addon_name}...")
            try:
                bpy.ops.preferences.addon_enable(module=addon_name)
                print(f"DEBUG: Addon {addon_name} habilitado.")
            except Exception as e:
                print(f"ERROR: No se pudo habilitar {addon_name}: {e}")
                # Intentar buscar variaciones si no se encontró
                match = [m for m in available_modules if "mpfb" in m.lower()]
                if match:
                    print(f"DEBUG: Intentando con variaciones encontradas: {match}")
                    bpy.ops.preferences.addon_enable(module=match[0])
                    addon_name = match[0]
            
        # Determinar primitiva basada en género
        gender = params.get("gender", "Mujer")
        primitive = "f_avg" if gender == "Mujer" else "m_avg"
        
        print(f"DEBUG: Creando humano con primitiva {primitive}")
        
        # MPFB2 suele tener sus operadores bajo bpy.ops.mpfb
        if hasattr(bpy.ops, "mpfb"):
            if hasattr(bpy.ops.mpfb, "create_human"):
                op = bpy.ops.mpfb.create_human
                print(f"DEBUG: Encontrado mpfb.create_human. Propiedades: {op.get_rna_type().properties.keys()}")
                
                try:
                    # Intentar con 'primitive'
                    op(primitive=primitive)
                    print("DEBUG: Humano creado con primitive=" + primitive)
                except Exception as e1:
                    print(f"AVISO: Falló con primitive: {e1}. Intentando con 'type'...")
                    try:
                        # Intentar con 'type' (común en algunas versiones)
                        op(type=primitive)
                        print("DEBUG: Humano creado con type=" + primitive)
                    except Exception as e2:
                        print(f"AVISO: Falló con type: {e2}. Intentando sin argumentos...")
                        try:
                            op()
                            print("DEBUG: Humano creado sin argumentos")
                        except Exception as e3:
                            print(f"ERROR: Falló creación de humano: {e3}")
                            raise e3
            else:
                print(f"ERROR: No se encontró create_human. Operadores mpfb disponibles: {[m for m in dir(bpy.ops.mpfb) if not m.startswith('_')]}")
                raise Exception("Operador create_human no encontrado")
        else:
            print("ERROR: Namespace bpy.ops.mpfb no disponible.")
            raise Exception("Extension mpfb no cargada correctamente")
        
    except Exception as e:
        print(f"AVISO: Fallback al mono de Blender por error: {e}")
        bpy.ops.mesh.primitive_monkey_add(size=2)
    
    output_path = "/tmp/output.glb"
    bpy.ops.export_scene.gltf(
        filepath=output_path, 
        export_format='GLB',
        export_apply=True
    )
    print(f"DEBUG: Exportación completada en {output_path}")

if __name__ == "__main__":
    run()
"""

@app.function(image=image, gpu="any", timeout=600)
def generate_avatar_task(params):
    # Crear script temporal
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(BLENDER_GENERATOR_SCRIPT)
        script_path = f.name

    try:
        # Ejecutar Blender
        cmd = [
            "blender",
            "--background",
            "--python", script_path,
            "--",
            json.dumps(params)
        ]
        
        print(f"Ejecutando comando: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        logs = f"--- STDOUT ---\n{result.stdout}\n--- STDERR ---\n{result.stderr}"
        print(logs)
        
        if result.returncode != 0:
            raise Exception(f"Blender falló con código {result.returncode}. Logs:\n{logs}")

        output_path = "/tmp/output.glb"
        if not os.path.exists(output_path):
            raise Exception(f"No se generó el archivo GLB. Logs:\n{logs}")

        with open(output_path, "rb") as f:
            return {
                "glb_base64": base64.b64encode(f.read()).decode('utf-8'),
                "logs": logs
            }
    finally:
        if os.path.exists(script_path):
            os.remove(script_path)

@app.function(image=image)
@modal.fastapi_endpoint(method="POST")
def api_generate(params: Any = None):
    # El frontend envía { "params": { ... } } o directamente los params
    if isinstance(params, dict) and "params" in params:
        actual_params = params["params"]
    else:
        actual_params = params or {}
        
    result = generate_avatar_task.remote(actual_params)
    return result
