"""Minimal Python script that downloads open source STT models in FP32 precision
        Zipformer_30M dir: speech/models/zipformer
        Gipformer_65M dir: speech/models/gipformer
    Huggingface:
        Zipformer: https://huggingface.co/hynt/Zipformer-30M-RNNT-6000h
        Gipformer: https://huggingface.co/g-group-ai-lab/gipformer1.5-65M-rnnt
    Run command with arguments, either:
        python utils/download_models.py --models zipformer
        python utils/download_models.py --models gipformer
        python utils/download_models.py --models both
"""

import argparse
from pathlib import Path
from huggingface_hub import snapshot_download

BASE_DIR = Path(__file__).resolve().parent.parent

MODELS = {
    "zipformer": {
        "repo_id": "hynt/Zipformer-30M-RNNT-6000h",
        "local_dir": BASE_DIR / "speech" / "models" / "zipformer",
    },
    "gipformer": {
        "repo_id": "g-group-ai-lab/gipformer1.5-65M-rnnt",
        "local_dir": BASE_DIR / "speech" / "models" / "gipformer",
    },
}


def download_model(name: str):
    info = MODELS[name]
    print(f"Downloading {name} (FP32) from {info['repo_id']} -> {info['local_dir']}...")
    snapshot_download(
        repo_id=info["repo_id"],
        local_dir=str(info["local_dir"]),
        ignore_patterns=["*.int8.onnx"],
    )
    print(f"Successfully downloaded {name} to {info['local_dir']}")


def main():
    parser = argparse.ArgumentParser(description="Download open source STT models in FP32 precision.")
    parser.add_argument(
        "--models",
        choices=["zipformer", "gipformer", "both"],
        required=True,
        help="STT model to download",
    )
    args = parser.parse_args()

    targets = list(MODELS.keys()) if args.models == "both" else [args.models]
    for target in targets:
        download_model(target)


if __name__ == "__main__":
    main()
