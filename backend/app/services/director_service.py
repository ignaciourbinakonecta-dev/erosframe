import httpx
import json
import re

from app.services.langflow_service import langflow_service

class DirectorService:
    def __init__(self):
        # Apuntamos al endpoint de Modal desplegado
        self.ollama_url = "https://ignaciourbinakonecta--reasoning-agent-reasoningagent-reason.modal.run"
        self.model = "llama3"

    async def _call_ollama(self, system_prompt: str, user_prompt: str) -> dict:
        async with httpx.AsyncClient(timeout=120.0) as client:
            try:
                response = await client.post(
                    self.ollama_url,
                    json={
                        "prompt": user_prompt,
                        "system_prompt": system_prompt
                    }
                )
                response.raise_for_status()
                # Modal response structure: {"response": "{...}"}
                content = response.json().get("response", "{}")
                
                # Clean possible markdown formatting
                content = re.sub(r"```json\s*", "", content)
                content = re.sub(r"```\s*", "", content)
                
                return json.loads(content)
            except Exception as e:
                print(f"[DirectorService] Ollama Error: {e}")
                # Fallback to empty shots if LLM fails
                return {"shots": []}

    async def plan_video(self, idea: str, target_duration_sec: int, style: str) -> dict:
        """Plan a video using the Langflow Cloud Brain."""
        try:
            # We attempt to use Langflow first (Cloud Director Brain)
            result = await langflow_service.plan_video(
                idea=idea,
                duration_minutes=max(1, target_duration_sec // 60),
                style=style
            )
            
            if result.get("plan"):
                plan = result["plan"]
                return plan
            
            # Fallback to local Ollama
            print("[DirectorService] Langflow plan failed or empty, falling back to local Ollama...")
        except Exception as e:
            print(f"[DirectorService] Langflow error: {e}. Falling back...")
            
        system_prompt = f"""
You are an expert AI Video Director. Create a sequence of video shots based on the user's idea.
Target total duration: {target_duration_sec} seconds.
Style: {style}

We use an "Image-First" workflow. Generate up to 16 sequential shots to tell the story.
Respond in STRICT JSON with this schema:
{{
  "shots": [
    {{
      "order": 1,
      "image_prompt": "<highly detailed english prompt for generating the static keyframe image. describe subject, lighting, composition, setting.>",
      "motion_prompt": "<english prompt for the image-to-video model describing HOW the image moves. e.g. 'camera pans right, subject turns head'>",
      "camera_movement": "<STRICTLY one of: static, pan_left, pan_right, dolly_in, dolly_out, orbit, tilt_up, tilt_down, crane>",
      "lighting": "<STRICTLY one of: natural, warm_golden, cold_blue, dramatic_shadows, neon, candlelight, sunset, studio>",
      "mood": "<STRICTLY one of: neutral, intense, romantic, dramatic, mysterious, playful, seductive, melancholic>",
      "dialogue": "<optional characters dialogue in spanish>",
      "duration_target_sec": <number between 5.0 and 15.0>
    }}
  ]
}}
IMPORTANT: 
- `image_prompt` and `motion_prompt` MUST be strictly in English.
- `camera_movement`, `lighting`, and `mood` MUST use the exact words from the lists above.
- The total sum of `duration_target_sec` should be roughly {target_duration_sec} seconds. Generate enough shots (up to 16) to reach the target duration.
        """
        user_prompt = f"Plan a highly detailed cinematic video for this idea: {idea}"
        return await self._call_ollama(system_prompt, user_prompt)
        
    async def refine_shot(self, shot: dict, feedback: str) -> dict:
        system_prompt = """
You are an expert AI Video Director. Refine the given shot based on user feedback.
Return ONLY the updated shot object in STRICT JSON.
Do not wrap it in any list or extra keys.
        """
        user_prompt = f"Original shot:\n{json.dumps(shot, indent=2)}\n\nUser Feedback: {feedback}\n\nRefine the shot."
        return await self._call_ollama(system_prompt, user_prompt)
    async def refine_sequence(self, shots: list, feedback: str) -> dict:
        system_prompt = """
You are an expert AI Video Director. You are given an array of existing video shots and user feedback.
Your task is to MODIFY the sequence based on the feedback. You can ADD new shots, REMOVE existing shots, or EDIT current shots.
Return the ENTIRE updated sequence in STRICT JSON matching this schema exactly:
{
  "shots": [
    {
      "order": 1,
      "image_prompt": "<highly detailed english prompt for generating the static keyframe image. describe subject, lighting, composition, setting.>",
      "motion_prompt": "<english prompt for the image-to-video model describing HOW the image moves. e.g. 'camera pans right, subject turns head'>",
      "camera_movement": "<STRICTLY one of: static, pan_left, pan_right, dolly_in, dolly_out, orbit, tilt_up, tilt_down, crane>",
      "lighting": "<STRICTLY one of: natural, warm_golden, cold_blue, dramatic_shadows, neon, candlelight, sunset, studio>",
      "mood": "<STRICTLY one of: neutral, intense, romantic, dramatic, mysterious, playful, seductive, melancholic>",
      "dialogue": "<optional characters dialogue in spanish>",
      "negative_prompt": "<optional negative prompt>",
      "duration_target_sec": <number between 5.0 and 15.0>
    }
  ]
}
IMPORTANT: Return ONLY the JSON object. Do not wrap it in any markdown or extra text.
        """
        user_prompt = f"Current Sequence of shots:\n{json.dumps(shots, indent=2)}\n\nUser Feedback: {feedback}\n\nReturn the updated JSON sequence."
        return await self._call_ollama(system_prompt, user_prompt)

director_service = DirectorService()
