"""Generation orchestrator – coordinates GPU rental, ComfyUI execution, and post-processing."""

import asyncio
import logging
import tempfile
from datetime import datetime
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings, TierConfig
from app.models.project import Project, Shot
from app.models.job import Job
from app.services.vast_service import vast_service
from app.services.comfyui_client import ComfyUIClient
from app.services.storage_service import storage_service
from app.services.email_service import email_service
from app.models.user import User

STORAGE_DIR = "storage"
import os
import shutil

logger = logging.getLogger(__name__)


class GenerationService:
    """Orchestrates the full video generation pipeline per project."""

    MAX_PARALLEL_INSTANCES = 4

    async def generate_project(self, db: AsyncSession, project_id: int) -> str:
        """Full pipeline: rent GPUs → generate shots → post-process → upload."""
        project = await db.get(Project, project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        tier_cfg = TierConfig.get(project.tier)
        
        # Check if we should use simulation mode (no API key or placeholder)
        is_placeholder_key = not settings.VAST_API_KEY or "change-me" in settings.VAST_API_KEY or "fe500" in settings.VAST_API_KEY
        if is_placeholder_key:
            logger.info(f"VAST_API_KEY not set or placeholder. Entering SIMULATION MODE for project {project_id}")
            return await self._generate_mock_project(db, project_id)

        project.status = "generating"
        await db.flush()

        # Get all shots ordered
        result = await db.execute(
            select(Shot)
            .where(Shot.project_id == project_id)
            .order_by(Shot.order)
        )
        shots = list(result.scalars().all())

        if not shots:
            raise ValueError("Project has no shots")

        # Determine how many parallel instances to rent
        instance_count = min(len(shots), self.MAX_PARALLEL_INSTANCES)

        instances = []
        try:
            # 1. Rent GPU instances
            logger.info(f"Renting {instance_count} GPUs for tier {project.tier}")
            instances = await self._rent_gpus(
                db, project, tier_cfg, instance_count
            )

            # 2. Wait for all instances to be ready
            ready_instances = []
            for inst_id in instances:
                if await vast_service.wait_ready(inst_id, timeout_sec=300):
                    ready_instances.append(inst_id)
                else:
                    logger.warning(f"Instance {inst_id} failed to start, skipping")

            if not ready_instances:
                raise RuntimeError("No GPU instances became ready")

            # 3. Generate shots in parallel across instances
            clips = await self._generate_shots_parallel(
                db, project, shots, ready_instances, tier_cfg
            )

            # 4. Post-process: stitch, interpolate, audio
            project.status = "postprocessing"
            await db.flush()

            final_video = await self._postprocess(clips, tier_cfg)

            # 5. Upload final video
            video_url = await storage_service.upload_video(
                final_video, f"projects/{project_id}/final.mp4"
            )

            project.final_video_url = video_url
            project.status = "completed"
            project.completed_at = datetime.utcnow()
            await db.flush()

            # Notify user
            user = await db.get(User, project.user_id)
            if user:
                asyncio.create_task(email_service.send_generation_complete(user.email, project.title or f"Proyecto {project.id}", project.id))

            return video_url

        except Exception as e:
            logger.error(f"Generation failed for project {project_id}: {e}")
            project.status = "failed"
            await db.flush()
            raise

        finally:
            # Always release GPU instances
            for inst_id in instances:
                try:
                    cost = await vast_service.get_cost(inst_id)
                    project.total_cost_usd += cost
                    await vast_service.destroy_instance(inst_id)
                except Exception as e:
                    logger.error(f"Cleanup error for {inst_id}: {e}")
            await db.flush()

    async def _rent_gpus(
        self,
        db: AsyncSession,
        project: Project,
        tier_cfg: dict,
        count: int,
    ) -> list[str]:
        """Search and rent GPU instances."""
        offers = await vast_service.search_gpus(project.tier, max_results=count * 2)
        if not offers:
            raise RuntimeError(f"No GPU offers available for tier {project.tier}")

        instance_ids = []
        for i, offer in enumerate(offers[:count]):
            # Determine onstart command to install ComfyUI + models
            onstart = self._build_onstart_script(tier_cfg)

            result = await vast_service.rent_instance(
                offer_id=offer["id"],
                docker_image="pytorch/pytorch:2.4.0-cuda12.4-cudnn9-runtime",
                disk_gb=80 if project.tier >= 2 else 40,
                onstart_cmd=onstart,
            )

            inst_id = str(result.get("new_contract", result.get("id", "")))
            instance_ids.append(inst_id)

            # Create job record
            job = Job(
                project_id=project.id,
                job_type="clip_gen",
                vast_instance_id=inst_id,
                gpu_type=offer.get("gpu_name", "unknown"),
                status="renting_gpu",
            )
            db.add(job)

        await db.flush()
        return instance_ids

    def _build_onstart_script(self, tier_cfg: dict) -> str:
        """Build the startup script to install ComfyUI + models on the instance.

        Uses hosts with ComfyUI preinstalled when possible (vast.ai template).
        Installs all required custom nodes for multi-shot video generation:
        - ComfyUI-VideoHelperSuite (sequence management)
        - ComfyUI-Frame-Interpolation (RIFE/FILM smoothing)
        - WanVideoWrapper / HunyuanVideo nodes (Kijai / Comfy-Org)
        - Reactor / InstantID / IP-Adapter (avatar consistency)
        - ControlNet auxiliary preprocessors
        """
        lora_downloads = ""
        if "loras" in tier_cfg:
            for lora in tier_cfg["loras"]:
                lora_downloads += f"""
echo "Downloading LoRA: {lora['name']}"
cd /workspace/ComfyUI/models/loras
wget -q "{lora['url']}" -O "{lora['name']}.safetensors" || true
"""

        return f"""#!/bin/bash
set -e
echo "=== Setting up ComfyUI for AI Video Platform ==="

# If ComfyUI is preinstalled (vast.ai template), use it; otherwise clone
COMFY_DIR="${{COMFY_DIR:-/workspace/ComfyUI}}"
if [ ! -d "$COMFY_DIR" ]; then
    cd /workspace
    git clone https://github.com/comfyanonymous/ComfyUI.git 2>/dev/null || true
    COMFY_DIR="/workspace/ComfyUI"
fi
cd "$COMFY_DIR"
pip install -r requirements.txt 2>/dev/null || true

# ===== CUSTOM NODES (multi-shot video pipeline) =====
cd "$COMFY_DIR/custom_nodes"

# Video sequence management
git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git 2>/dev/null || true

# Frame interpolation (RIFE/FILM for smooth transitions)
git clone https://github.com/Fannovel16/ComfyUI-Frame-Interpolation.git 2>/dev/null || true

# Video generation models
git clone https://github.com/kijai/ComfyUI-WanVideoWrapper.git 2>/dev/null || true
git clone https://github.com/kijai/ComfyUI-HunyuanVideoWrapper.git 2>/dev/null || true
git clone https://github.com/Comfy-Org/ComfyUI_bitsandbytes_NF4.git 2>/dev/null || true

# Avatar consistency (face swap + identity preservation)
git clone https://github.com/Gourieff/comfyui-reactor-node.git 2>/dev/null || true
git clone https://github.com/cubiq/ComfyUI_InstantID.git 2>/dev/null || true
git clone https://github.com/cubiq/ComfyUI_IPAdapter_plus.git 2>/dev/null || true

# ControlNet preprocessors
git clone https://github.com/Fannovel16/comfyui_controlnet_aux.git 2>/dev/null || true

# Manager for additional node management
git clone https://github.com/ltdrdata/ComfyUI-Manager.git 2>/dev/null || true

# Install all node requirements
echo "Installing custom node dependencies..."
for d in */; do
    if [ -f "$d/requirements.txt" ]; then
        pip install -r "$d/requirements.txt" 2>/dev/null || true
    fi
    if [ -f "$d/install.py" ]; then
        python "$d/install.py" 2>/dev/null || true
    fi
done

cd "$COMFY_DIR"

{lora_downloads}

# Start ComfyUI headless
echo "Starting ComfyUI on port 8188..."
python main.py --listen 0.0.0.0 --port 8188 --disable-auto-launch &
echo "ComfyUI started"
"""

    async def _generate_shots_parallel(
        self,
        db: AsyncSession,
        project: Project,
        shots: List[Shot],
        instance_ids: list[str],
        tier_cfg: dict,
    ) -> list[bytes]:
        """Distribute shots across instances and generate in parallel."""
        # Build shot-to-instance mapping (round-robin)
        assignments = {}
        for i, shot in enumerate(shots):
            instance_idx = i % len(instance_ids)
            inst_id = instance_ids[instance_idx]
            if inst_id not in assignments:
                assignments[inst_id] = []
            assignments[inst_id].append(shot)

        # Generate on each instance
        tasks = []
        for inst_id, assigned_shots in assignments.items():
            tasks.append(
                self._generate_on_instance(db, project, assigned_shots, inst_id, tier_cfg)
            )

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Flatten results and handle errors
        clips = []
        for result in results:
            if isinstance(result, Exception):
                logger.error(f"Shot generation failed: {result}")
            elif isinstance(result, list):
                clips.extend(result)

        return clips

    async def _generate_on_instance(
        self,
        db: AsyncSession,
        project: Project,
        shots: List[Shot],
        instance_id: str,
        tier_cfg: dict,
    ) -> list[bytes]:
        """Generate multiple shots on a single instance."""
        ip = await vast_service.get_instance_ip(instance_id)
        if not ip:
            raise RuntimeError(f"Could not get IP for instance {instance_id}")

        comfy = ComfyUIClient(ip)
        clips = []

        for shot in shots:
            shot.status = "generating"
            await db.flush()

            try:
                # Load and configure workflow
                workflow = comfy.load_workflow(tier_cfg["workflow"])
                params = {
                    "prompt": self._build_full_prompt(project, shot),
                    "negative_prompt": self._build_negative_prompt(project, shot),
                    "seed": hash(f"{project.id}-{shot.id}") % (2**32),
                    "lora_strength": tier_cfg.get("lora_strength", 0.8),
                    "avatar_id": project.avatar_id,
                    "controlnet_type": tier_cfg["controlnet"][0].lower(),
                    "fps": tier_cfg["fps"],
                    "frames": int(shot.duration_target_sec * tier_cfg["fps"]),
                }

                if "loras" in tier_cfg:
                    params["lora_name"] = tier_cfg["loras"][0]["name"]

                workflow = comfy.inject_params(workflow, params)

                # Queue and wait
                prompt_id = await comfy.queue_prompt(workflow)
                result = await comfy.wait_for_completion(prompt_id, timeout_sec=600)

                # Download clip
                clip_data = await comfy.download_output(prompt_id)
                if clip_data:
                    clips.append(clip_data)
                    shot.status = "done"
                else:
                    shot.status = "failed"

            except Exception as e:
                logger.error(f"Shot {shot.id} generation failed: {e}")
                shot.status = "failed"

            await db.flush()

        return clips

    def _build_full_prompt(self, project: Project, shot: Shot) -> str:
        """Combine project global context and shot parameters into a rich prompt."""
        parts = []
        
        # 1. Style Preset (Master Style)
        if project.style_preset and project.style_preset != "none":
            parts.append(f"style of {project.style_preset}")

        # 2. Global Prompt (The Subject/Environment context)
        if project.global_prompt:
            parts.append(project.global_prompt)

        # 3. Shot specific prompt
        parts.append(shot.prompt)

        # 4. Camera, Lighting, Mood
        if shot.camera_movement != "static":
            camera_map = {
                "pan_left": "camera panning slowly to the left",
                "pan_right": "camera panning slowly to the right",
                "dolly_in": "slow dolly-in camera movement",
                "dolly_out": "slow dolly-out pulling back",
                "orbit": "slow orbit around the subject",
                "tilt_up": "camera tilting upward",
                "tilt_down": "camera tilting downward",
                "crane": "sweeping crane shot from above",
            }
            parts.append(camera_map.get(shot.camera_movement, ""))

        if shot.lighting != "natural":
            parts.append(f"{shot.lighting} lighting")

        if shot.mood != "neutral":
            parts.append(f"{shot.mood} mood and atmosphere")

        return ", ".join(filter(None, parts))

    def _build_negative_prompt(self, project: Project, shot: Shot) -> str:
        """Merge global and shot-specific negative prompts."""
        base_neg = "deformed, blurry, bad anatomy, low quality, static, ugly"
        parts = [base_neg]
        if project.negative_prompt_global:
            parts.append(project.negative_prompt_global)
        if shot.negative_prompt:
            parts.append(shot.negative_prompt)
        return ", ".join(filter(None, parts))

    async def _postprocess(self, clips: list[bytes], tier_cfg: dict) -> bytes:
        """Post-process clips: stitch, interpolate, audio."""
        # This will be implemented in postprocess_service
        # For now, simple concatenation placeholder
        from app.services.postprocess_service import postprocess_service
        return await postprocess_service.process(clips, tier_cfg)


    async def _generate_mock_project(self, db: AsyncSession, project_id: int) -> str:
        """Simulate the generation flow for testing/previsualization."""
        project = await db.get(Project, project_id)
        if not project: return ""

        # 1. Update project status
        project.status = "generating"
        await db.flush()

        # 2. Get shots
        result = await db.execute(
            select(Shot).where(Shot.project_id == project_id).order_by(Shot.order)
        )
        shots = list(result.scalars().all())

        # 3. Simulate shot generation (fast for testing)
        for i, shot in enumerate(shots):
            shot.status = "generating"
            await db.flush()
            await asyncio.sleep(0.5) # Simulación rápida
            shot.status = "done"
            await db.flush()

        # 4. Simulate post-processing
        project.status = "postprocessing"
        await db.flush()
        await asyncio.sleep(1)

        # 5. Create mock final video
        project_dir = os.path.join(STORAGE_DIR, "projects", str(project_id))
        os.makedirs(project_dir, exist_ok=True)
        final_video_path = os.path.join(project_dir, "final.mp4")
        
        if os.path.exists(final_video_path):
            try: os.remove(final_video_path)
            except: pass

        try:
            # Absolute ffmpeg path from audit
            ffmpeg_path = r"C:\ProgramData\chocolatey\bin\ffmpeg.EXE"
            if not os.path.exists(ffmpeg_path): ffmpeg_path = "ffmpeg"

            # Create a more interesting test pattern (checkerboard with clock)
            cmd = [
                ffmpeg_path, "-y",
                "-f", "lavfi", "-i", "testsrc=duration=5:size=1280x720:rate=30",
                "-vf", "drawtext=text='SIMULATION - Project %s':fontcolor=white:fontsize=48:x=(w-text_w)/2:y=(h-text_h)/2" % project_id,
                "-c:v", "libx264", "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                final_video_path
            ]
            proc = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            await proc.communicate()
            
            if proc.returncode != 0:
                logger.error("FFMPEG failed, creating empty file as fallback")
                with open(final_video_path, "wb") as f: f.write(b"MOCK_FALLBACK")
        except Exception as e:
            logger.error(f"Failed to run ffmpeg simulation: {e}")
            with open(final_video_path, "wb") as f: f.write(b"MOCK_ERROR")

        # 6. Update completion
        video_url = f"/storage/projects/{project_id}/final.mp4"
        project.final_video_url = video_url
        project.status = "completed"
        project.completed_at = datetime.utcnow()
        await db.flush()
        
        # Notify user (Simulation)
        user = await db.get(User, project.user_id)
        if user:
            asyncio.create_task(email_service.send_generation_complete(user.email, (project.title or f"Proyecto {project.id}") + " (Simulación)", project.id))

        logger.info(f"SIMULATION COMPLETE for project {project_id}. Video at {video_url}")
        return video_url


generation_service = GenerationService()
