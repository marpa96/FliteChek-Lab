#!/bin/bash
cd "$(dirname "$0")"
python3 scripts/serve.py
echo
read -r -p 'Press Return to close this window.'
