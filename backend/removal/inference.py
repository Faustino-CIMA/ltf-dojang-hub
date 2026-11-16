"""Portrait cutout on this server. The photo bytes are not written to disk or logs."""

from __future__ import annotations

import io
import logging

from PIL import Image

logger = logging.getLogger("removal")

WEIGHTS_NAME = "model.safetensors"
# Full BiRefNet matting weights (MIT). Not the lite model.
WEIGHTS_SHA256 = "a9875de5b1e6c8eb5fdaa8c727a82927ce442cdc87ba3abee6a77e6fa46c25bb"
WEIGHTS_BYTES = 884878856
INPUT_SIDE = 1024


class RemovalUnavailable(Exception):
    """The cutout model cannot run. The phone should use its own model."""


def cutout_png(image_bytes: bytes) -> bytes:
    """Return a PNG of the original colours with the model's alpha. Nothing is saved."""
    if not image_bytes:
        raise RemovalUnavailable("empty image")
    try:
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        raise RemovalUnavailable("unreadable image") from exc
    alpha = _alpha(image)
    image.putalpha(alpha)
    output = io.BytesIO()
    image.save(output, format="PNG")
    logger.info(
        "removal.cutout bytes_in=%s bytes_out=%s width=%s height=%s",
        len(image_bytes),
        output.tell(),
        image.width,
        image.height,
    )
    return output.getvalue()


def _alpha(image: Image.Image) -> Image.Image:
    import torch
    from torchvision.transforms.functional import normalize, resize, to_pil_image, to_tensor

    model = _model()
    resized = resize(image, [INPUT_SIDE, INPUT_SIDE])
    tensor = to_tensor(resized).unsqueeze(0)
    tensor = normalize(tensor, [0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    with torch.no_grad():
        prediction = model(tensor)[-1].sigmoid()
    mask = prediction[0].squeeze(0).clamp(0, 1)
    grey = to_pil_image(mask)
    return grey.resize(image.size, Image.Resampling.BILINEAR)


_loaded = None


def _model():
    global _loaded
    if _loaded is not None:
        return _loaded
    import os

    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
    from django.conf import settings

    folder = getattr(settings, "BIREFNET_DIR", "")
    weights = os.path.join(folder, WEIGHTS_NAME) if folder else ""
    if not folder or not os.path.isfile(weights):
        raise RemovalUnavailable("weights missing")
    from removal.vendor.birefnet_matting.birefnet import BiRefNet

    model = BiRefNet.from_pretrained(folder, local_files_only=True)
    model.eval()
    _loaded = model
    return model
