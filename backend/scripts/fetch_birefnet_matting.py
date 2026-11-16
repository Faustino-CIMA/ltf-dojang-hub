"""Download the full BiRefNet matting weights and refuse a file that does not match."""

import hashlib
import os
import sys
import urllib.request

URL = "https://huggingface.co/ZhengPeng7/BiRefNet-matting/resolve/main/model.safetensors"
SHA256 = "a9875de5b1e6c8eb5fdaa8c727a82927ce442cdc87ba3abee6a77e6fa46c25bb"
SIZE = 884878856


def sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    dest_dir = sys.argv[1] if len(sys.argv) > 1 else "/opt/birefnet-matting"
    os.makedirs(dest_dir, exist_ok=True)
    dest = os.path.join(dest_dir, "model.safetensors")
    if os.path.isfile(dest) and os.path.getsize(dest) == SIZE and sha256(dest) == SHA256:
        return
    partial = dest + ".partial"
    urllib.request.urlretrieve(URL, partial)
    if os.path.getsize(partial) != SIZE or sha256(partial) != SHA256:
        os.remove(partial)
        raise SystemExit("BiRefNet matting weights failed the size or SHA-256 check.")
    os.replace(partial, dest)


if __name__ == "__main__":
    main()
