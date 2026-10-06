"""Experimental, reproducible Full v2 browser export. No calibration or training data."""
import argparse, hashlib, json, logging, shutil, tempfile, urllib.request, zipfile
from pathlib import Path
import torch, onnx, onnxruntime, tokenizers, transformers
from transformers import AutoModelForTokenClassification
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer, DefaultWeightOnlyQuantConfig
from onnxruntime.quantization.quant_utils import QuantFormat

sdk = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--source", type=Path, default=sdk / "models/masker-full-source")
args = parser.parse_args()
lock = json.loads((sdk / "assets/full-model-source.json").read_text())
versions = {"torch": torch.__version__, "transformers": transformers.__version__, "tokenizers": tokenizers.__version__, "onnx": onnx.__version__, "onnxruntime": onnxruntime.__version__}
expected = {"torch": "2.10.0+cpu", "transformers": "4.57.6", "tokenizers": "0.22.2", "onnx": "1.23.2", "onnxruntime": "1.30.0"}
if versions != expected:
    raise SystemExit("Install scripts/requirements-export.txt in an isolated environment")
def sha(path):
    with path.open("rb") as file: return hashlib.file_digest(file, "sha256").hexdigest()
args.source.mkdir(parents=True, exist_ok=True)
for name, checksum in lock["files"].items():
    file = args.source / name
    if not file.exists() or sha(file) != checksum:
        url = f"https://huggingface.co/{lock['model']}/resolve/{lock['revision']}/{name}"
        temporary = file.with_suffix(file.suffix + ".download")
        urllib.request.urlretrieve(url, temporary)
        if sha(temporary) != checksum:
            temporary.unlink(); raise RuntimeError("Source asset checksum mismatch")
        temporary.replace(file)

torch.set_num_threads(1); torch.set_num_interop_threads(1)
model = AutoModelForTokenClassification.from_pretrained(args.source, local_files_only=True, use_safetensors=True).float().eval()
tokenizer = tokenizers.Tokenizer.from_file(str(args.source / "tokenizer.json"))
ids = torch.tensor([tokenizer.encode("Hello Alex Morgan, your booking is confirmed.").ids], dtype=torch.long)
class Logits(torch.nn.Module):
    def __init__(self, model): super().__init__(); self.model = model
    def forward(self, input_ids, attention_mask): return self.model(input_ids=input_ids, attention_mask=attention_mask).logits
out = sdk / "models/masker-full"
out.mkdir(parents=True, exist_ok=True); (out / "onnx").mkdir(exist_ok=True)
logging.getLogger().setLevel(logging.WARNING)
with tempfile.TemporaryDirectory(prefix="magpii-full-export-") as directory:
    fp32 = Path(directory) / "reference.onnx"
    with torch.inference_mode():
        # Legacy exporter supports DeBERTa's dynamic sequence lengths in this pinned toolchain.
        torch.onnx.export(Logits(model), (ids, torch.ones_like(ids)), str(fp32), input_names=["input_ids", "attention_mask"], output_names=["logits"],
            dynamic_axes={"input_ids": {0: "batch", 1: "sequence"}, "attention_mask": {0: "batch", 1: "sequence"}, "logits": {0: "batch", 1: "sequence"}}, opset_version=20, dynamo=False)
    config = DefaultWeightOnlyQuantConfig(block_size=32, is_symmetric=True, accuracy_level=4, quant_format=QuantFormat.QOperator,
        op_types_to_quantize=("MatMul", "Gather"), quant_axes=(("MatMul", 0), ("Gather", 1)), bits=4)
    quant = MatMulNBitsQuantizer(str(fp32), algo_config=config); quant.process()
    target = out / "onnx/full-int4.onnx"
    for file in (target, target.with_suffix(target.suffix + ".data")):
        if file.exists(): file.unlink()
    quant.model.save_model_to_file(str(target), True)
for name in ["config.json", "tokenizer.json", "tokenizer_config.json", "LICENSE", "NOTICE"]:
    shutil.copyfile(args.source / name, out / name)
files = sorted(p for p in out.rglob("*") if p.is_file())
manifest = {**{key: lock[key] for key in ["model", "revision", "license"]}, "export": "experimental Full v2 INT4; block32 symmetric MatMul+Gather; FP32 computation", "toolchain": versions,
    "recipeSha256": sha(Path(__file__)), "files": {str(p.relative_to(out)): sha(p) for p in files}, "sizes": {str(p.relative_to(out)): p.stat().st_size for p in files}}
(sdk / "assets/full-model-lock.json").write_text(json.dumps(manifest, indent=2) + "\n")
with zipfile.ZipFile(sdk / "full-model-assets.zip", "w", compression=zipfile.ZIP_DEFLATED, compresslevel=1) as archive:
    for file in files: archive.write(file, str(file.relative_to(out)))
print(json.dumps({"output": str(out), "bytes": sum(manifest["sizes"].values()), "toolchain": versions}))
