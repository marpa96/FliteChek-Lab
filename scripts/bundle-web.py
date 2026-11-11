#!/usr/bin/env python3
"""Compatibility entry point: validate and package the catalog library."""
from pathlib import Path
import subprocess
root=Path(__file__).resolve().parents[1]
subprocess.run(['node',str(root/'scripts/package-library.mjs')],cwd=root,check=True)
