"""
Modal app for avatar/image generation using FLUX.1-schnell.
Deploy with: modal deploy modal_app.py
"""

import modal
import io
import base64
import logging

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = modal.App("erosframe-avatar-generator")

HF_TOKEN = "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"

def download_model():
    import os
    from huggingface_hub import snapshot_download, login
    token = os.environ.get("HF_TOKEN")
    if token:
        login(token=token)
    print("Pre-downloading FLUX.1-schnell model weights into the Modal image...")
    snapshot_download("black-forest-labs/FLUX.1-schnell")
    print("Download complete.")

# Build image with all needed deps
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "diffusers>=0.30.0",
        "transformers>=4.40.0",
        "accelerate>=0.30.0",
        "sentencepiece",
        "torch>=2.4.0",
        "torchvision",
        "Pillow>=10.0.0",
        "huggingface_hub",
        "fastapi[standard]",
        "bitsandbytes",
        "optimum"
    )
    .run_function(download_model, secrets=[modal.Secret.from_dict({"HF_TOKEN": HF_TOKEN})])
)

app.image = image

# Keep model warm between calls (reduces cold-start cost)
with image.imports():
    import torch
    from diffusers import FluxPipeline
    from PIL import Image
    from huggingface_hub import login


@app.cls(
    gpu="L4",           # 24GB VRAM
    timeout=1200,       # 20 min max
    memory=32768,       # 32GB System RAM
    scaledown_window=120,
    secrets=[modal.Secret.from_dict({"HF_TOKEN": HF_TOKEN})]
)
class AvatarGenerator:
    @modal.enter()
    def load_model(self):
        import os
        from diffusers import FluxPipeline
        import torch
        from huggingface_hub import login
        
        logger.info("Starting load_model...")
        token = os.environ.get("HF_TOKEN")
        if token:
            logger.info("Logging into Hugging Face...")
            login(token=token)
            
        logger.info("Downloading/Loading FLUX.1-dev model with 4-bit quantization and CPU offload...")
        
        try:
            # We use FLUX.1-schnell which is faster and lighter
            self.pipe = FluxPipeline.from_pretrained(
                "black-forest-labs/FLUX.1-schnell",
                torch_dtype=torch.bfloat16,
            )
            logger.info("Enabling sequential CPU offload...")
            self.pipe.enable_sequential_cpu_offload()
            logger.info("Model loaded and configured successfully.")
        except Exception as e:
            logger.error(f"Error loading model: {str(e)}")
            raise

    @modal.method()
    def generate(self, prompt: str, width: int = 768, height: int = 1024, steps: int = 4, init_image_b64: str = None, strength: float = 0.55) -> str:
        """Generate an image and return it as base64 PNG string."""
        import base64
        import io
        from PIL import Image
        from diffusers import FluxImg2ImgPipeline
        
        logger.info(f"Generating image (FLUX-schnell) for prompt: {prompt[:50]}...")
        try:
            if init_image_b64:
                logger.info(f"Using img2img with strength {strength}")
                init_image = Image.open(io.BytesIO(base64.b64decode(init_image_b64))).convert("RGB")
                
                # Resize if necessary, though ideally it should match the requested width/height
                if init_image.size != (width, height):
                    init_image = init_image.resize((width, height), Image.LANCZOS)
                
                # Create img2img pipeline reusing components from txt2img pipe to save memory
                pipe_i2i = FluxImg2ImgPipeline(**self.pipe.components)
                
                image = pipe_i2i(
                    prompt=prompt,
                    image=init_image,
                    strength=strength,
                    num_inference_steps=steps,
                    guidance_scale=0.0, # Schnell doesn't use guidance
                ).images[0]
            else:
                logger.info("Using standard txt2img")
                image = self.pipe(
                    prompt=prompt,
                    width=width,
                    height=height,
                    num_inference_steps=steps,
                    guidance_scale=0.0, # Schnell doesn't use guidance
                ).images[0]

            logger.info("Encoding image to base64...")
            buf = io.BytesIO()
            image.save(buf, format="PNG")
            buf.seek(0)
            return base64.b64encode(buf.read()).decode("utf-8")
        except Exception as e:
            logger.error(f"Error during generation: {str(e)}")
            raise


@app.function(timeout=600)
@modal.fastapi_endpoint(method="POST", label="avatar-generate")
def generate_endpoint(item: dict) -> dict:
    """
    HTTP endpoint: POST {"prompt": "...", "width": 768, "height": 1024, "steps": 4, "init_image_b64": "...", "strength": 0.55}
    Returns: {"image_b64": "...", "format": "png"}
    """
    logger.info("Received request at generate_endpoint")
    generator = AvatarGenerator()
    prompt = item.get("prompt", "a beautiful person, photorealistic, 8k")
    width = int(item.get("width", 768))
    height = int(item.get("height", 1024))
    steps = int(item.get("steps", 4))
    init_image_b64 = item.get("init_image_b64")
    strength = float(item.get("strength", 0.55))

    logger.info(f"Calling generator.generate.remote with prompt: {prompt[:50]}")
    try:
        b64 = generator.generate.remote(prompt, width, height, steps, init_image_b64, strength)
        logger.info("Generation complete, returning response.")
        return {"image_b64": b64, "format": "png"}
    except Exception as e:
        logger.error(f"Endpoint error: {str(e)}")
        # FastAPI endpoints must raise HTTPException or return a valid response dict
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))
