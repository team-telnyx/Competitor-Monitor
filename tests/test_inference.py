import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

TOOLS_DIR = Path(__file__).resolve().parents[1] / "tools"
sys.path.insert(0, str(TOOLS_DIR))

import inference  # noqa: E402
import competitor_monitor  # noqa: E402


class InferenceLayerTests(unittest.TestCase):
    def test_parse_json_response_accepts_markdown_fence(self):
        content = '```json\n[{"index": 0, "relevant": true, "category": "TTS", "summary": "x"}]\n```'

        parsed = inference.parse_json_response(content)

        self.assertEqual(parsed[0]["category"], "TTS")
        self.assertTrue(parsed[0]["relevant"])

    def test_get_inference_client_returns_none_without_openai_key(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertIsNone(inference.get_inference_client())

    def test_pipeline_loads_local_env_file_without_overriding_process_env(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_root = Path(tmpdir)
            local_dir = repo_root / "local"
            local_dir.mkdir()
            (local_dir / ".env").write_text(
                "OPENAI_API_KEY=local-test-key\nOPENAI_MODEL=local-test-model\n"
            )

            with patch.dict(os.environ, {"OPENAI_MODEL": "process-model"}, clear=True):
                competitor_monitor.load_environment(repo_root, include_cwd=False)

                self.assertEqual(os.environ["OPENAI_API_KEY"], "local-test-key")
                self.assertEqual(os.environ["OPENAI_MODEL"], "process-model")

    def test_classify_pages_falls_back_without_openai_key(self):
        pages = [
            {
                "url": "https://example.com/new-voice-ai",
                "scraped": {"description": "New voice AI release"},
            }
        ]

        with patch.dict(os.environ, {}, clear=True):
            classified = competitor_monitor.classify_pages(pages, "Example")

        self.assertEqual(classified[0]["classification"]["category"], "unclassified")
        self.assertTrue(classified[0]["classification"]["relevant"])

    def test_require_inference_fails_without_openai_key(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError):
                competitor_monitor.run_monitor(
                    competitors=[],
                    classify=True,
                    slack=False,
                    require_inference=True,
                )

    def test_select_competitors_by_name(self):
        selected = competitor_monitor.select_competitors(
            competitor_monitor.COMPETITORS,
            ["elevenlabs"],
        )

        self.assertEqual([c["name"] for c in selected], ["ElevenLabs"])

    def test_openai_client_parses_classification_response(self):
        class FakeResponse:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "choices": [
                        {
                            "message": {
                                "content": '[{"index": 0, "relevant": true, "category": "Inference", "summary": "New model serving update."}]'
                            }
                        }
                    ]
                }

        with patch("inference.requests.post", return_value=FakeResponse()) as post:
            client = inference.OpenAIInferenceClient(api_key="test-key", model="test-model")
            result = client.classify_pages(
                competitor_name="Example",
                focus_areas=["Inference"],
                page_entries=[{"index": 0, "url": "https://example.com", "title": "Example"}],
            )

        self.assertEqual(result[0]["category"], "Inference")
        request = post.call_args.kwargs
        self.assertEqual(request["json"]["model"], "test-model")
        self.assertEqual(request["headers"]["Authorization"], "Bearer test-key")


if __name__ == "__main__":
    unittest.main()
